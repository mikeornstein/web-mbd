/**
 * Production OR-mesh adaptive with live NODES%MS injected.
 */
import { readFileSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

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

process.env["WMBD_OR_CALL_S8E"] = "1";
if (!loadOrForceKernel()) {
  console.error("OR kernel missing");
  process.exit(2);
}

const liveMs = parseMs(readFileSync("/tmp/or-mesh-adapt-6x16-0.00008/wmbd_postforint_0.f64bin"));
const make = () => {
  const m = createTaylorBarModel({ nSide: 6, nZ: 16 });
  m.controls.endTime = 80e-6;
  m.controls.runToEnd = true;
  m.controls.adaptiveDt = true;
  m.controls.fixedDt = undefined;
  return m;
};

const live = runOpenRadiossTaylorOracle(make(), "/tmp/or-mesh-adapt-6x16-0.00008");
resetOrElementState();
const orMesh = solveExplicit(make(), {
  maxWallMs: 600_000,
  assembleForces: (a) => assembleInternalForcesOrMesh(a),
  nodalMasses: liveMs,
});
const liveCoords = scrubNearZeros(live.coords);
console.log(
  JSON.stringify(
    {
      steps: orMesh.metrics.nSteps,
      vsLive: {
        ...compareToOracle(orMesh.metrics, live.metrics),
        ...alignedCoordGap(scrubNearZeros(orMesh.coords), liveCoords),
        LfObjectIs: Object.is(orMesh.metrics.lengthRatio, live.metrics.lengthRatio),
        RfObjectIs: Object.is(orMesh.metrics.radiusRatio, live.metrics.radiusRatio),
      },
    },
    null,
    2,
  ),
);
