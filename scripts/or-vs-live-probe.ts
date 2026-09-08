/**
 * Compare OR-ABI-driven web-mbd CD (S8EFORC3 via koffi) to live OpenRadioss
 * on a coarse Taylor mesh. Requires OPENRADIOSS_PATH and libwmbd_or_hex.so.
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

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let max = 0;
  for (let k = 0; k < a.length; k++) {
    const d = Math.abs(a[k]! - b[k]!);
    if (d > max) max = d;
  }
  return max;
}

if (!openRadiossAvailable()) {
  console.error("OPENRADIOSS_PATH / starter missing — skip");
  process.exit(2);
}
if (!loadOrForceKernel()) {
  console.error("libwmbd_or_hex.so missing — skip");
  process.exit(2);
}

const horizons = (process.argv.slice(2).map(Number).filter((t) => t > 0).length
  ? process.argv.slice(2).map(Number).filter((t) => t > 0)
  : [1e-6, 5e-6, 20e-6]) as number[];

for (const endTime of horizons) {
  const make = () => {
    const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
    m.controls.endTime = endTime;
    m.controls.runToEnd = true;
    return m;
  };

  resetOrElementState();
  const orAbi = solveExplicit(make(), {
    maxWallMs: 300_000,
    hexForce: (a) => hexInternalForcesOr(a),
  });
  const tsJcvt0 = solveExplicit(make(), {
    maxWallMs: 300_000,
  });
  const live = runOpenRadiossTaylorOracle(make(), `/tmp/or-vs-live-${endTime}`);

  const vsLive = compareToOracle(orAbi.metrics, live.metrics);
  const al = alignedCoordGap(orAbi.coords, live.coords);
  const vsTsLf =
    Math.abs(orAbi.metrics.lengthRatio - tsJcvt0.metrics.lengthRatio) /
    tsJcvt0.metrics.lengthRatio;
  const vsTsRf =
    Math.abs(orAbi.metrics.radiusRatio - tsJcvt0.metrics.radiusRatio) /
    tsJcvt0.metrics.radiusRatio;

  console.log(
    JSON.stringify({
      endTime,
      steps: { orAbi: orAbi.metrics.nSteps, ts0: tsJcvt0.metrics.nSteps },
      orAbi: {
        Lf: orAbi.metrics.lengthRatio,
        Rf: orAbi.metrics.radiusRatio,
      },
      live: {
        Lf: live.metrics.lengthRatio,
        Rf: live.metrics.radiusRatio,
        coordSource: live.metrics.coordSource,
      },
      vsLive: {
        relLf: vsLive.lengthRelError,
        relRf: vsLive.radiusRelError,
        alignedMax: al.max,
        coordsBitwiseEqual: al.bitwiseEqual,
        metricsBitwiseEqual: vsLive.bitwiseEqual,
      },
      vsTs0: { relLf: vsTsLf, relRf: vsTsRf, maxDx: maxAbsDiff(orAbi.coords, tsJcvt0.coords) },
    }),
  );
}
