/**
 * Fixed-Δt Object.is gate vs live OR `.f64bin`.
 * After hierarchical AJ GradN/VOL + DT1/mass fixes, coarse 2×2×4 holds
 * metrics+coords Object.is for ≥10 steps at Δt=2.5e-8.
 */
import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { openRadiossAvailable, runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

const hasOrAbi = (): boolean => {
  try {
    return loadOrForceKernel();
  } catch {
    return false;
  }
};

function makeFixed(endTime: number, fixedDt = 2.5e-8) {
  const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
  m.controls.endTime = endTime;
  m.controls.fixedDt = fixedDt;
  m.controls.adaptiveDt = false;
  m.controls.runToEnd = true;
  return m;
}

describe("taylor short-horizon Object.is vs live .f64bin", () => {
  it.skipIf(!openRadiossAvailable() || !hasOrAbi())(
    "1×Δt: OR-ABI and TS metrics+coords Object.is with live host dump",
    () => {
      const fixedDt = 2.5e-8;
      const live = runOpenRadiossTaylorOracle(makeFixed(fixedDt), `/tmp/or-objis-1step`);
      expect(live.metrics.coordSource).toBe("f64bin");
      const liveCoords = scrubNearZeros(live.coords);

      resetOrElementState();
      process.env["WMBD_OR_CALL_S8E"] = "1";
      const orAbi = solveExplicit(makeFixed(fixedDt), {
        maxWallMs: 120_000,
        hexForce: (a) => hexInternalForcesOr(a),
      });
      const ts = solveExplicit(makeFixed(fixedDt), { maxWallMs: 120_000 });

      for (const [label, ours] of [
        ["orAbi", orAbi],
        ["ts", ts],
      ] as const) {
        const cmp = compareToOracle(ours.metrics, live.metrics);
        const al = alignedCoordGap(scrubNearZeros(ours.coords), liveCoords);
        expect(cmp.bitwiseEqual, `${label} metrics`).toBe(true);
        expect(al.bitwiseEqual, `${label} coords`).toBe(true);
        expect(ours.metrics.nSteps).toBe(1);
      }
    },
    180_000,
  );

  it.skipIf(!openRadiossAvailable() || !hasOrAbi())(
    "10×Δt: OR-ABI and TS metrics+coords Object.is with live host dump",
    () => {
      const fixedDt = 2.5e-8;
      const endTime = 10 * fixedDt;
      const live = runOpenRadiossTaylorOracle(makeFixed(endTime), `/tmp/or-objis-10step`);
      expect(live.metrics.coordSource).toBe("f64bin");
      const liveCoords = scrubNearZeros(live.coords);

      resetOrElementState();
      process.env["WMBD_OR_CALL_S8E"] = "1";
      const orAbi = solveExplicit(makeFixed(endTime), {
        maxWallMs: 120_000,
        hexForce: (a) => hexInternalForcesOr(a),
      });
      const ts = solveExplicit(makeFixed(endTime), { maxWallMs: 120_000 });

      for (const [label, ours] of [
        ["orAbi", orAbi],
        ["ts", ts],
      ] as const) {
        const cmp = compareToOracle(ours.metrics, live.metrics);
        const al = alignedCoordGap(scrubNearZeros(ours.coords), liveCoords);
        expect(cmp.bitwiseEqual, `${label} metrics`).toBe(true);
        expect(al.bitwiseEqual, `${label} coords`).toBe(true);
        expect(ours.metrics.nSteps).toBe(10);
      }
    },
    180_000,
  );
});
