/**
 * Smoke: production mesh OR assembleForces for a few steps.
 */
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";

process.env["WMBD_OR_CALL_S8E"] = "1";
if (!loadOrForceKernel()) {
  console.error("OR kernel missing");
  process.exit(2);
}
const m = createTaylorBarModel({ nSide: 6, nZ: 16 });
m.controls.endTime = 80e-6;
m.controls.runToEnd = true;
m.controls.adaptiveDt = true;
m.controls.fixedDt = undefined;
console.error("hexes", m.mesh.hexes.length / 8, "nodes", m.mesh.coords.length / 3);
resetOrElementState();
try {
  const r = solveExplicit(m, {
    maxWallMs: 600_000,
    maxSteps: 3,
    assembleForces: (a) => assembleInternalForcesOrMesh(a),
  });
  console.log(JSON.stringify({ steps: r.metrics.nSteps, Lf: r.metrics.lengthRatio, Rf: r.metrics.radiusRatio }));
} catch (e) {
  console.error("FAIL", e);
  process.exit(1);
}
