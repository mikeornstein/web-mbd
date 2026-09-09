import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { createHexGpStates, gatherHex } from "../src/fe/hex.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";

const LIVE = process.env["ADAPTIVE_DUMP_DIR"] ?? "/tmp/or-adaptive-dt-2x4";

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
  return { a: as, v: vs, x: xs, dt1 };
}

function cmp(label: string, o: Float64Array, l: Float64Array) {
  let n = 0;
  let nHuge = 0;
  let maxU = 0;
  const dv = new DataView(new ArrayBuffer(8));
  const ulp = (a: number, b: number) => {
    if (Object.is(a, b)) return 0;
    dv.setFloat64(0, a);
    let u1 = dv.getBigUint64(0);
    dv.setFloat64(0, b);
    let u2 = dv.getBigUint64(0);
    if ((u1 ^ u2) & 0x8000000000000000n) return -1;
    return Number(u1 > u2 ? u1 - u2 : u2 - u1);
  };
  const mis: Array<{ i: number; ulp: number; o: number; l: number }> = [];
  for (let i = 0; i < o.length; i++) {
    if (Object.is(o[i], l[i])) continue;
    n++;
    if (Math.abs(l[i]!) >= 1e3 || Math.abs(o[i]!) >= 1e3) {
      nHuge++;
      maxU = Math.max(maxU, ulp(o[i]!, l[i]!));
      mis.push({ i, ulp: ulp(o[i]!, l[i]!), o: o[i]!, l: l[i]! });
    }
  }
  console.log(label, JSON.stringify({ n, nHugeMis: nHuge, maxUlpHuge: maxU, mis }));
}

const postA = parseAv(readFileSync(join(LIVE, "wmbd_postaccele_1.f64bin")));
const postF = parseAv(readFileSync(join(LIVE, "wmbd_postforint_1.f64bin")));
const preA = parseAv(readFileSync(join(LIVE, "wmbd_preaccele_1.f64bin")));
cmp("postforint vs preaccele F", postF.a, preA.a);

const model = createTaylorBarModel({ nSide: 2, nZ: 4 });
const nHex = model.mesh.hexes.length / 8;
const nNodes = model.mesh.coords.length / 3;
const hexConn: number[][] = [];
for (let e = 0; e < nHex; e++) hexConn.push(Array.from(model.mesh.hexes.slice(e * 8, e * 8 + 8)));
resetOrElementState();
loadOrForceKernel();
const hexStates = [];
for (let e = 0; e < nHex; e++) {
  const x0 = new Float64Array(24);
  gatherHex(Float64Array.from(model.mesh.coords), hexConn[e]!, x0);
  hexStates.push(createHexGpStates(Float64Array.from(x0)));
}
const f = new Float64Array(nNodes * 3);
assembleInternalForcesOrMesh({
  x: postA.x,
  v: postA.v,
  hexStates,
  hexConn,
  mat: model.material,
  dt: postA.dt1,
  f,
});
cmp("OR vs postforint", f, postF.a);
cmp("OR vs preaccele", f, preA.a);
cmp("X postforint vs postaccele", postF.x, postA.x);
cmp("V postforint vs postaccele", postF.v, postA.v);
