import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { hexInternalForcesNative, loadNativeForceKernel } from "../src/cli/forceNative.js";

describe("native force backend", () => {
  it("matches TypeScript solver Object.is on a coarse Taylor run", () => {
    spawnSync("make", ["libforce_kernel.so"], {
      cwd: join(process.cwd(), "native/force-kernel"),
      encoding: "utf8",
    });
    expect(loadNativeForceKernel()).toBe(true);

    const make = () => {
      const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
      m.controls.endTime = 10e-6;
      m.controls.runToEnd = true;
      return m;
    };
    const ts = solveExplicit(make(), { maxWallMs: 120_000 });
    const native = solveExplicit(make(), {
      maxWallMs: 120_000,
      hexForce: hexInternalForcesNative,
    });

    expect(native.metrics.nSteps).toBe(ts.metrics.nSteps);
    expect(Object.is(native.metrics.lengthRatio, ts.metrics.lengthRatio)).toBe(true);
    expect(Object.is(native.metrics.radiusRatio, ts.metrics.radiusRatio)).toBe(true);
    for (let i = 0; i < ts.coords.length; i++) {
      expect(Object.is(native.coords[i], ts.coords[i]!)).toBe(true);
    }
  }, 180_000);
});
