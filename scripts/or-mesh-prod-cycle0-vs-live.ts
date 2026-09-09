/**
 * Cycle-0 OR mesh F vs live postforint for production 6×6×16.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { createHexGpStates, gatherHex } from "../src/fe/hex.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";

const LIVE = process.env["ADAPTIVE_DUMP_DIR"] ?? "/tmp/or-mesh-adapt-6x16-0.00008";
const nSide = Number(process.env["NSIDE"] ?? 6);
const nZ = Number(process.env["NZ"] ?? 16);
const cycle = Number(process.env["CYCLE"] ?? 0);

function parseAv(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  o += 4;
  const numnod = view.getInt32(o, true);
  o += 4;
  const dt1 = view.getFloat64(o, true);
  o += 24;
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
    o += 8;
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
  return { a: as, v: vs, x: xs, dt1, numnod };
}

function cmp(label: string, o: Float64Array, l: Float64Array) {
  let n = 0;
  let maxAbs = 0;
  let maxU = 0;
  let iMax = 0;
  const dv = new DataView(new ArrayBuffer(8));
  const ulp = (a: number, b: number) => {
    if (Object.is(a, b)) return 0;
    dv.setFloat64(0, a);
    const u1 = dv.getBigUint64(0);
    dv.setFloat64(0, b);
    const u2 = dv.getBigUint64(0);
    if ((u1 ^ u2) & 0x8000000000000000n) return -1;
    return Number(u1 > u2 ? u1 - u2 : u2 - u1);
  };
  for (let i = 0; i < o.length; i++) {
    if (Object.is(o[i], l[i])) continue;
    n++;
    const d = Math.abs(o[i]! - l[i]!);
    if (d > maxAbs) {
      maxAbs = d;
      iMax = i;
      maxU = ulp(o[i]!, l[i]!);
    }
  }
  console.log(
    label,
    JSON.stringify({
      nDiff: n,
      maxAbs,
      maxUlpAtMaxAbs: maxU,
      iMax,
      o: o[iMax],
      l: l[iMax],
      objectIs: n === 0,
    }),
  );
}

const postF = parseAv(readFileSync(join(LIVE, `wmbd_postforint_${cycle}.f64bin`)));
const model = createTaylorBarModel({ nSide, nZ });
const nHex = model.mesh.hexes.length / 8;
const nNodes = model.mesh.coords.length / 3;
console.log({ LIVE, cycle, nHex, nNodes, dumpNodes: postF.numnod, dt1: postF.dt1 });

const hexConn: number[][] = [];
for (let e = 0; e < nHex; e++) hexConn.push(Array.from(model.mesh.hexes.slice(e * 8, e * 8 + 8)));
resetOrElementState();
process.env["WMBD_OR_CALL_S8E"] = "1";
if (!loadOrForceKernel()) {
  console.error("OR kernel missing");
  process.exit(2);
}
const hexStates = [];
for (let e = 0; e < nHex; e++) {
  const x0 = new Float64Array(24);
  gatherHex(Float64Array.from(model.mesh.coords), hexConn[e]!, x0);
  hexStates.push(createHexGpStates(Float64Array.from(x0)));
}
const f = new Float64Array(nNodes * 3);
assembleInternalForcesOrMesh({
  x: postF.x,
  v: postF.v,
  hexStates,
  hexConn,
  mat: model.material,
  dt: postF.dt1,
  f,
});
cmp(`OR mesh vs postforint_${cycle}`, f, postF.a);
