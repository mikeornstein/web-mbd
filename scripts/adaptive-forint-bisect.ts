/**
 * Mid-run FORINT bisect under adaptive Δt (coarse 2×2×4).
 * Uses live DT schedule + extended dumps (NCYCLE≤9):
 *   wmbd_postaccele_N / wmbd_postwall_N / wmbd_gpsig_N
 *
 * Finds the first field that loses Object.is while DT still matches.
 *
 *   OPENRADIOSS_PATH=... pnpm exec tsx scripts/adaptive-forint-bisect.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
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
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import type { J2State } from "../src/fe/materialJ2.js";

const LIVE_DIR = process.env["ADAPTIVE_DUMP_DIR"] ?? "/tmp/or-adaptive-dt-2x4";
const OUT_JSON = "docs/research/adaptive-forint-bisect.json";
const OUT_DIR = "docs/research/adaptive-dumps";
const MAX_CYCLE = 9;
const DT_REC = 4 + 8 + 8;

type FieldStat = {
  n: number;
  maxAbs: number;
  bitwise: boolean;
  first?: { i: number; ours: number; live: number; abs: number };
};

function countDiffs(a: ArrayLike<number>, b: ArrayLike<number>): FieldStat {
  let n = 0;
  let maxAbs = 0;
  let first: FieldStat["first"];
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (Object.is(a[i], b[i])) continue;
    n++;
    const abs = Math.abs(Number(a[i]) - Number(b[i]));
    if (abs >= maxAbs) maxAbs = abs;
    if (!first) first = { i, ours: Number(a[i]), live: Number(b[i]), abs };
  }
  return { n, maxAbs, bitwise: n === 0, first };
}

function parseDt(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rows: { ncycle: number; tt: number; dt2: number }[] = [];
  for (let i = 0; i < buf.byteLength / DT_REC; i++) {
    const off = i * DT_REC;
    rows.push({
      ncycle: view.getInt32(off, true),
      tt: view.getFloat64(off + 4, true),
      dt2: view.getFloat64(off + 12, true),
    });
  }
  return rows;
}

function parseAvDump(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const ncycle = view.getInt32(o, true);
  o += 4;
  const numnod = view.getInt32(o, true);
  o += 4;
  const dt1 = view.getFloat64(o, true);
  o += 8;
  const dt2 = view.getFloat64(o, true);
  o += 8;
  const dt12 = view.getFloat64(o, true);
  o += 8;
  const a = new Float64Array(numnod * 3);
  const v = new Float64Array(numnod * 3);
  const x = new Float64Array(numnod * 3);
  const ms = new Float64Array(numnod);
  const ids = new Int32Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4;
    for (let k = 0; k < 3; k++) {
      a[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    for (let k = 0; k < 3; k++) {
      v[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    for (let k = 0; k < 3; k++) {
      x[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    ms[i] = view.getFloat64(o, true);
    o += 8;
  }
  // Sort by ITAB so compare is ID-aligned with web-mbd node order (1..N).
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  const as = new Float64Array(numnod * 3);
  const vs = new Float64Array(numnod * 3);
  const xs = new Float64Array(numnod * 3);
  const mss = new Float64Array(numnod);
  for (let ni = 0; ni < numnod; ni++) {
    const i = order[ni]!;
    as.set(a.subarray(i * 3, i * 3 + 3), ni * 3);
    vs.set(v.subarray(i * 3, i * 3 + 3), ni * 3);
    xs.set(x.subarray(i * 3, i * 3 + 3), ni * 3);
    mss[ni] = ms[i]!;
  }
  return { ncycle, numnod, dt1, dt2, dt12, a: as, v: vs, x: xs, ms: mss };
}

/** Taylor LAW2 ρ₀ — dump writes LBUF%VOL(=VOLO) and cleared AMU; recover VOLN/AMU from RHO. */
const RHO0 = 8930;

function parseGpSig(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const ncycle = view.getInt32(o, true);
  o += 4;
  const nel = view.getInt32(o, true);
  o += 4;
  o += 12; // nptr,npts,nptt
  const recBytes = 5 * 4 + 19 * 8;
  const nRec = (buf.byteLength - o) / recBytes;
  const byKey = new Map<
    string,
    { d: Float64Array; sig: Float64Array; pla: number; qvis: number; vol: number; rho: number; amu: number }
  >();
  for (let r = 0; r < nRec; r++) {
    const eid = view.getInt32(o, true);
    o += 4;
    const ir = view.getInt32(o, true);
    o += 4;
    const is = view.getInt32(o, true);
    o += 4;
    const it = view.getInt32(o, true);
    o += 4;
    const ip = view.getInt32(o, true);
    o += 4;
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
    const pla = view.getFloat64(o, true);
    o += 8;
    const qvis = view.getFloat64(o, true);
    o += 8;
    o += 8; // epsd
    const vol0 = view.getFloat64(o, true);
    o += 8;
    const rho = view.getFloat64(o, true);
    o += 8;
    o += 8; // dumped AMU is cleared after mmain — ignore
    o += 8; // eint
    const amu = rho / RHO0 - 1;
    const vol = vol0 * (RHO0 / rho);
    byKey.set(`${eid}|${ip}`, { d, sig, pla, qvis, vol, rho, amu });
  }
  return { ncycle, nel, byKey };
}

