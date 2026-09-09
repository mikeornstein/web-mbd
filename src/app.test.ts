import { expect, test } from "vitest";
import { pageTitle, productName, statusLabel } from "./app.ts";
import {
  getResearchStockModel,
  metricsPassAcceptance,
  RESEARCH_STOCK_MODELS,
} from "./research/catalog.ts";
import { solveExplicit } from "./fe/solver.ts";

test("pageTitle includes the product name", () => {
  expect(pageTitle()).toContain(productName);
});

test("status is mvp", () => {
  expect(statusLabel).toBe("mvp");
});

test("research catalog exposes the Taylor bar stock model", () => {
  expect(RESEARCH_STOCK_MODELS.length).toBeGreaterThan(0);
  const taylor = getResearchStockModel("taylor-bar-copper");
  expect(taylor.researchPath).toContain("04-validation-strategy");
  const model = taylor.create();
  expect(model.meta.name).toBe("taylor-bar-copper");
  expect(model.mesh.hexes.length).toBeGreaterThan(0);
});

test("stock Taylor model solves inside research acceptance bands", () => {
  const taylor = getResearchStockModel("taylor-bar-copper");
  const model = taylor.create();
  const result = solveExplicit(model, { maxWallMs: 600_000 });
  expect(metricsPassAcceptance(result.metrics, taylor.acceptance)).toBe(true);
  expect(result.history.length).toBeGreaterThan(1);
  expect(result.meshHistory.length).toBe(result.history.length);
  const first = result.meshHistory[0];
  const last = result.meshHistory[result.meshHistory.length - 1];
  expect(first).toBeDefined();
  expect(last).toBeDefined();
  if (first === undefined || last === undefined) return;
  expect(first.length).toBe(result.coords.length);
  for (let i = 0; i < result.coords.length; i++) {
    expect(first[i]).toBeCloseTo(model.mesh.coords[i] ?? Number.NaN, 12);
    expect(Object.is(last[i], result.coords[i])).toBe(true);
  }
  expect(result.metrics.maxEqPlasticStrain).toBeGreaterThan(0.5);
  expect(result.metrics.axialShortening).toBeGreaterThan(0);
}, 600_000);
