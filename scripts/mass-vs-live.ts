/**
 * Compare web-mbd lumped nodal masses to live OR NODES%MS from postaccele dump.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { snapCoordsToRadiossF20 } from "../src/oracle/exportRadioss.js";
import { hexLumpedNodalMass } from "../src/fe/hex.js";

function parsePostAccele(path: string): {
  ncycle: number;
  numnod: number;
  dt1: number;
  dt2: number;
  dt12: number;
  itab: Int32Array;
  masses: Float64Array;
} {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const ncycle = dv.getInt32(0, true);
  const numnod = dv.getInt32(4, true);
  const dt1 = dv.getFloat64(8, true);
  const dt2 = dv.getFloat64(16, true);
  const dt12 = dv.getFloat64(24, true);
  const itab = new Int32Array(numnod);
  const masses = new Float64Array(numnod);
  for (let i = 0; i < numnod; i++) {
    const base = 32 + i * 84;
    itab[i] = dv.getInt32(base, true);
    masses[i] = dv.getFloat64(base + 76, true);
  }
  return { ncycle, numnod, dt1, dt2, dt12, itab, masses };
}

const live = parsePostAccele("docs/research/av-dumps/wmbd_postaccele_0.f64bin");

const model = createTaylorBarModel({ nSide: 2, nZ: 4 });
const x = snapCoordsToRadiossF20(model.mesh.coords);
const nNodes = x.length / 3;
const masses = new Float64Array(nNodes);
const xScratch = new Float64Array(24);
for (let e = 0; e < model.mesh.hexes.length / 8; e++) {
  const conn = model.mesh.hexes.slice(e * 8, e * 8 + 8);
  for (let a = 0; a < 8; a++) {
    const n = conn[a]!;
    xScratch[a * 3] = x[n * 3]!;
    xScratch[a * 3 + 1] = x[n * 3 + 1]!;
    xScratch[a * 3 + 2] = x[n * 3 + 2]!;
  }
  const m = hexLumpedNodalMass(xScratch, model.material.density);
  for (let a = 0; a < 8; a++) masses[conn[a]!]! += m[a]!;
}

// Live ITAB is 1-based node id; dump order may be internal order.
const liveById = new Float64Array(nNodes);
for (let i = 0; i < live.numnod; i++) {
  const id = live.itab[i]! - 1;
  liveById[id] = live.masses[i]!;
}

let nDiff = 0;
let maxAbs = 0;
let first: { id: number; ours: number; live: number; abs: number }[] = [];
for (let i = 0; i < nNodes; i++) {
  const o = masses[i]!;
  const l = liveById[i]!;
  if (!Object.is(o, l)) {
    nDiff++;
    const abs = Math.abs(o - l);
    if (abs > maxAbs) maxAbs = abs;
    if (first.length < 8) first.push({ id: i + 1, ours: o, live: l, abs });
  }
}

const out = {
  nNodes,
  totalOurs: masses.reduce((a, b) => a + b, 0),
  totalLive: liveById.reduce((a, b) => a + b, 0),
  totalsBitwise: Object.is(
    masses.reduce((a, b) => a + b, 0),
    liveById.reduce((a, b) => a + b, 0),
  ),
  nDiff,
  maxAbs,
  first,
};
console.log(JSON.stringify(out, null, 2));
writeFileSync("docs/research/mass-vs-live.json", JSON.stringify(out, null, 2));
