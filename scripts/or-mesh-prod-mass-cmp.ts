/**
 * Compare web-mbd lumped mass vs live NODES%MS for production mesh.
 */
import { readFileSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { hexLumpedNodalMass, gatherHex } from "../src/fe/hex.js";

function parseMs(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  o += 4;
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
  const out = new Float64Array(numnod);
  for (let ni = 0; ni < numnod; ni++) out[ni] = ms[order[ni]!]!;
  return out;
}

const live = parseMs(readFileSync("/tmp/or-mesh-adapt-6x16-0.00008/wmbd_postforint_0.f64bin"));
const model = createTaylorBarModel({ nSide: 6, nZ: 16 });
const nHex = model.mesh.hexes.length / 8;
const nNodes = model.mesh.coords.length / 3;
const masses = new Float64Array(nNodes);
const x = Float64Array.from(model.mesh.coords);
for (let e = 0; e < nHex; e++) {
  const conn = Array.from(model.mesh.hexes.slice(e * 8, e * 8 + 8));
  const x0 = new Float64Array(24);
  gatherHex(x, conn, x0);
  const m = hexLumpedNodalMass(x0, model.material.density);
  for (let a = 0; a < 8; a++) masses[conn[a]!]! += m[a]!;
}
let n = 0,
  maxAbs = 0,
  iMax = 0;
for (let i = 0; i < masses.length; i++) {
  if (!Object.is(masses[i], live[i])) {
    n++;
    const d = Math.abs(masses[i]! - live[i]!);
    if (d > maxAbs) {
      maxAbs = d;
      iMax = i;
    }
  }
}
console.log(
  JSON.stringify({
    nDiff: n,
    maxAbs,
    iMax,
    w: masses[iMax],
    l: live[iMax],
    objectIs: n === 0,
    sumW: [...masses].reduce((a, b) => a + b, 0),
    sumL: [...live].reduce((a, b) => a + b, 0),
  }),
);
