/**
 * Compare per-GP rate + SIG/PLA/QVIS after FORINT (NCYCLE 0..2) between
 * live OpenRadioss dumps (`wmbd_gpsig_N.f64bin` from patched s8eforc3.F)
 * and web-mbd TS at the same mid-cycle X/V.
 *
 *   OPENRADIOSS_PATH=... pnpm exec tsx scripts/gpsig-forint-probe.ts
 */
import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  readFileSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import {
  createHexGpStates,
  gatherHex,
  hexInternalForces,
  hexLumpedNodalMass,
  hierarchicalGpGeometry,
  s8edefo3Rates,
} from "../src/fe/hex.js";
import { applyRigidWallKinematic } from "../src/fe/contactWall.js";
import { exportTaylorRadiossDecks, formatRadiossF20 } from "../src/oracle/exportRadioss.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import type { ModelIR } from "../ir/types.js";
import type { J2State } from "../src/fe/materialJ2.js";

const fixedDt = 2.5e-8;
const LIVE_DIR = "/tmp/or-gpsig-probe";
const OUT_JSON = "docs/research/gpsig-forint-probe.json";

type GpRec = {
  eid: number; // 1-based Radioss element index
  ir: number;
  is: number;
  it: number;
  ip: number;
  d: Float64Array; // DXX,DYY,DZZ,D4,D5,D6 (Radioss engineering shear)
  sig: Float64Array;
  pla: number;
  qvis: number;
  epsd: number;
  vol: number;
  rho: number;
  amu: number;
  eint: number;
};

function f20(v: number): string {
  return formatRadiossF20(v);
}

function countDiffs(a: FloatLike, b: FloatLike) {
  let n = 0;
  let maxAbs = 0;
  let maxI = -1;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (Object.is(a[i], b[i])) continue;
    n++;
    const d = Math.abs(Number(a[i]) - Number(b[i]));
    if (d > maxAbs) {
      maxAbs = d;
      maxI = i;
    }
  }
  return { n, maxAbs, maxI };
}

type FloatLike = ArrayLike<number>;

/** Parse wmbd_gpsig_N.f64bin */
function parseGpSig(buf: Buffer): { ncycle: number; nel: number; nptr: number; npts: number; nptt: number; recs: GpRec[] } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const ncycle = view.getInt32(o, true); o += 4;
  const nel = view.getInt32(o, true); o += 4;
  const nptr = view.getInt32(o, true); o += 4;
  const npts = view.getInt32(o, true); o += 4;
  const nptt = view.getInt32(o, true); o += 4;
  // per rec: 5*i32 + 19*f64 = 20 + 152 = 172
  const recBytes = 5 * 4 + 19 * 8;
  const nRec = (buf.byteLength - o) / recBytes;
  if (!Number.isInteger(nRec)) throw new Error(`gpsig size ${buf.byteLength} leftover`);
  const recs: GpRec[] = [];
  for (let r = 0; r < nRec; r++) {
    const eid = view.getInt32(o, true); o += 4;
    const ir = view.getInt32(o, true); o += 4;
    const is = view.getInt32(o, true); o += 4;
    const it = view.getInt32(o, true); o += 4;
    const ip = view.getInt32(o, true); o += 4;
    const d = new Float64Array(6);
    for (let k = 0; k < 6; k++) {
      d[k] = view.getFloat64(o, true);
      o += 8;
    }
    const sig = new Float64Array(6);
    for (let k = 0; k < 6; k++) {
      sig[k] = view.getFloat64(o, true);
      o += 8;
    }
    const pla = view.getFloat64(o, true); o += 8;
    const qvis = view.getFloat64(o, true); o += 8;
    const epsd = view.getFloat64(o, true); o += 8;
    const vol = view.getFloat64(o, true); o += 8;
    const rho = view.getFloat64(o, true); o += 8;
    const amu = view.getFloat64(o, true); o += 8;
    const eint = view.getFloat64(o, true); o += 8;
    recs.push({ eid, ir, is, it, ip, d, sig, pla, qvis, epsd, vol, rho, amu, eint });
  }
  return { ncycle, nel, nptr, npts, nptt, recs };
}