type Snap = {
  ncycle: number;
  dt1: number;
  dt2: number;
  dt12: number;
  a: Float64Array;
  v: Float64Array;
  x: Float64Array;
  gp: Map<
    string,
    { d: Float64Array; sig: Float64Array; pla: number; qvis: number; vol: number; amu: number }
  >;
};

function runTsWithSchedule(sched: number[], nCycles: number): Snap[] {
  const model = createTaylorBarModel({ nSide: 2, nZ: 4 });
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
  let dt1 = 0;
  const snaps: Snap[] = [];

  for (let step = 0; step < nCycles; step++) {
    const dt = sched[step]!;
    f.fill(0);
    const gpMap = new Map<
      string,
      { d: Float64Array; sig: Float64Array; pla: number; qvis: number; vol: number; amu: number }
    >();

    for (let e = 0; e < nHex; e++) {
      const conn = hexConn[e]!;
      gatherHex(x, conn, xScratch);
      gatherHex(v, conn, vScratch);
      const states = hexStates[e]!;
      // Capture D before constitutive (rates from current X/V).
      const hier = hierarchicalGpGeometry(xScratch);
      const dBefore: Float64Array[] = [];
      const volBefore: number[] = [];
      for (let gp = 0; gp < 8; gp++) {
        const { gN, vol } = hier[gp]!;
        dBefore.push(s8edefo3Rates(gN, vScratch).d);
        volBefore.push(vol);
      }
      hexInternalForces({
        x: xScratch,
        v: vScratch,
        states,
        mat: model.material,
        dt: dt1,
        fOut: fHex,
        options: { jcvt: 0 },
        elementIndex: e,
      });
      for (let gp = 0; gp < 8; gp++) {
        const vol0 = states[gp]!.vol0;
        const vol = volBefore[gp]!;
        const amu =
          (model.material.density * (vol0 / Math.max(vol, 1e-30))) / model.material.density - 1;
        // Radioss IP = IR + ((IS-1)+(IT-1)*NPTS)*NPTR with IR/IS/IT 1-based.
        // Our gp is 0-based in RADIOSS_GAUSS order (ξ-fastest) = ip-1.
        gpMap.set(`${e + 1}|${gp + 1}`, {
          d: dBefore[gp]!,
          sig: states[gp]!.stress.slice(),
          pla: states[gp]!.eqPlasticStrain,
          qvis: 0,
          vol,
          amu,
        });
      }
      for (let ai = 0; ai < 8; ai++) {
        const n = conn[ai]!;
        f[n * 3]! -= fHex[ai * 3]!;
        f[n * 3 + 1]! -= fHex[ai * 3 + 1]!;
        f[n * 3 + 2]! -= fHex[ai * 3 + 2]!;
      }
    }
    for (let i = 0; i < nNodes; i++) {
      const rtmp = 1 / masses[i]!;
      acc[i * 3] = f[i * 3]! * rtmp;
      acc[i * 3 + 1] = f[i * 3 + 1]! * rtmp;
      acc[i * 3 + 2] = f[i * 3 + 2]! * rtmp;
    }
    const dt12 = 0.5 * (dt1 + dt);
    snaps.push({
      ncycle: step,
      dt1,
      dt2: dt,
      dt12,
      a: acc.slice(),
      v: v.slice(),
      x: scrubNearZeros(x.slice()),
      gp: gpMap,
    });

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
    dt1 = dt;
  }
  return snaps;
}

function flattenGp(
  map: Map<string, { d: Float64Array; sig: Float64Array; pla: number; vol: number; amu: number }>,
  field: "d" | "sig" | "pla" | "vol" | "amu",
): Float64Array {
  const keys = [...map.keys()].sort((a, b) => {
    const [ae, ai] = a.split("|").map(Number);
    const [be, bi] = b.split("|").map(Number);
    return ae! - be! || ai! - bi!;
  });
  if (field === "d" || field === "sig") {
    const out = new Float64Array(keys.length * 6);
    for (let i = 0; i < keys.length; i++) {
      out.set(map.get(keys[i]!)![field], i * 6);
    }
    return out;
  }
  const out = new Float64Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    out[i] = map.get(keys[i]!)![field] as number;
  }
  return out;
}

