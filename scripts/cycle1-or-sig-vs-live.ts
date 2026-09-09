/**
 * Cycle-1: OR-ABI post-FORINT SIG/PLA vs live gpsig, and F vs preaccele,
 * with identical live X/V.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { createHexGpStates, gatherHex } from "../src/fe/hex.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";

const LIVE = process.env["ADAPTIVE_DUMP_DIR"] ?? "/tmp/or-adaptive-dt-2x4";
const OUT = "docs/research/cycle1-or-sig-vs-live.json";

function parseAv(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const ncycle = view.getInt32(o, true);
  o += 4;
  const numnod = view.getInt32(o, true);
  o += 4;
  const dt1 = view.getFloat64(o, true);
  o += 8;
  o += 16; // dt2, dt12
  const a = new Float64Array(numnod * 3);
  const v = new Float64Array(numnod * 3);
  const x = new Float64Array(numnod * 3);
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
    o += 8; // ms
  }
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  const as = new Float64Array(numnod * 3);
  const vs = new Float64Array(numnod * 3);
  const xs = new Float64Array(numnod * 3);
  for (let ni = 0; ni < numnod; ni++) {
    const i = order[ni]!;
    as.set(a.subarray(i * 3, i * 3 + 3), ni * 3);
    vs.set(v.subarray(i * 3, i * 3 + 3), ni * 3);
    xs.set(x.subarray(i * 3, i * 3 + 3), ni * 3);
  }
  return { ncycle, numnod, dt1, a: as, v: vs, x: xs };
}

function parseGp(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const ncycle = view.getInt32(o, true);
  o += 4;
  const nel = view.getInt32(o, true);
  o += 4;
  const nptr = view.getInt32(o, true);
  o += 4;
  const npts = view.getInt32(o, true);
  o += 4;
  const nptt = view.getInt32(o, true);
  o += 4;
  const map = new Map<
    string,
    { d: Float64Array; sig: Float64Array; pla: number; qvis: number; rho: number; amu: number }
  >();
  const nGp = nel * nptr * npts * nptt;
  for (let g = 0; g < nGp; g++) {
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
    o += 8; // vol (=VOLO)
    const rho = view.getFloat64(o, true);
    o += 8;
    const amu = view.getFloat64(o, true);
    o += 8;
    o += 8; // eint
    map.set(`${eid}|${ip}`, { d, sig, pla, qvis, rho, amu });
  }
  return { ncycle, nel, nptr, npts, nptt, map };
}

function ulp(a: number, b: number): number {
  if (Object.is(a, b)) return 0;
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, a);
  let u1 = dv.getBigUint64(0);
  dv.setFloat64(0, b);
  let u2 = dv.getBigUint64(0);
  const sign = 0x8000000000000000n;
  if ((u1 ^ u2) & sign) return -1;
  const d = u1 > u2 ? u1 - u2 : u2 - u1;
  return d > 10000n ? 10000 : Number(d);
}

function cmpArr(ours: Float64Array, live: Float64Array, noise = 1e-20) {
  let n = 0;
  let nReal = 0;
  let maxAbs = 0;
  let maxUlp = 0;
  let first: { i: number; o: number; l: number } | null = null;
  for (let i = 0; i < ours.length; i++) {
    if (Object.is(ours[i], live[i])) continue;
    n++;
    const abs = Math.abs(ours[i]! - live[i]!);
    const mag = Math.max(Math.abs(ours[i]!), Math.abs(live[i]!));
    if (abs > noise && mag > noise) {
      nReal++;
      if (abs > maxAbs) maxAbs = abs;
      maxUlp = Math.max(maxUlp, ulp(ours[i]!, live[i]!));
      if (!first) first = { i, o: ours[i]!, l: live[i]! };
    }
  }
  return { n, nReal, bitwise: n === 0, realBitwise: nReal === 0, maxAbs, maxUlp, first };
}

const live1 = parseAv(readFileSync(join(LIVE, "wmbd_postaccele_1.f64bin")));
const liveF = parseAv(readFileSync(join(LIVE, "wmbd_preaccele_1.f64bin")));
const liveGp = parseGp(readFileSync(join(LIVE, "wmbd_gpsig_1.f64bin")));

const model = createTaylorBarModel({ nSide: 2, nZ: 4 });
const nHex = model.mesh.hexes.length / 8;
const nNodes = model.mesh.coords.length / 3;
const hexConn: number[][] = [];
for (let e = 0; e < nHex; e++) hexConn.push(Array.from(model.mesh.hexes.slice(e * 8, e * 8 + 8)));

resetOrElementState();
if (!loadOrForceKernel()) throw new Error("OR kernel missing");

const hexStates = [];
for (let e = 0; e < nHex; e++) {
  const x0 = new Float64Array(24);
  gatherHex(Float64Array.from(model.mesh.coords), hexConn[e]!, x0);
  hexStates.push(createHexGpStates(Float64Array.from(x0)));
}
const f = new Float64Array(nNodes * 3);
const histOut = new Float64Array(nHex * 32);
assembleInternalForcesOrMesh({
  x: live1.x,
  v: live1.v,
  hexStates,
  hexConn,
  mat: model.material,
  dt: live1.dt1,
  f,
  histOut,
});

const keys = [...liveGp.map.keys()].sort((a, b) => {
  const [ae, ai] = a.split("|").map(Number);
  const [be, bi] = b.split("|").map(Number);
  return ae! - be! || ai! - bi!;
});
const sigO = new Float64Array(keys.length * 6);
const sigL = new Float64Array(keys.length * 6);
const plaO = new Float64Array(keys.length);
const plaL = new Float64Array(keys.length);
const qvisO = new Float64Array(keys.length);
const qvisL = new Float64Array(keys.length);
const rhoO = new Float64Array(keys.length);
const rhoL = new Float64Array(keys.length);
for (let i = 0; i < keys.length; i++) {
  const [eidStr, ipStr] = keys[i]!.split("|");
  const e = Number(eidStr)! - 1;
  const ip = Number(ipStr)! - 1;
  const st = hexStates[e]![ip]!;
  sigO.set(st.stress, i * 6);
  plaO[i] = st.eqPlasticStrain;
  qvisO[i] = histOut[e * 32 + 16 + ip]!;
  rhoO[i] = histOut[e * 32 + 24 + ip]!;
  const lg = liveGp.map.get(keys[i]!)!;
  sigL.set(lg.sig, i * 6);
  plaL[i] = lg.pla;
  qvisL[i] = lg.qvis;
  rhoL[i] = lg.rho;
}

const fCmp = cmpArr(f, liveF.a);
const hugeFMis: Array<{ i: number; ulp: number; o: number; l: number }> = [];
for (let i = 0; i < f.length; i++) {
  if (Math.abs(liveF.a[i]!) < 1e3 && Math.abs(f[i]!) < 1e3) continue;
  if (!Object.is(f[i], liveF.a[i])) {
    hugeFMis.push({ i, ulp: ulp(f[i]!, liveF.a[i]!), o: f[i]!, l: liveF.a[i]! });
  }
}

const report = {
  note: "OR-ABI NEL=16 cold FORINT @ live X/V/DT1 vs live gpsig + preaccele F",
  liveDir: LIVE,
  dt1: live1.dt1,
  gpsigHeader: {
    ncycle: liveGp.ncycle,
    nel: liveGp.nel,
    nptr: liveGp.nptr,
    npts: liveGp.npts,
    nptt: liveGp.nptt,
  },
  SIG: cmpArr(sigO, sigL),
  PLA: cmpArr(plaO, plaL),
  QVIS: cmpArr(qvisO, qvisL),
  RHO: cmpArr(rhoO, rhoL),
  F: fCmp,
  hugeF: { nMis: hugeFMis.length, mismatches: hugeFMis },
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!existsSync(join(LIVE, "wmbd_gpsig_1.f64bin"))) process.exit(1);
