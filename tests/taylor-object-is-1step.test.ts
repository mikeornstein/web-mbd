/**
 * Fixed-Δt short-horizon Object.is gate vs live OR `.f64bin`.
 * 1–2 steps must be bit-identical (metrics + scrubbed coords). Coords lose
 * Object.is by step 3 (~1 ulp on cylinder corners) — tracked but not gated yet.
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

describe("taylor short-horizon Object.is vs live .f64bin", () => {
  it.skipIf(!openRadiossAvailable() || !hasOrAbi())(
    "1×Δt: OR-ABI and TS metrics+coords Object.is with live host dump",
    () => {
      const fixedDt = 2.5e-8;
      const endTime = fixedDt;
      const make = () => {
        const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
        m.controls.endTime = endTime;
        m.controls.fixedDt = fixedDt;
        m.controls.adaptiveDt = false;
        m.controls.runToEnd = true;
        return m;
      };

      const live = runOpenRadiossTaylorOracle(make(), `/tmp/or-objis-1step`);
      expect(live.metrics.coordSource).toBe("f64bin");
      const liveCoords = scrubNearZeros(live.coords);

      resetOrElementState();
      process.env["WMBD_OR_CALL_S8E"] = "1";
      const orAbi = solveExplicit(make(), {
        maxWallMs: 120_000,
        hexForce: (a) => hexInternalForcesOr(a),
      });
      const ts = solveExplicit(make(), { maxWallMs: 120_000 });

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
});