if (!existsSync(join(LIVE_DIR, "TAYLOR_dt.f64bin"))) {
  throw new Error(`missing ${LIVE_DIR}/TAYLOR_dt.f64bin — run compare-adaptive-dt.ts first`);
}
const liveRows = parseDt(readFileSync(join(LIVE_DIR, "TAYLOR_dt.f64bin")));
const sched = liveRows.map((r) => r.dt2);
const ts = runTsWithSchedule(sched, MAX_CYCLE + 1);

mkdirSync(OUT_DIR, { recursive: true });
const cycles: unknown[] = [];
let firstBreak: { cycle: number; field: string; detail: FieldStat } | null = null;

for (let c = 0; c <= MAX_CYCLE; c++) {
  const paPath = join(LIVE_DIR, `wmbd_postaccele_${c}.f64bin`);
  const gpPath = join(LIVE_DIR, `wmbd_gpsig_${c}.f64bin`);
  if (!existsSync(paPath) || !existsSync(gpPath)) {
    cycles.push({ ncycle: c, missing: true });
    continue;
  }
  copyFileSync(paPath, join(OUT_DIR, `wmbd_postaccele_${c}.f64bin`));
  copyFileSync(gpPath, join(OUT_DIR, `wmbd_gpsig_${c}.f64bin`));

  const liveA = parseAvDump(readFileSync(paPath));
  const liveGp = parseGpSig(readFileSync(gpPath));
  const ours = ts[c]!;

  const dtMatch = {
    dt1: Object.is(ours.dt1, liveA.dt1),
    dt2: Object.is(ours.dt2, liveA.dt2),
    dt12: Object.is(ours.dt12, liveA.dt12),
    ours: { dt1: ours.dt1, dt2: ours.dt2, dt12: ours.dt12 },
    live: { dt1: liveA.dt1, dt2: liveA.dt2, dt12: liveA.dt12 },
  };

  // Align live GP map keys to our eid|ip (already 1-based).
  const liveFlat = {
    d: flattenGp(liveGp.byKey as never, "d"),
    sig: flattenGp(liveGp.byKey as never, "sig"),
    pla: flattenGp(liveGp.byKey as never, "pla"),
    vol: flattenGp(liveGp.byKey as never, "vol"),
    amu: flattenGp(liveGp.byKey as never, "amu"),
  };
  const oursFlat = {
    d: flattenGp(ours.gp as never, "d"),
    sig: flattenGp(ours.gp as never, "sig"),
    pla: flattenGp(ours.gp as never, "pla"),
    vol: flattenGp(ours.gp as never, "vol"),
    amu: flattenGp(ours.gp as never, "amu"),
  };

  const fields: Record<string, FieldStat> = {
    A: countDiffs(ours.a, liveA.a),
    V: countDiffs(ours.v, liveA.v),
    X: countDiffs(ours.x, scrubNearZeros(liveA.x)),
    D: countDiffs(oursFlat.d, liveFlat.d),
    SIG: countDiffs(oursFlat.sig, liveFlat.sig),
    PLA: countDiffs(oursFlat.pla, liveFlat.pla),
    VOL: countDiffs(oursFlat.vol, liveFlat.vol),
    AMU: countDiffs(oursFlat.amu, liveFlat.amu),
  };

  const order = ["D", "VOL", "AMU", "SIG", "PLA", "A", "V", "X"] as const;
  for (const name of order) {
    if (!fields[name]!.bitwise && !firstBreak && dtMatch.dt1 && dtMatch.dt2) {
      firstBreak = { cycle: c, field: name, detail: fields[name]! };
    }
  }

  cycles.push({
    ncycle: c,
    dtMatch,
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [
        k,
        { n: v.n, maxAbs: v.maxAbs, bitwise: v.bitwise, first: v.first },
      ]),
    ),
  });
}

const report = {
  note: "Adaptive FORINT bisect vs live dumps under live DT schedule (coarse 2×2×4)",
  liveDir: LIVE_DIR,
  maxCycle: MAX_CYCLE,
  dt0ObjectIs: Object.is(sched[0], liveRows[0]!.dt2),
  firstBreak,
  cycles,
};
writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ wrote: OUT_JSON, firstBreak, summary: cycles.map((c: any) => ({
  ncycle: c.ncycle,
  dt: c.dtMatch && c.dtMatch.dt1 && c.dtMatch.dt2 && c.dtMatch.dt12,
  bits: c.fields && Object.fromEntries(Object.entries(c.fields).map(([k, v]: any) => [k, v.bitwise])),
  maxA: c.fields?.A?.maxAbs,
  maxSIG: c.fields?.SIG?.maxAbs,
  maxD: c.fields?.D?.maxAbs,
})) }, null, 2));
