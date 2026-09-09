/**
 * Native adaptive CFL with OR mesh SCUMU3 assemble vs live `.f64bin`.
 * Usage: pnpm exec tsx scripts/or-mesh-adaptive-vs-live.ts [endTime] [nSide] [nZ]
 */
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

const endTime = Number(process.argv[2] ?? 80e-6);
const nSide = Number(process.argv[3] ?? 2);
const nZ = Number(process.argv[4] ?? 4);

if (!loadOrForceKernel()) {
  console.error("OR kernel missing");
  process.exit(2);
}

const make = () => {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.endTime = endTime;
  m.controls.runToEnd = true;
  m.controls.adaptiveDt = true;
  m.controls.fixedDt = undefined;
  return m;
};

process.env["WMBD_OR_CALL_S8E"] = "1";
const live = runOpenRadiossTaylorOracle(make(), `/tmp/or-mesh-adapt-${nSide}x${nZ}-${endTime}`);
resetOrElementState();
const orMesh = solveExplicit(make(), {
  maxWallMs: 600_000,
  assembleForces: (a) => assembleInternalForcesOrMesh(a),
});
const ts = solveExplicit(make(), { maxWallMs: 600_000 });

const liveCoords = scrubNearZeros(live.coords);
const out = {
  endTime,
  mesh: { nSide, nZ },
  live: {
    Lf: live.metrics.lengthRatio,
    Rf: live.metrics.radiusRatio,
    coordSource: live.metrics.coordSource,
  },
  orMesh: {
    steps: orMesh.metrics.nSteps,
    vsLive: {
      ...compareToOracle(orMesh.metrics, live.metrics),
      ...alignedCoordGap(scrubNearZeros(orMesh.coords), liveCoords),
    },
  },
  ts: {
    steps: ts.metrics.nSteps,
    vsLive: {
      ...compareToOracle(ts.metrics, live.metrics),
      ...alignedCoordGap(scrubNearZeros(ts.coords), liveCoords),
    },
  },
};
console.log(JSON.stringify(out, null, 2));
