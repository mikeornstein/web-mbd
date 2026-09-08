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

      // OR extract defaults to JCVT=0 (Jaumann), matching live OR for Taylor
      // (co-rot extract pack still drifts). Compare like-for-like.
      const or = solveExplicit(make(), {
        maxWallMs: 120_000,
        hexForce: (a) => hexInternalForcesOr(a),
      });
      const ts = solveExplicit(make(), {
        maxWallMs: 120_000,
        hexForce: (a) => hexInternalForces({ ...a, options: { jcvt: 0 } }),
      });

      expect(or.metrics.nSteps).toBe(ts.metrics.nSteps);
      expect(Number.isFinite(or.metrics.lengthRatio)).toBe(true);
      expect(Number.isFinite(or.metrics.radiusRatio)).toBe(true);
      expect(or.metrics.lengthRatio).toBeLessThan(1);
      expect(or.metrics.radiusRatio).toBeGreaterThan(1);
      // OR S8EFORC3 (JCVT=0) vs TS Jaumann: near Object.is on short horizon.
      const relLf =
        Math.abs(or.metrics.lengthRatio - ts.metrics.lengthRatio) / ts.metrics.lengthRatio;
      const relRf =
        Math.abs(or.metrics.radiusRatio - ts.metrics.radiusRatio) / ts.metrics.radiusRatio;
      expect(relLf).toBeLessThan(1e-12);
      expect(relRf).toBeLessThan(1e-12);
    },
    180_000,
  );
});
