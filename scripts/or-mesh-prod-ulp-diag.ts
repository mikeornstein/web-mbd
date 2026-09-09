/**
 * Production 6×6×16: OR-mesh vs live vs TS ulp diagnostics.
 */
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

process.env["WMBD_OR_CALL_S8E"] = "1";
if (!loadOrForceKernel()) {
  console.error("OR kernel missing");
  process.exit(2);
}

const make = () => {
  const m = createTaylorBarModel({ nSide: 6, nZ: 16 });
  m.controls.endTime = 80e-6;
  m.controls.runToEnd = true;
  m.controls.adaptiveDt = true;
  m.controls.fixedDt = undefined;
  return m;
};

const ulp = (a: number, b: number): number => {
  const buf = new ArrayBuffer(16);
  const u = new BigUint64Array(buf);
  const f = new Float64Array(buf);
  f[0] = a;
  f[1] = b;
  const d = u[0]! > u[1]! ? u[0]! - u[1]! : u[1]! - u[0]!;
  return Number(d > 10_000n ? 10_000n : d);
};

const live = runOpenRadiossTaylorOracle(make(), "/tmp/or-mesh-adapt-6x16-0.00008");
resetOrElementState();
const orMesh = solveExplicit(make(), {
  maxWallMs: 600_000,
  assembleForces: (a) => assembleInternalForcesOrMesh(a),
});
const ts = solveExplicit(make(), { maxWallMs: 600_000 });

const lc = scrubNearZeros(live.coords);
const oc = scrubNearZeros(orMesh.coords);
const tc = scrubNearZeros(ts.coords);

let maxOL = 0,
  maxTL = 0,
  maxOT = 0,
  iOL = 0,
  iTL = 0,
  iOT = 0;
let nDiffOL = 0,
  nDiffTL = 0,
  nDiffOT = 0;
for (let i = 0; i < lc.length; i++) {
  const dOL = Math.abs(oc[i]! - lc[i]!);
  if (dOL > maxOL) {
    maxOL = dOL;
    iOL = i;
  }
  const dTL = Math.abs(tc[i]! - lc[i]!);
  if (dTL > maxTL) {
    maxTL = dTL;
    iTL = i;
  }
  const dOT = Math.abs(oc[i]! - tc[i]!);
  if (dOT > maxOT) {
    maxOT = dOT;
    iOT = i;
  }
  if (!Object.is(oc[i], lc[i])) nDiffOL++;
  if (!Object.is(tc[i], lc[i])) nDiffTL++;
  if (!Object.is(oc[i], tc[i])) nDiffOT++;
}

console.log(
  JSON.stringify(
    {
      Lf: {
        live: live.metrics.lengthRatio,
        or: orMesh.metrics.lengthRatio,
        ts: ts.metrics.lengthRatio,
        orLiveSame: Object.is(orMesh.metrics.lengthRatio, live.metrics.lengthRatio),
        tsLiveSame: Object.is(ts.metrics.lengthRatio, live.metrics.lengthRatio),
        orTsSame: Object.is(orMesh.metrics.lengthRatio, ts.metrics.lengthRatio),
        orLiveUlp: ulp(orMesh.metrics.lengthRatio, live.metrics.lengthRatio),
        tsLiveUlp: ulp(ts.metrics.lengthRatio, live.metrics.lengthRatio),
      },
      Rf: {
        live: live.metrics.radiusRatio,
        or: orMesh.metrics.radiusRatio,
        ts: ts.metrics.radiusRatio,
        orLiveSame: Object.is(orMesh.metrics.radiusRatio, live.metrics.radiusRatio),
        orLiveUlp: ulp(orMesh.metrics.radiusRatio, live.metrics.radiusRatio),
        tsLiveUlp: ulp(ts.metrics.radiusRatio, live.metrics.radiusRatio),
      },
      coords: { maxOL, iOL, maxTL, iTL, maxOT, iOT, nDiffOL, nDiffTL, nDiffOT },
      steps: { or: orMesh.metrics.nSteps, ts: ts.metrics.nSteps },
    },
    null,
    2,
  ),
);
