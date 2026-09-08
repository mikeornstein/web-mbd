import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { hexInternalForces } from "../src/fe/hex.js";
import {
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";

const soHex = join(process.cwd(), "native/force-kernel/or-extract/build/libwmbd_or_hex.so");

describe("OpenRadioss S8EFORC3 force backend", () => {
  it.skipIf(!existsSync(soHex))(
    "loads OR extract and runs a coarse Taylor CD loop",
    () => {
      expect(loadOrForceKernel()).toBe(true);
      resetOrElementState();

      const make = () => {
        const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
        m.controls.endTime = 2e-6;
        m.controls.runToEnd = true;
        return m;
      };

      const or = solveExplicit(make(), {
        maxWallMs: 120_000,
        hexForce: (a) => hexInternalForcesOr(a),
      });
      const ts = solveExplicit(make(), {
        maxWallMs: 120_000,
        hexForce: (a) => hexInternalForces({ ...a, options: { jcvt: 1 } }),
      });

      expect(or.metrics.nSteps).toBe(ts.metrics.nSteps);
      expect(Number.isFinite(or.metrics.lengthRatio)).toBe(true);
      expect(Number.isFinite(or.metrics.radiusRatio)).toBe(true);
      expect(or.metrics.lengthRatio).toBeLessThan(1);
      expect(or.metrics.radiusRatio).toBeGreaterThan(1);
      // Short coarse horizon: formulation residual still O(0.1) on Rf.
      expect(Math.abs(or.metrics.lengthRatio - ts.metrics.lengthRatio) / ts.metrics.lengthRatio).toBeLessThan(
        0.02,
      );
    },
    180_000,
  );
});
