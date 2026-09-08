import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { createCylinderHexMesh } from "../src/mesh/cylinderHex.js";
import { hexVolume, gatherHex } from "../src/fe/hex.js";
import { metricsPassAcceptance } from "../src/research/catalog.js";
import { compareToOracle } from "../src/oracle/compare.js";

const oraclePin = JSON.parse(
  readFileSync(new URL("../src/oracle/taylor-bar-oracle.json", import.meta.url), "utf8"),
) as {
  oracle: { lengthRatio: number; radiusRatio: number };
};

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
  it("runs deterministically and lands in tightened shape bands", () => {
    const model = createTaylorBarModel();
    const a = solveExplicit(model, { maxWallMs: 600_000 });
    const b = solveExplicit(model, { maxWallMs: 600_000 });

    expect(a.metrics.nSteps).toBe(b.metrics.nSteps);
    expect(a.metrics.lengthRatio).toBeCloseTo(b.metrics.lengthRatio, 12);
    expect(a.metrics.radiusRatio).toBeCloseTo(b.metrics.radiusRatio, 12);
    expect(a.metrics.maxEqPlasticStrain).toBeCloseTo(b.metrics.maxEqPlasticStrain, 12);
    expect(a.history.length).toBe(b.history.length);
    for (let i = 0; i < a.coords.length; i++) {
      expect(a.coords[i]).toBeCloseTo(b.coords[i]!, 12);
    }

    expect(metricsPassAcceptance(a.metrics, TAYLOR_ACCEPTANCE)).toBe(true);
    expect(model.mesh.hexes.length / 8).toBe(6 * 6 * 16);
  }, 600_000);

  it("matches the pinned OpenRadioss oracle within relative tolerances", () => {
    const model = createTaylorBarModel();
    const result = solveExplicit(model, { maxWallMs: 600_000 });
    const cmp = compareToOracle(result.metrics, oraclePin.oracle);
    expect(cmp.lengthRelError).toBeLessThanOrEqual(cmp.tolerances.lengthRatioRel);
    expect(cmp.radiusRelError).toBeLessThanOrEqual(cmp.tolerances.radiusRatioRel);
    expect(cmp.ok).toBe(true);
  }, 600_000);
});
