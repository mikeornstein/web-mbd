/**
 * Cycle-1 nodal force/A compare: live post-ACCELE vs OR-ABI vs TS
 * with identical X/V from the live dump (input to FORINT this cycle).
 *
 *   OPENRADIOSS_PATH=... ADAPTIVE_DUMP_DIR=/tmp/or-adaptive-dt-2x4 \
 *     pnpm exec tsx scripts/cycle1-force-or-vs-live.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import {
  createHexGpStates,
  gatherHex,
  hexInternalForces,
  hexLumpedNodalMass,
} from "../src/fe/hex.js";
import {
  assembleInternalForcesOrMesh,
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

const LIVE = process.env["ADAPTIVE_DUMP_DIR"] ?? "/tmp/or-adaptive-dt-2x4";
const OUT = "docs/research/cycle1-force-or-vs-live.json";

function parseAv(buf: Buffer) {
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

function stats(ours: Float64Array, live: Float64Array, noise = 1e-20) {
  let n = 0;
  let nNoise = 0;
  let nReal = 0;
  let maxAbs = 0;
  let maxUlpHuge = 0;
  let firstReal: { i: number; ours: number; live: number; abs: number } | null = null;
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  const ulp = (a: number, b: number) => {
    if (Object.is(a, b)) return 0;
    dv.setFloat64(0, a);
    let u1 = dv.getBigUint64(0);
    dv.setFloat64(0, b);
    let u2 = dv.getBigUint64(0);
    const sign = 0x8000000000000000n;
    if ((u1 ^ u2) & sign) return -1;
    const d = u1 > u2 ? u1 - u2 : u2 - u1;
    return d > 10000n ? 10000 : Number(d);
  };
  for (let i = 0; i < ours.length; i++) {
    if (Object.is(ours[i], live[i])) continue;
    n++;
    const abs = Math.abs(ours[i]! - live[i]!);
    const mag = Math.max(Math.abs(ours[i]!), Math.abs(live[i]!));
    if (abs <= noise || mag <= noise) {
      nNoise++;
      continue;
    }
    nReal++;
    if (abs > maxAbs) maxAbs = abs;
    if (mag >= 1e6) maxUlpHuge = Math.max(maxUlpHuge, ulp(ours[i]!, live[i]!));
    if (!firstReal) firstReal = { i, ours: ours[i]!, live: live[i]!, abs };
  }
  return {
    n,
    nNoise,
    nReal,
    bitwise: n === 0,
    realBitwise: nReal === 0,
    maxAbs,
    maxUlpHuge,
    firstReal,
  };
}

function aFromF(f: Float64Array, ms: Float64Array): Float64Array {
  const a = new Float64Array(f.length);
  const n = ms.length;
  for (let i = 0; i < n; i++) {
    const rtmp = 1 / ms[i]!;
    a[i * 3] = f[i * 3]! * rtmp;
    a[i * 3 + 1] = f[i * 3 + 1]! * rtmp;
    a[i * 3 + 2] = f[i * 3 + 2]! * rtmp;
  }
  return a;
}

if (!existsSync(join(LIVE, "wmbd_postaccele_1.f64bin"))) {
  throw new Error(`missing ${LIVE}/wmbd_postaccele_1.f64bin`);
}
if (!existsSync(join(LIVE, "wmbd_postaccele_0.f64bin"))) {
  throw new Error(`missing ${LIVE}/wmbd_postaccele_0.f64bin`);
}

const live0 = parseAv(readFileSync(join(LIVE, "wmbd_postaccele_0.f64bin")));
const live1 = parseAv(readFileSync(join(LIVE, "wmbd_postaccele_1.f64bin")));
const liveF1Path = join(LIVE, "wmbd_preaccele_1.f64bin");
const livePre1 = existsSync(liveF1Path) ? parseAv(readFileSync(liveF1Path)) : null;

const model = createTaylorBarModel({ nSide: 2, nZ: 4 });
const nNodes = model.mesh.coords.length / 3;
const nHex = model.mesh.hexes.length / 8;

// Masses from undeformed mesh (live MS Object.is at cycle 0/1).
const masses = new Float64Array(nNodes);
const xScratch = new Float64Array(24);
const hexConn: number[][] = [];
for (let e = 0; e < nHex; e++) {
  const conn = Array.from(model.mesh.hexes.slice(e * 8, e * 8 + 8));
  hexConn.push(conn);
  gatherHex(Float64Array.from(model.mesh.coords), conn, xScratch);
  const m = hexLumpedNodalMass(xScratch, model.material.density);
  for (let ai = 0; ai < 8; ai++) masses[conn[ai]!]! += m[ai]!;
}

const msVsLive = stats(masses, live1.ms);
const xVsLive = stats(scrubNearZeros(live1.x), scrubNearZeros(live1.x)); // tautology placeholder
const x0VsModel = stats(
  scrubNearZeros(Float64Array.from(model.mesh.coords)),
  scrubNearZeros(live0.x),
);

// --- Cycle 1 FORINT on live1.X / live1.V with cold material (DT1=live1.dt1) ---
const dt1 = live1.dt1; // should be DT2 of cycle 0

function runTs(x: Float64Array, v: Float64Array, dt: number): Float64Array {
  const f = new Float64Array(nNodes * 3);
  const fHex = new Float64Array(24);
  const xS = new Float64Array(24);
  const vS = new Float64Array(24);
  for (let e = 0; e < nHex; e++) {
    const conn = hexConn[e]!;
    gatherHex(x, conn, xS);
    gatherHex(v, conn, vS);
    const states = createHexGpStates(Float64Array.from(xS)); // vol0 from current X — WRONG for mid-run?
    // For cycle 1 after cold start, vol0 should be from undeformed / after cycle-0 DSV.
    // Cycle 0 DT1=0 ⇒ DSV=0 ⇒ vol0 stays initial undeformed. Use undeformed gather for vol0.
    const x0 = new Float64Array(24);
    gatherHex(Float64Array.from(model.mesh.coords), conn, x0);
    const states0 = createHexGpStates(Float64Array.from(x0));
    hexInternalForces({
      x: xS,
      v: vS,
      states: states0,
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
  return f;
}

function runOrNel1(x: Float64Array, v: Float64Array, dt: number): Float64Array {
  resetOrElementState();
  if (!loadOrForceKernel()) throw new Error("OR kernel missing");
  const f = new Float64Array(nNodes * 3);
  const fHex = new Float64Array(24);
  const xS = new Float64Array(24);
  const vS = new Float64Array(24);
  for (let e = 0; e < nHex; e++) {
    const conn = hexConn[e]!;
    gatherHex(x, conn, xS);
    gatherHex(v, conn, vS);
    const x0 = new Float64Array(24);
    gatherHex(Float64Array.from(model.mesh.coords), conn, x0);
    const states = createHexGpStates(Float64Array.from(x0));
    hexInternalForcesOr({
      x: xS,
      v: vS,
      states,
      mat: model.material,
      dt,
      fOut: fHex,
      elementIndex: e,
    });
    for (let ai = 0; ai < 8; ai++) {
      const n = conn[ai]!;
      f[n * 3]! -= fHex[ai * 3]!;
      f[n * 3 + 1]! -= fHex[ai * 3 + 1]!;
      f[n * 3 + 2]! -= fHex[ai * 3 + 2]!;
    }
  }
  return f;
}

function runOrNel16(x: Float64Array, v: Float64Array, dt: number): Float64Array {
  resetOrElementState();
  if (!loadOrForceKernel()) throw new Error("OR kernel missing");
  const f = new Float64Array(nNodes * 3);
  const hexStates = [];
  for (let e = 0; e < nHex; e++) {
    const x0 = new Float64Array(24);
    gatherHex(Float64Array.from(model.mesh.coords), hexConn[e]!, x0);
    hexStates.push(createHexGpStates(Float64Array.from(x0)));
  }
  assembleInternalForcesOrMesh({
    x,
    v,
    hexStates,
    hexConn,
    mat: model.material,
    dt,
    f,
  });
  return f;
}

const xIn = live1.x.slice();
const vIn = live1.v.slice();

const fTs = runTs(xIn, vIn, dt1);
const aTs = aFromF(fTs, masses);

let fOr1: Float64Array | null = null;
let aOr1: Float64Array | null = null;
let fOr16: Float64Array | null = null;
let aOr16: Float64Array | null = null;
let orErr: string | null = null;
try {
  fOr1 = runOrNel1(xIn, vIn, dt1);
  aOr1 = aFromF(fOr1, masses);
  fOr16 = runOrNel16(xIn, vIn, dt1);
  aOr16 = aFromF(fOr16, masses);
} catch (e) {
  orErr = e instanceof Error ? e.message : String(e);
}

const liveFEst = new Float64Array(nNodes * 3);
for (let i = 0; i < nNodes; i++) {
  // Reconstruct F from A*MS — Radioss A = F*(1/MS), so F ≈ A*MS (not exact roundtrip).
  liveFEst[i * 3] = live1.a[i * 3]! * live1.ms[i]!;
  liveFEst[i * 3 + 1] = live1.a[i * 3 + 1]! * live1.ms[i]!;
  liveFEst[i * 3 + 2] = live1.a[i * 3 + 2]! * live1.ms[i]!;
}
/** True assembled forces before ACCELE (NODES%A pre-multiply), when dump present. */
const liveFTrue = livePre1 ? livePre1.a : null;

