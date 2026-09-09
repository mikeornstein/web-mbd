/**
 * Find where our center VOLU disagrees with live-implied VOLU (valence-1 nodes).
 */
import { readFileSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { hexVolumeRadiossCenter, gatherHex } from "../src/fe/hex.js";

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
const valence = new Int32Array(nNodes);
const elemOf = new Int32Array(nNodes).fill(-1);
const ourVol = new Float64Array(nHex);
for (let e = 0; e < nHex; e++) {
  const conn = [...model.mesh.hexes.slice(e * 8, e * 8 + 8)];
  const x0 = new Float64Array(24);
  gatherHex(x, conn, x0);
  ourVol[e] = hexVolumeRadiossCenter(x0);
  for (const a of conn) {
    valence[a!]!++;
    elemOf[a!] = e;
  }
}

let nVal1 = 0,
  nDiff = 0;
const samples: unknown[] = [];
for (let i = 0; i < nNodes; i++) {
  if (valence[i] !== 1) continue;
  nVal1++;
  const e = elemOf[i]!;
  const liveVol = (live[i]! * 8) / rho;
  const ours = ourVol[e]!;
  if (!Object.is(liveVol, ours)) {
    nDiff++;
    if (samples.length < 8) {
      samples.push({
        node: i,
        e,
        liveVol,
        ours,
        ulpVol: (() => {
          const b = new ArrayBuffer(16);
          const u = new BigUint64Array(b);
          const f = new Float64Array(b);
          f[0] = liveVol;
          f[1] = ours;
          return Number(u[0]! > u[1]! ? u[0]! - u[1]! : u[1]! - u[0]!);
        })(),
        liveMs: live[i],
        ourShare: rho * ours * 0.125,
      });
    }
  }
}
console.log(JSON.stringify({ nVal1, nDiffVal1Vol: nDiff, samples }, null, 2));

// Also: total mass from 8*sum(ourVol)*rho/8 = rho*sum(ourVol) vs sum(live MS)
const sumOur = [...ourVol].reduce((a, b) => a + b, 0) * rho;
const sumLive = [...live].reduce((a, b) => a + b, 0);
console.log({
  sumMassFromOurVol: sumOur,
  sumLiveMs: sumLive,
  objectIsSum: Object.is(sumOur, sumLive),
});