function makeModel(): ModelIR {
  const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
  m.controls.endTime = fixedDt * 3;
  m.controls.runToEnd = true;
  m.controls.fixedDt = fixedDt;
  m.controls.adaptiveDt = false;
  return m;
}

/** Impact-face hexes: any corner node with z≈0. */
function impactFaceHexes(model: ModelIR): number[] {
  const z0 = model.wall.point[2];
  const out: number[] = [];
  const nHex = model.mesh.hexes.length / 8;
  for (let e = 0; e < nHex; e++) {
    let hit = false;
    for (let a = 0; a < 8; a++) {
      const n = model.mesh.hexes[e * 8 + a]!;
      if (Math.abs(model.mesh.coords[n * 3 + 2]! - z0) < 1e-15) hit = true;
    }
    if (hit) out.push(e);
  }
  return out;
}

type TsGp = {
  eid: number;
  ip: number;
  dEng: Float64Array; // Radioss-convention D (shear×2)
  sig: Float64Array;
  pla: number;
  qvis: number;
  vol: number;
  amu: number;
};

/**
 * Run TS CD with cold DT1=0; after each FORINT (before wall), snapshot per-GP
 * rates (pre-update) and SIG (post-update) by instrumenting hexInternalForces.
 */
function runTsGpSnaps(model: ModelIR): TsGp[][] {
  const nNodes = model.mesh.coords.length / 3;
  const nHex = model.mesh.hexes.length / 8;
  const x = Float64Array.from(model.mesh.coords);
  const v = new Float64Array(nNodes * 3);
  for (let a = 0; a < nNodes; a++) {
    v[a * 3] = model.initialVelocity[0];
    v[a * 3 + 1] = model.initialVelocity[1];
    v[a * 3 + 2] = model.initialVelocity[2];
  }
  const masses = new Float64Array(nNodes);
  const xScratch = new Float64Array(24);
  const vScratch = new Float64Array(24);
  const fHex = new Float64Array(24);
  const hexConn: number[][] = [];
  const hexStates: J2State[][] = [];
  for (let e = 0; e < nHex; e++) {
    const conn = Array.from(model.mesh.hexes.slice(e * 8, e * 8 + 8));
    hexConn.push(conn);
    gatherHex(x, conn, xScratch);
    const m = hexLumpedNodalMass(xScratch, model.material.density);
    for (let ai = 0; ai < 8; ai++) masses[conn[ai]!]! += m[ai]!;
    hexStates.push(createHexGpStates(Float64Array.from(xScratch)));
  }

  const f = new Float64Array(nNodes * 3);
  const acc = new Float64Array(nNodes * 3);
  let dt = fixedDt;
  let dt1 = 0;
  let t = 0;
  let step = 0;
  const perCycle: TsGp[][] = [];

  // Capture rates+SIG by monkey-patching via a custom assemble that mirrors hex.ts
  // We call hexInternalForces then read states; rates need a parallel capture.
  // Import internal rate by re-running a thin probe per element after assemble
  // using the same X,V (states already advanced — so capture DURING force).

  while (t < model.controls.endTime - 1e-18 && step < 3) {
    const cycleGps: TsGp[] = [];
    f.fill(0);
    for (let e = 0; e < nHex; e++) {
      const conn = hexConn[e]!;
      gatherHex(x, conn, xScratch);
      gatherHex(v, conn, vScratch);
      const snap = captureHexGp(xScratch, vScratch, hexStates[e]!, model, dt1);
      for (const g of snap) {
        cycleGps.push({ eid: e + 1, ...g });
      }
      hexInternalForces({
        x: xScratch,
        v: vScratch,
        states: hexStates[e]!,
        mat: model.material,
        dt: dt1,
        fOut: fHex,
        options: { jcvt: 0 },
        elementIndex: e,
      });
      for (let ai = 0; ai < 8; ai++) {
        const n = conn[ai]!;
        f[n * 3]! -= fHex[ai * 3]!;
        f[n * 3 + 1]! -= fHex[ai * 3 + 1]!;
        f[n * 3 + 2]! -= fHex[ai * 3 + 2]!;
      }
    }
    // Problem: captureHexGp before hexInternalForces duplicates update if capture updates.
    // captureHexGp must be read-only clone. Fix below.
    perCycle.push(cycleGps);

    for (let i = 0; i < nNodes; i++) {
      acc[i * 3] = f[i * 3]! / masses[i]!;
      acc[i * 3 + 1] = f[i * 3 + 1]! / masses[i]!;
      acc[i * 3 + 2] = f[i * 3 + 2]! / masses[i]!;
    }
    dt = fixedDt;
    const dt12 = 0.5 * (dt1 + dt);
    applyRigidWallKinematic({
      wall: model.wall,
      coords: x,
      velocities: v,
      accelerations: acc,
      dt,
      dt12,
    });
    for (let i = 0; i < v.length; i++) v[i]! += dt12 * acc[i]!;
    for (let i = 0; i < x.length; i++) x[i]! += dt * v[i]!;
    t += dt;
    step += 1;
    dt1 = dt;
  }
  return perCycle;
}

