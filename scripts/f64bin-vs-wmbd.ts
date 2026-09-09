/**
 * Compare web-mbd (TS jcvt:0 + optional OR-ABI) to live OR host `.f64bin`.
 */
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import {
  openRadiossAvailable,
  runOpenRadiossTaylorOracle,
} from "../src/cli/openRadiossRunner.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { shapeFromSta } from "../src/oracle/shapeFromSta.js";
import { readFileSync } from "node:fs";

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let max = 0;
  for (let k = 0; k < a.length; k++) {
    const d = Math.abs(a[k]! - b[k]!);
    if (d > max) max = d;
  }
  return max;
}

if (!openRadiossAvailable()) {
  console.error("OPENRADIOSS_PATH missing");
  process.exit(2);
}

const endTime = Number(process.argv[2] ?? 80e-6);
const nSide = Number(process.argv[3] ?? 2);
const nZ = Number(process.argv[4] ?? 4);
const useOrAbi = process.env["WMBD_OR_CALL_S8E"] === "1" && loadOrForceKernel();

const make = () => {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.endTime = endTime;
  m.controls.runToEnd = true;
  return m;
};

const live = runOpenRadiossTaylorOracle(make(), `/tmp/f64bin-vs-${endTime}-${nSide}x${nZ}`);
if (live.metrics.coordSource !== "f64bin") {
  console.error("expected f64bin; got", live.metrics.coordSource);
  process.exit(1);
}

const staShape = shapeFromSta(
  readFileSync(live.staFile!, "utf8"),
  make().reference.length0,
  make().reference.radius0,
);

resetOrElementState();
const ts = solveExplicit(make(), { maxWallMs: 600_000 });
let orAbi: ReturnType<typeof solveExplicit> | null = null;
if (useOrAbi) {
  resetOrElementState();
  orAbi = solveExplicit(make(), {
    maxWallMs: 600_000,
    hexForce: (a) => hexInternalForcesOr(a),
  });
}

const tsVsLive = compareToOracle(ts.metrics, live.metrics);
const tsAl = alignedCoordGap(ts.coords, live.coords);
const staVsF64 = alignedCoordGap(staShape.coords, live.coords);

const out: Record<string, unknown> = {
  endTime,
  mesh: { nSide, nZ, nodes: live.coords.length / 3 },
  live: {
    Lf: live.metrics.lengthRatio,
    Rf: live.metrics.radiusRatio,
    coordSource: live.metrics.coordSource,
  },
  staVsF64bin: {
    alignedMax: staVsF64.max,
    coordsBitwiseEqual: staVsF64.bitwiseEqual,
  },
  tsJcvt0: {
    steps: ts.metrics.nSteps,
    Lf: ts.metrics.lengthRatio,
    Rf: ts.metrics.radiusRatio,
    vsLive: {
      relLf: tsVsLive.lengthRelError,
      relRf: tsVsLive.radiusRelError,
      metricsBitwiseEqual: tsVsLive.bitwiseEqual,
      alignedMax: tsAl.max,
      coordsBitwiseEqual: tsAl.bitwiseEqual,
    },
  },
};

if (orAbi) {
  const vsLive = compareToOracle(orAbi.metrics, live.metrics);
  const al = alignedCoordGap(orAbi.coords, live.coords);
  out.orAbi = {
    steps: orAbi.metrics.nSteps,
    Lf: orAbi.metrics.lengthRatio,
    Rf: orAbi.metrics.radiusRatio,
    vsLive: {
      relLf: vsLive.lengthRelError,
      relRf: vsLive.radiusRelError,
      metricsBitwiseEqual: vsLive.bitwiseEqual,
      alignedMax: al.max,
      coordsBitwiseEqual: al.bitwiseEqual,
    },
    vsTs: { maxDx: maxAbsDiff(orAbi.coords, ts.coords) },
  };
}

console.log(JSON.stringify(out, null, 2));