// Sanity: X/V at pre-ACCELE must Object.is match post-ACCELE (updates are after RGWALL).
const prePostXV =
  livePre1 == null
    ? null
    : {
        x: stats(livePre1.x, live1.x),
        v: stats(livePre1.v, live1.v),
        ms: stats(livePre1.ms, live1.ms),
      };

/** Huge-|A| ACCELE compare + A↔F↔A roundtrip floor (Radioss uses A=F*(1/MS)). */
function hugeAReport(
  aOurs: Float64Array,
  fOurs: Float64Array,
  aLive: Float64Array,
  ms: Float64Array,
  thresh = 1e6,
) {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  const ulp = (a: number, b: number) => {
    if (Object.is(a, b)) return 0;
    dv.setFloat64(0, a);
    let u1 = dv.getBigUint64(0);
    dv.setFloat64(0, b);
    let u2 = dv.getBigUint64(0);
    const sign = 0x8000000000000000n;
    if ((u1 ^ u2) & sign) return -1;
    const d = u1 > u2 ? u1 - u2 : u2 - u1;
    return d > 10000n ? 10000 : Number(d);
  };
  let nHuge = 0;
  let nAMismatch = 0;
  let maxUlpA = 0;
  let nFVsAtimesMs = 0;
  let maxUlpF = 0;
  let nLiveRoundtripLose = 0;
  const mismatches: Array<{
    i: number;
    node: number;
    comp: number;
    aOurs: number;
    aLive: number;
    ulpA: number;
    fOurs: number;
    fEst: number;
    ulpF: number;
    aRoundFromEst: number;
    liveRoundtripOk: boolean;
  }> = [];
  for (let i = 0; i < aLive.length; i++) {
    if (Math.abs(aLive[i]!) < thresh && Math.abs(aOurs[i]!) < thresh) continue;
    nHuge++;
    const node = (i / 3) | 0;
    const fEst = aLive[i]! * ms[node]!;
    const aRound = fEst * (1 / ms[node]!);
    if (!Object.is(aRound, aLive[i]!)) nLiveRoundtripLose++;
    const aOk = Object.is(aOurs[i], aLive[i]);
    if (!aOk) {
      nAMismatch++;
      maxUlpA = Math.max(maxUlpA, ulp(aOurs[i]!, aLive[i]!));
    }
    if (!Object.is(fOurs[i], fEst)) {
      nFVsAtimesMs++;
      maxUlpF = Math.max(maxUlpF, ulp(fOurs[i]!, fEst));
    }
    if (!aOk) {
      mismatches.push({
        i,
        node,
        comp: i % 3,
        aOurs: aOurs[i]!,
        aLive: aLive[i]!,
        ulpA: ulp(aOurs[i]!, aLive[i]!),
        fOurs: fOurs[i]!,
        fEst,
        ulpF: ulp(fOurs[i]!, fEst),
        aRoundFromEst: aRound,
        liveRoundtripOk: Object.is(aRound, aLive[i]!),
      });
    }
  }
  return {
    thresh,
    nHuge,
    nAMismatch,
    maxUlpA,
    nFVsAtimesMs,
    maxUlpF,
    nLiveRoundtripLose,
    mismatches,
  };
}

