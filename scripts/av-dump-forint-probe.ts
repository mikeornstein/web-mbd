/**
 * Compare nodal A/V/X after ACCELE (post-FORINT) and after RGWALL between
 * web-mbd TS and live OpenRadioss dumps from patched resol.F:
 *   wmbd_postaccele_{0,1,2}.f64bin
 *   wmbd_postwall_{0,1,2}.f64bin
 *
 *   OPENRADIOSS_PATH=... pnpm exec tsx scripts/av-dump-forint-probe.ts
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import {
  createHexGpStates,
  gatherHex,
  hexInternalForces,
  hexLumpedNodalMass,
} from "../src/fe/hex.js";
import { applyRigidWallKinematic } from "../src/fe/contactWall.js";
import { exportTaylorRadiossDecks, formatRadiossF20 } from "../src/oracle/exportRadioss.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import type { ModelIR } from "../ir/types.js";
import type { J2State } from "../src/fe/materialJ2.js";

const fixedDt = 2.5e-8;
const nSide = 2;
const nZ = 4;
const INTEREST = [0, 4, 8, 18, 20, 24, 26];
const OUT_JSON = "docs/research/av-dump-forint-probe.json";
const LIVE_DIR = "/tmp/or-av-dump-probe";

function f20(v: number): string {
  return formatRadiossF20(v);
}

function countDiffs(a: Float64Array, b: Float64Array) {
  let n = 0;
  let maxAbs = 0;
  let maxI = -1;
  for (let i = 0; i < a.length; i++) {
    if (Object.is(a[i], b[i])) continue;
    n++;
    const d = Math.abs(a[i]! - b[i]!);
    if (d > maxAbs) {
      maxAbs = d;
      maxI = i;
    }
  }
  return { n, maxAbs, maxI, maxNode: maxI >= 0 ? Math.floor(maxI / 3) : null };
}

function firstDiffs(
  ours: Float64Array,
  live: Float64Array,
  kind: "xyz" | "scalar" = "xyz",
  limit = 8,
) {
  const out: { i: number; node: number | null; dof: string; ours: number; live: number; abs: number }[] =
    [];
  const names = ["x", "y", "z"];
  for (let i = 0; i < ours.length; i++) {
    if (Object.is(ours[i], live[i])) continue;
    out.push({
      i,
      node: kind === "xyz" ? Math.floor(i / 3) : null,
      dof: kind === "xyz" ? names[i % 3]! : String(i),
      ours: ours[i]!,
      live: live[i]!,
      abs: Math.abs(ours[i]! - live[i]!),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Layout from patched resol.F dump. */
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
  // per node: i32 itab + 3*a + 3*v + 3*x + ms = 4 + 10*8 = 84
  const rec = 4 + 10 * 8;
  const expect = 4 + 4 + 24 + numnod * rec;
  if (buf.byteLength !== expect) {
    throw new Error(`av dump size ${buf.byteLength} != expected ${expect} (numnod=${numnod})`);
  }
  const ids = new Int32Array(numnod);
  const a = new Float64Array(numnod * 3);
  const v = new Float64Array(numnod * 3);
  const x = new Float64Array(numnod * 3);
  const ms = new Float64Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4;
    a[i * 3] = view.getFloat64(o, true);
    o += 8;
    a[i * 3 + 1] = view.getFloat64(o, true);
    o += 8;
    a[i * 3 + 2] = view.getFloat64(o, true);
    o += 8;
    v[i * 3] = view.getFloat64(o, true);
    o += 8;
    v[i * 3 + 1] = view.getFloat64(o, true);
    o += 8;
    v[i * 3 + 2] = view.getFloat64(o, true);
    o += 8;
    x[i * 3] = view.getFloat64(o, true);
    o += 8;
    x[i * 3 + 1] = view.getFloat64(o, true);
    o += 8;
    x[i * 3 + 2] = view.getFloat64(o, true);
    o += 8;
    ms[i] = view.getFloat64(o, true);
    o += 8;
  }
  // Sort by ITAB into web-mbd index order (ITAB = 1..N → index 0..N-1).
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  const pack = (src: Float64Array, stride: number) => {
    const out = new Float64Array(src.length);
    for (let k = 0; k < order.length; k++) {
      const s = order[k]! * stride;
      const d = k * stride;
      for (let c = 0; c < stride; c++) out[d + c] = src[s + c]!;
    }
    return out;
  };
  return {
    ncycle,
    numnod,
    dt1,
    dt2,
    dt12,
    ids: Int32Array.from(order.map((i) => ids[i]!)),
    a: pack(a, 3),
    v: pack(v, 3),
    x: scrubNearZeros(pack(x, 3)),
    ms: pack(ms, 1),
  };
}

