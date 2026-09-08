import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { hexInternalForces } from "../src/fe/hex.js";
import { hexInternalForcesNative, loadNativeForceKernel } from "../src/cli/forceNative.js";
import { makeForceKernel } from "./forceKernelBuild.js";

describe("native force backend", () => {
  it("matches TypeScript solver Object.is on a coarse Taylor run (jcvt=0)", () => {
    const build = makeForceKernel("libforce_kernel.so");
    expect(build.status, build.stderr + build.stdout).toBe(0);
    expect(loadNativeForceKernel()).toBe(true);

    // Pin jcvt=0 (Jaumann) for bit-identical TS↔C; default jcvt=1 (co-rot)
    // matches the Taylor deck but accumulates ~1 ulp over many steps.
    const opts = { jcvt: 0 as const };
    const make = () => {
      const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
      m.controls.endTime = 10e-6;
      m.controls.runToEnd = true;
      return m;
    };
    const ts = solveExplicit(make(), {
      maxWallMs: 120_000,
      hexForce: (a) => hexInternalForces({ ...a, options: opts }),
    });
    const native = solveExplicit(make(), {
      maxWallMs: 120_000,
      hexForce: (a) => hexInternalForcesNative({ ...a, options: opts }),
    });

    expect(native.metrics.nSteps).toBe(ts.metrics.nSteps);
    expect(Object.is(native.metrics.lengthRatio, ts.metrics.lengthRatio)).toBe(true);
    expect(Object.is(native.metrics.radiusRatio, ts.metrics.radiusRatio)).toBe(true);
    for (let i = 0; i < ts.coords.length; i++) {
      expect(Object.is(native.coords[i], ts.coords[i]!)).toBe(true);
    }
  }, 180_000);
});