const aOr1LiveMs = aOr1 && fOr1 ? aFromF(fOr1, live1.ms) : null;

const report = {
  note: "Cycle-1 FORINT with live X/V from wmbd_postaccele_1; cold vol0; DT1=live.dt1; GEO QA=1e-20/1e-21",
  liveDir: LIVE,
  live1: { ncycle: live1.ncycle, dt1: live1.dt1, dt2: live1.dt2, dt12: live1.dt12 },
  live0: { ncycle: live0.ncycle, dt1: live0.dt1, dt2: live0.dt2 },
  massesObjectIs: msVsLive.bitwise,
  x0VsLive0: stats(scrubNearZeros(Float64Array.from(model.mesh.coords)), scrubNearZeros(live0.x)),
  xInObjectIsLive1: true,
  orErr,
  prePostXV,
  hasPreAcceleF: liveFTrue != null,
  compare: {
    tsA_vs_liveA: stats(aTs, live1.a),
    tsF_vs_liveAM: stats(fTs, liveFEst),
    tsF_vs_liveFTrue: liveFTrue ? stats(fTs, liveFTrue) : null,
    or1A_vs_liveA: aOr1 ? stats(aOr1, live1.a) : null,
    or1A_vs_liveA_liveMs: aOr1LiveMs ? stats(aOr1LiveMs, live1.a) : null,
    or16A_vs_liveA: aOr16 ? stats(aOr16, live1.a) : null,
    or1F_vs_liveAM: fOr1 ? stats(fOr1, liveFEst) : null,
    or1F_vs_liveFTrue: fOr1 && liveFTrue ? stats(fOr1, liveFTrue) : null,
    or16F_vs_liveFTrue: fOr16 && liveFTrue ? stats(fOr16, liveFTrue) : null,
    liveFTrue_vs_liveAM: liveFTrue ? stats(liveFTrue, liveFEst) : null,
    or1A_vs_tsA: aOr1 ? stats(aOr1, aTs) : null,
    or1F_vs_or16F: fOr1 && fOr16 ? stats(fOr1, fOr16) : null,
    or1A_vs_or16A: aOr1 && aOr16 ? stats(aOr1, aOr16) : null,
  },
  hugeA: {
    or1: aOr1 && fOr1 ? hugeAReport(aOr1, fOr1, live1.a, masses) : null,
    or1_liveMs: aOr1 && fOr1 ? hugeAReport(aFromF(fOr1, live1.ms), fOr1, live1.a, live1.ms) : null,
    ts: hugeAReport(aTs, fTs, live1.a, masses),
  },
  hugeF: liveFTrue && fOr1
    ? (() => {
        const buf = new ArrayBuffer(8);
        const dv = new DataView(buf);
        const ulp = (a: number, b: number) => {
          if (Object.is(a, b)) return 0;
          dv.setFloat64(0, a);
          let u1 = dv.getBigUint64(0);
          dv.setFloat64(0, b);
          let u2 = dv.getBigUint64(0);
          const sign = 0x8000000000000000n;
          if ((u1 ^ u2) & sign) return -1;
          const d = u1 > u2 ? u1 - u2 : u2 - u1;
          return d > 10000n ? 10000 : Number(d);
        };
        let nHuge = 0;
        let nMis = 0;
        let maxUlp = 0;
        const mismatches: Array<{ i: number; node: number; comp: number; or: number; live: number; ulp: number }> = [];
        for (let i = 0; i < liveFTrue.length; i++) {
          if (Math.abs(liveFTrue[i]!) < 1e3 && Math.abs(fOr1[i]!) < 1e3) continue;
          nHuge++;
          if (!Object.is(fOr1[i], liveFTrue[i])) {
            nMis++;
            const u = ulp(fOr1[i]!, liveFTrue[i]!);
            maxUlp = Math.max(maxUlp, u);
            mismatches.push({ i, node: (i / 3) | 0, comp: i % 3, or: fOr1[i]!, live: liveFTrue[i]!, ulp: u });
          }
        }
        return { nHuge, nMis, maxUlp, mismatches };
      })()
    : null,
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