function makeModel(): ModelIR {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.endTime = fixedDt * 3;
  m.controls.runToEnd = true;
  m.controls.fixedDt = fixedDt;
  m.controls.adaptiveDt = false;
  return m;
}

type Snap = {
  ncycle: number;
  dt1: number;
  dt2: number;
  dt12: number;
  a: Float64Array;
  v: Float64Array;
  x: Float64Array;
  ms: Float64Array;
  nContact?: number;
};

/** Mirror resol CD with mid-cycle snapshots matching live dump points. */
function runTsSnaps(model: ModelIR): { postaccele: Snap[]; postwall: Snap[] } {
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
  // Live resol: cold DT1=0 on cycle 0; DT1←DT2 at start of later cycles.
  // DT2 is set from /DTIX before DT12=½(DT1+DT2). Do NOT seed DT1=DT2.
  let dt = fixedDt;
  let dt1 = 0;
  let t = 0;
  let step = 0;
  const postaccele: Snap[] = [];
  const postwall: Snap[] = [];
  const endOfStep: Snap[] = [];

  while (t < model.controls.endTime - 1e-18 && step < 3) {
    f.fill(0);
    for (let e = 0; e < nHex; e++) {
      const conn = hexConn[e]!;
      gatherHex(x, conn, xScratch);
      gatherHex(v, conn, vScratch);
      hexInternalForces({
        x: xScratch,
        v: vScratch,
        states: hexStates[e]!,
        mat: model.material,
        dt,
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
    for (let i = 0; i < nNodes; i++) {
      acc[i * 3] = f[i * 3]! / masses[i]!;
      acc[i * 3 + 1] = f[i * 3 + 1]! / masses[i]!;
      acc[i * 3 + 2] = f[i * 3 + 2]! / masses[i]!;
    }

    dt = fixedDt;
    const dt12 = 0.5 * (dt1 + dt);
    const ncycle = step; // live NCYCLE before end-of-cycle increment

    postaccele.push({
      ncycle,
      dt1,
      dt2: dt,
      dt12,
      a: acc.slice(),
      v: v.slice(),
      x: scrubNearZeros(x.slice()),
      ms: masses.slice(),
    });

    const wallHit = applyRigidWallKinematic({
      wall: model.wall,
      coords: x,
      velocities: v,
      accelerations: acc,
      dt,
      dt12,
    });

    postwall.push({
      ncycle,
      dt1,
      dt2: dt,
      dt12,
      a: acc.slice(),
      v: v.slice(),
      x: scrubNearZeros(x.slice()),
      ms: masses.slice(),
      nContact: wallHit.nContact,
    });

    for (let i = 0; i < v.length; i++) v[i]! += dt12 * acc[i]!;
    for (let i = 0; i < x.length; i++) x[i]! += dt * v[i]!;
    endOfStep.push({
      ncycle,
      dt1,
      dt2: dt,
      dt12,
      a: acc.slice(),
      v: v.slice(),
      x: scrubNearZeros(x.slice()),
      ms: masses.slice(),
      nContact: wallHit.nContact,
    });
    t += dt;
    step += 1;
    dt1 = dt; // next cycle: DT1 = previous DT2
  }

  return { postaccele, postwall, endOfStep };
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
  return workDir;
}

function cmpField(label: string, ours: Float64Array, live: Float64Array, kind: "xyz" | "scalar" = "xyz") {
  const d = countDiffs(ours, live);
  return {
    label,
    ...d,
    bitwise: d.n === 0,
    first: firstDiffs(ours, live, kind),
    interest:
      kind === "xyz"
        ? INTEREST.map((node) => ({
            node,
            ours: [ours[node * 3], ours[node * 3 + 1], ours[node * 3 + 2]],
            live: [live[node * 3], live[node * 3 + 1], live[node * 3 + 2]],
            objectIs: [
              Object.is(ours[node * 3], live[node * 3]),
              Object.is(ours[node * 3 + 1], live[node * 3 + 1]),
              Object.is(ours[node * 3 + 2], live[node * 3 + 2]),
            ],
          }))
        : undefined,
  };
}

function cmpSnap(phase: string, ts: Snap, live: ReturnType<typeof parseAvDump>) {
  return {
    phase,
    ncycle: ts.ncycle,
    dt: {
      ts: { dt1: ts.dt1, dt2: ts.dt2, dt12: ts.dt12 },
      live: { dt1: live.dt1, dt2: live.dt2, dt12: live.dt12 },
      objectIs: {
        dt1: Object.is(ts.dt1, live.dt1),
        dt2: Object.is(ts.dt2, live.dt2),
        dt12: Object.is(ts.dt12, live.dt12),
      },
    },
    a: cmpField("A", ts.a, live.a),
    v: cmpField("V", ts.v, live.v),
    x: cmpField("X", ts.x, live.x),
    ms: cmpField("MS", ts.ms, live.ms, "scalar"),
    nContact: ts.nContact,
  };
}

if (!process.env["OPENRADIOSS_PATH"]) {
  console.error("OPENRADIOSS_PATH required");
  process.exit(2);
}

const model = makeModel();
const ts = runTsSnaps(model);
runLive(model, LIVE_DIR);

const report: Record<string, unknown> = {
  note:
    "TS vs live nodal A/V/X after ACCELE and after RGWALL; NCYCLE 0..2 = web steps 1..3. " +
    "TS now uses live cold-start DT1=0 (DT12=DT2/2 on cycle 0).",
  dumpFiles: readdirSync(LIVE_DIR)
    .filter((f) => f.startsWith("wmbd_"))
    .sort(),
  cycles: [] as unknown[],
  endOfStepX: [] as unknown[],
};

for (const ncycle of [0, 1, 2]) {
  const pa = join(LIVE_DIR, `wmbd_postaccele_${ncycle}.f64bin`);
  const pw = join(LIVE_DIR, `wmbd_postwall_${ncycle}.f64bin`);
  if (!existsSync(pa) || !existsSync(pw)) {
    throw new Error(`missing dumps for NCYCLE=${ncycle}: ${pa} / ${pw}`);
  }
  const liveA = parseAvDump(readFileSync(pa));
  const liveW = parseAvDump(readFileSync(pw));
  const tsA = ts.postaccele[ncycle]!;
  const tsW = ts.postwall[ncycle]!;
  (report.cycles as unknown[]).push({
    ncycle,
    postaccele: cmpSnap("postaccele", tsA, liveA),
    postwall: cmpSnap("postwall", tsW, liveW),
    // Did wall change anything between the two dumps?
    wallDeltaLive: {
      a: countDiffs(liveA.a, liveW.a),
      v: countDiffs(liveA.v, liveW.v),
    },
    wallDeltaTs: {
      a: countDiffs(tsA.a, tsW.a),
      v: countDiffs(tsA.v, tsW.v),
      nContact: tsW.nContact,
    },
  });
  (report.endOfStepX as unknown[]).push({
    ncycle,
    note: "TS X/V after V+=A·DT12 and X+=V·DT2 (live STATE is end-of-run only)",
    interestX: INTEREST.map((node) => ({
      node,
      x: [
        ts.endOfStep[ncycle]!.x[node * 3],
        ts.endOfStep[ncycle]!.x[node * 3 + 1],
        ts.endOfStep[ncycle]!.x[node * 3 + 2],
      ],
      v: [
        ts.endOfStep[ncycle]!.v[node * 3],
        ts.endOfStep[ncycle]!.v[node * 3 + 1],
        ts.endOfStep[ncycle]!.v[node * 3 + 2],
      ],
    })),
  });
}

// Evidence copies for the branch
mkdirSync("docs/research/av-dumps", { recursive: true });
for (const f of readdirSync(LIVE_DIR).filter((x) => x.startsWith("wmbd_"))) {
  copyFileSync(join(LIVE_DIR, f), join("docs/research/av-dumps", f));
}

writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  wrote: OUT_JSON,
  dumpFiles: report.dumpFiles,
  summary: (report.cycles as Array<{ ncycle: number; postaccele: { a: { n: number; bitwise: boolean }; v: { n: number; bitwise: boolean }; x: { n: number; bitwise: boolean } }; postwall: { a: { n: number; bitwise: boolean }; v: { n: number; bitwise: boolean }; x: { n: number; bitwise: boolean } } }>).map((c) => ({
    ncycle: c.ncycle,
    postaccele: { a: c.postaccele.a.n, v: c.postaccele.v.n, x: c.postaccele.x.n, aBit: c.postaccele.a.bitwise, vBit: c.postaccele.v.bitwise, xBit: c.postaccele.x.bitwise },
    postwall: { a: c.postwall.a.n, v: c.postwall.v.n, x: c.postwall.x.n, aBit: c.postwall.a.bitwise, vBit: c.postwall.v.bitwise, xBit: c.postwall.x.bitwise },
  })),
}, null, 2));
