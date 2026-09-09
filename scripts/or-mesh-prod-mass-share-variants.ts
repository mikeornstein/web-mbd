import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { hexVolumeRadiossCenter, gatherHex } from "../src/fe/hex.js";
import { readFileSync } from "node:fs";

function parseMs(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 4;
  const numnod = view.getInt32(o, true);
  o += 4 + 24;
  const ms = new Float64Array(numnod);
  const ids = new Int32Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4 + 72;
    ms[i] = view.getFloat64(o, true);
    o += 8;
  }
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  return Float64Array.from(order, (i) => ms[i]!);
}

const live = parseMs(readFileSync("/tmp/or-mesh-adapt-6x16-0.00008/wmbd_postforint_0.f64bin"));
const model = createTaylorBarModel({ nSide: 6, nZ: 16 });
const rho = model.material.density;
const nHex = model.mesh.hexes.length / 8;
const nNodes = model.mesh.coords.length / 3;
const x = Float64Array.from(model.mesh.coords);

function tryShare(fn: (vol: number) => number) {
  const masses = new Float64Array(nNodes);
  for (let e = 0; e < nHex; e++) {
    const conn = [...model.mesh.hexes.slice(e * 8, e * 8 + 8)];
    const x0 = new Float64Array(24);
    gatherHex(x, conn, x0);
    const vol = hexVolumeRadiossCenter(x0);
    const s = fn(vol);
    for (let a = 0; a < 8; a++) masses[conn[a]!]! += s;
  }
  let n = 0;
  let maxAbs = 0;
  for (let i = 0; i < nNodes; i++) {
    if (!Object.is(masses[i], live[i])) {
      n++;
      maxAbs = Math.max(maxAbs, Math.abs(masses[i]! - live[i]!));
    }
  }
  return { n, maxAbs, objectIs: n === 0 };
}

console.log({
  mul_1_8: tryShare((v) => rho * v * (1 / 8)),
  mul_0_125: tryShare((v) => rho * v * 0.125),
  div8: tryShare((v) => (rho * v) / 8),
  rho_div8_vol: tryShare((v) => rho * (v / 8)),
  vol_rho_div8: tryShare((v) => (v * rho) / 8),
  one_over_64_path: tryShare((v) => {
    // undo vol=(1/64)*detRaw roughly — not applicable
    return rho * v * 0.125;
  }),
});