/**
 * Clone-state force eval that returns per-GP Radioss-convention D and post-update SIG.
 * Does not mutate the caller's states — caller still runs hexInternalForces.
 */
function captureHexGp(
  x: Float64Array,
  v: Float64Array,
  states: J2State[],
  model: ModelIR,
  dt: number,
): Omit<TsGp, "eid">[] {
  const cloned = states.map((s) => ({
    stress: s.stress.slice(),
    eqPlasticStrain: s.eqPlasticStrain,
    vol0: s.vol0,
  }));
  // Re-implement rate extraction by calling hexInternalForces on clone, then
  // also need rates — use a local duplicate of the rate loop from hex.ts.
  const G = 0.577350269189625;
  const RADIOSS_GAUSS: [number, number, number][] = [
    [-G, -G, -G],
    [G, -G, -G],
    [-G, G, -G],
    [G, G, -G],
    [-G, -G, G],
    [G, -G, G],
    [-G, G, G],
    [G, G, G],
  ];
  const CORNERS: [number, number, number][] = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ];
  const out: Omit<TsGp, "eid">[] = [];
  // Call hexInternalForces on clone to get post SIG; compute D in parallel.
  const fOut = new Float64Array(24);
  // Hierarchical GradN + VOL (same as FORINT / live S8E).
  const rates: Float64Array[] = [];
  const vols: number[] = [];
  const hier = hierarchicalGpGeometry(x);
  for (let gp = 0; gp < 8; gp++) {
    const { gN, vol } = hier[gp]!;
    const { d: dEng } = s8edefo3Rates(gN, v);
    rates.push(dEng);
    vols.push(vol);
  }

  hexInternalForces({
    x,
    v,
    states: cloned,
    mat: model.material,
    dt,
    fOut,
    options: { jcvt: 0 },
  });

  for (let gp = 0; gp < 8; gp++) {
    const amu = cloned[gp]!.vol0 / Math.max(vols[gp]!, 1e-30) - 1;
    out.push({
      ip: gp + 1,
      dEng: rates[gp]!,
      sig: cloned[gp]!.stress.slice(),
      pla: cloned[gp]!.eqPlasticStrain,
      qvis: 0, // qa=qb=0 default
      vol: vols[gp]!,
      amu,
    });
  }
  return out;
}

