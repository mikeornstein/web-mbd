import { describe, expect, it } from "vitest";
import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { createCylinderHexMesh } from "../src/mesh/cylinderHex.js";
import { hexVolume, gatherHex } from "../src/fe/hex.js";

describe("cylinder hex mesh", () => {
  it("has positive element volumes", () => {
    const mesh = createCylinderHexMesh({ radius: 0.0032, length: 0.0324, nSide: 4, nZ: 8 });
    const x = new Float64Array(24);
    for (let e = 0; e < mesh.hexes.length / 8; e++) {
      const conn = mesh.hexes.slice(e * 8, e * 8 + 8);
      gatherHex(mesh.coords, conn, x);
      expect(hexVolume(x)).toBeGreaterThan(0);
    }
  });
});

describe("taylor bar MVP", () => {
  it("runs deterministically and lands in published shape bands", () => {
    const model = createTaylorBarModel({ nSide: 3, nZ: 8 });
    const a = solveExplicit(model, { maxWallMs: 300_000 });
    const b = solveExplicit(model, { maxWallMs: 300_000 });

    expect(a.metrics.nSteps).toBe(b.metrics.nSteps);
    expect(a.metrics.lengthRatio).toBeCloseTo(b.metrics.lengthRatio, 12);
    expect(a.metrics.radiusRatio).toBeCloseTo(b.metrics.radiusRatio, 12);
    expect(a.history.length).toBe(b.history.length);
    for (let i = 0; i < a.coords.length; i++) {
      expect(a.coords[i]).toBeCloseTo(b.coords[i]!, 12);
    }

    expect(a.metrics.lengthRatio).toBeGreaterThanOrEqual(TAYLOR_ACCEPTANCE.lengthRatio.min);
    expect(a.metrics.lengthRatio).toBeLessThanOrEqual(TAYLOR_ACCEPTANCE.lengthRatio.max);
    expect(a.metrics.radiusRatio).toBeGreaterThanOrEqual(TAYLOR_ACCEPTANCE.radiusRatio.min);
    expect(a.metrics.radiusRatio).toBeLessThanOrEqual(TAYLOR_ACCEPTANCE.radiusRatio.max);
    expect(Math.abs(a.metrics.energyErrorPct)).toBeLessThanOrEqual(
      TAYLOR_ACCEPTANCE.energyErrorPctAbsMax,
    );
  }, 300_000);
});
