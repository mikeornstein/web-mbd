import { readFileSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { gatherHex, hexVolume, hexVolumeRadiossCenter, hexLumpedNodalMass } from "../src/fe/hex.js";

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

function assemble(
  label: string,
  shareFn: (x0: Float64Array, rho: number) => number,
) {
  const live = parseMs(readFileSync("/tmp/or-mesh-adapt-6x16-0.00008/wmbd_postforint_0.f64bin"));
  const model = createTaylorBarModel({ nSide: 6, nZ: 16 });
  const rho = model.material.density;
  const nHex = model.mesh.hexes.length / 8;
  const nNodes = model.mesh.coords.length / 3;
  const x = Float64Array.from(model.mesh.coords);
  const masses = new Float64Array(nNodes);
  for (let e = 0; e < nHex; e++) {
    const conn = [...model.mesh.hexes.slice(e * 8, e * 8 + 8)];
    const x0 = new Float64Array(24);
    gatherHex(x, conn, x0);
    const s = shareFn(x0, rho);
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
  console.log(label, JSON.stringify({ n, maxAbs, objectIs: n === 0 }));
}

assemble("center", (x0, rho) => rho * hexVolumeRadiossCenter(x0) * 0.125);
assemble("iso8sum", (x0, rho) => rho * hexVolume(x0) * 0.125);
assemble("current_api", (x0, rho) => hexLumpedNodalMass(x0, rho)[0]!);

// also coarse
function assembleCoarse(label: string, shareFn: (x0: Float64Array, rho: number) => number) {
  const live = parseMs(readFileSync("/tmp/or-mesh-adapt-2x4-0.00008/wmbd_postforint_0.f64bin"));
  const model = createTaylorBarModel({ nSide: 2, nZ: 4 });
  const rho = model.material.density;
  const nHex = model.mesh.hexes.length / 8;
  const nNodes = model.mesh.coords.length / 3;
  const x = Float64Array.from(model.mesh.coords);
  const masses = new Float64Array(nNodes);
  for (let e = 0; e < nHex; e++) {
    const conn = [...model.mesh.hexes.slice(e * 8, e * 8 + 8)];
    const x0 = new Float64Array(24);
    gatherHex(x, conn, x0);
    const s = shareFn(x0, rho);
    for (let a = 0; a < 8; a++) masses[conn[a]!]! += s;
  }
  let n = 0;
  for (let i = 0; i < nNodes; i++) if (!Object.is(masses[i], live[i])) n++;
  console.log("coarse " + label, JSON.stringify({ n, objectIs: n === 0 }));
}
assembleCoarse("center", (x0, rho) => rho * hexVolumeRadiossCenter(x0) * 0.125);
assembleCoarse("iso8sum", (x0, rho) => rho * hexVolume(x0) * 0.125);