function runLive(model: ModelIR, workDir: string) {
  const decks = exportTaylorRadiossDecks(model);
  const engine = `#RADIOSS ENGINE
/RUN/${decks.root}/1
${f20(model.controls.endTime)}
/DTIX
${f20(fixedDt)}${f20(fixedDt)}
/DT
${f20(1.0)}${f20(0)}
/ANIM/DT
${f20(0)}${f20(model.controls.endTime)}
/ANIM/NODA/DT
/STATE/DT/ALL
${f20(model.controls.endTime)}${f20(model.controls.endTime)}
/PRINT/-1/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;
  mkdirSync(workDir, { recursive: true });
  for (const f of readdirSync(workDir)) {
    try {
      unlinkSync(join(workDir, f));
    } catch {
      /* */
    }
  }
  writeFileSync(join(workDir, `${decks.root}_0000.rad`), decks.starter);
  writeFileSync(join(workDir, `${decks.root}_0001.rad`), engine);
  const orPath = process.env["OPENRADIOSS_PATH"]!;
  const env = {
    ...process.env,
    RAD_CFG_PATH: join(orPath, "hm_cfg_files"),
    RAD_H3D_PATH: join(orPath, "extlib/h3d/lib/linux64"),
    OMP_STACKSIZE: "400m",
    OMP_NUM_THREADS: "1",
    LD_LIBRARY_PATH: [
      join(orPath, "extlib/hm_reader/linux64"),
      join(orPath, "extlib/h3d/lib/linux64"),
      process.env["LD_LIBRARY_PATH"] ?? "",
    ].join(":"),
  };
  let r = spawnSync(
    join(orPath, "exec/starter_linux64_gf"),
    ["-i", join(workDir, `${decks.root}_0000.rad`), "-np", "1", "-nt", "1"],
    { cwd: workDir, env, encoding: "utf8", maxBuffer: 32 << 20 },
  );
  if (r.status !== 0) throw new Error(`starter: ${(r.stdout ?? "").slice(-800)}`);
  r = spawnSync(join(orPath, "exec/engine_linux64_gf"), ["-i", join(workDir, `${decks.root}_0001.rad`), "-nt", "1"], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 32 << 20,
  });
  if (r.status !== 0) throw new Error(`engine: ${(r.stdout ?? "").slice(-800)}`);
}

function cmpVec(label: string, ours: FloatLike, live: FloatLike) {
  const d = countDiffs(ours, live);
  let maxRel = 0;
  for (let i = 0; i < ours.length; i++) {
    const o = Number(ours[i]),
      l = Number(live[i]);
    const rel = Math.abs(o - l) / Math.max(Math.abs(l), 1e-30);
    if (rel > maxRel) maxRel = rel;
  }
  return { label, ...d, maxRel, bitwise: d.n === 0 };
}

if (!process.env["OPENRADIOSS_PATH"]) {
  console.error("OPENRADIOSS_PATH required");
  process.exit(2);
}

const model = makeModel();
const impact = impactFaceHexes(model);
const tsCycles = runTsGpSnaps(model);
runLive(model, LIVE_DIR);

mkdirSync("docs/research/gpsig-dumps", { recursive: true });
const report: Record<string, unknown> = {
  note: "Per-GP D (Radioss eng. shear) + SIG/PLA/QVIS/AMU after FORINT; impact-face hexes focus",
  impactFaceHexEids: impact.map((e) => e + 1),
  cycles: [] as unknown[],
};

for (const ncycle of [0, 1, 2]) {
  const path = join(LIVE_DIR, `wmbd_gpsig_${ncycle}.f64bin`);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  copyFileSync(path, join("docs/research/gpsig-dumps", `wmbd_gpsig_${ncycle}.f64bin`));
  const live = parseGpSig(readFileSync(path));
  const ts = tsCycles[ncycle]!;

  // Index live by eid|ip
  const liveMap = new Map<string, GpRec>();
  for (const r of live.recs) liveMap.set(`${r.eid}|${r.ip}`, r);
  const tsMap = new Map<string, TsGp>();
  for (const r of ts) tsMap.set(`${r.eid}|${r.ip}`, r);

  const keys = [...liveMap.keys()].sort();
  const fieldStats = (pick: (L: GpRec, T: TsGp) => { o: FloatLike; l: FloatLike; name: string }) => {
    let n = 0,
      maxAbs = 0,
      maxRel = 0,
      maxKey = "",
      firstDiff: unknown = null;
    const impactOnly = { n: 0, maxAbs: 0, maxRel: 0, maxKey: "" };
    for (const k of keys) {
      const L = liveMap.get(k)!;
      const T = tsMap.get(k);
      if (!T) continue;
      const { o, l, name } = pick(L, T);
      for (let i = 0; i < o.length; i++) {
        if (Object.is(o[i], l[i])) continue;
        n++;
        const abs = Math.abs(Number(o[i]) - Number(l[i]));
        const rel = abs / Math.max(Math.abs(Number(l[i])), 1e-30);
        if (abs > maxAbs) {
          maxAbs = abs;
          maxRel = rel;
          maxKey = `${k}.${name}[${i}]`;
          if (!firstDiff) {
            firstDiff = { key: k, i, ours: o[i], live: l[i], abs, rel };
          }
        }
        const eid = L.eid;
        if (impact.includes(eid - 1)) {
          impactOnly.n++;
          if (abs > impactOnly.maxAbs) {
            impactOnly.maxAbs = abs;
            impactOnly.maxRel = rel;
            impactOnly.maxKey = `${k}.${name}[${i}]`;
          }
        }
      }
    }
    return { n, maxAbs, maxRel, maxKey, firstDiff, impactOnly };
  };

  const dCmp = fieldStats((L, T) => ({ o: T.dEng, l: L.d, name: "D" }));
  const sigCmp = fieldStats((L, T) => ({ o: T.sig, l: L.sig, name: "SIG" }));
  const plaCmp = fieldStats((L, T) => ({
    o: [T.pla],
    l: [L.pla],
    name: "PLA",
  }));
  const qvisCmp = fieldStats((L, T) => ({
    o: [T.qvis],
    l: [L.qvis],
    name: "QVIS",
  }));
  const amuCmp = fieldStats((L, T) => ({
    o: [T.amu],
    l: [L.amu],
    name: "AMU",
  }));
  const volCmp = fieldStats((L, T) => ({
    o: [T.vol],
    l: [L.vol],
    name: "VOL",
  }));

  // Sample impact-face hex eid=1 (first), all GPs
  const sampleEid = impact[0]! + 1;
  const sample = [1, 2, 3, 4, 5, 6, 7, 8].map((ip) => {
    const L = liveMap.get(`${sampleEid}|${ip}`)!;
    const T = tsMap.get(`${sampleEid}|${ip}`)!;
    return {
      ip,
      d: cmpVec("D", T.dEng, L.d),
      sig: cmpVec("SIG", T.sig, L.sig),
      pla: { ours: T.pla, live: L.pla, objectIs: Object.is(T.pla, L.pla), abs: Math.abs(T.pla - L.pla) },
      qvis: { ours: T.qvis, live: L.qvis, objectIs: Object.is(T.qvis, L.qvis), abs: Math.abs(T.qvis - L.qvis) },
      amu: { ours: T.amu, live: L.amu, objectIs: Object.is(T.amu, L.amu), abs: Math.abs(T.amu - L.amu) },
      liveD: [...L.d],
      tsD: [...T.dEng],
      liveSig: [...L.sig],
      tsSig: [...T.sig],
    };
  });

  (report.cycles as unknown[]).push({
    ncycle,
    nLiveRecs: live.recs.length,
    nTsRecs: ts.length,
    D: dCmp,
    SIG: sigCmp,
    PLA: plaCmp,
    QVIS: qvisCmp,
    AMU: amuCmp,
    VOL: volCmp,
    sampleImpactHex: { eid: sampleEid, gps: sample },
  });
}

writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
const summary = (report.cycles as Array<Record<string, unknown>>).map((c) => ({
  ncycle: c.ncycle,
  D: c.D,
  SIG: c.SIG,
  PLA: c.PLA,
  QVIS: c.QVIS,
  AMU: c.AMU,
}));
console.log(JSON.stringify({ wrote: OUT_JSON, impact, summary }, null, 2));
