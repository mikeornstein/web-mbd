import { readFileSync, writeFileSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { gatherHex, hexVolumeRadiossCenter } from "../src/fe/hex.js";

function parseAv(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 4;
  const numnod = view.getInt32(o, true);
  o += 4 + 24;
  const x = new Float64Array(numnod * 3);
  const v = new Float64Array(numnod * 3);
  const ids = new Int32Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4;
    o += 24; // A
    for (let k = 0; k < 3; k++) {
      v[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    for (let k = 0; k < 3; k++) {
      x[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    o += 8; // MS
  }
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  const xs = new Float64Array(numnod * 3);
  const vs = new Float64Array(numnod * 3);
  for (let ni = 0; ni < numnod; ni++) {
    xs.set(x.subarray(order[ni]! * 3, order[ni]! * 3 + 3), ni * 3);
    vs.set(v.subarray(order[ni]! * 3, order[ni]! * 3 + 3), ni * 3);
  }
  return { xs, vs };
}

const { xs: liveX, vs: liveV } = parseAv(
  readFileSync("/tmp/or-mesh-adapt-6x16-0.00008/wmbd_postforint_0.f64bin"),
);
const model = createTaylorBarModel({ nSide: 6, nZ: 16 });
const ourX = Float64Array.from(model.mesh.coords);
let nDiff = 0,
  maxAbs = 0,
  iMax = 0;
for (let i = 0; i < ourX.length; i++) {
  if (!Object.is(ourX[i], liveX[i])) {
    nDiff++;
    const d = Math.abs(ourX[i]! - liveX[i]!);
    if (d > maxAbs) {
      maxAbs = d;
      iMax = i;
    }
  }
}
console.log({
  nDiffX0: nDiff,
  maxAbs,
  iMax,
  our: ourX[iMax],
  live: liveX[iMax],
  v0: liveV[0],
  v2: liveV[2],
});

const e = 5;
const conn = [...model.mesh.hexes.slice(e * 8, e * 8 + 8)];
const x0our = new Float64Array(24);
gatherHex(ourX, conn, x0our);
const x0live = new Float64Array(24);
gatherHex(liveX, conn, x0live);
console.log({
  volOurX: hexVolumeRadiossCenter(x0our),
  volLiveX: hexVolumeRadiossCenter(x0live),
  x0same: [...x0our].every((v, i) => Object.is(v, x0live[i]!)),
});
writeFileSync("/tmp/hex5_live_x0.f64", Buffer.from(x0live.buffer));
