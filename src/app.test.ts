import { expect, test } from "vitest";
import { pageTitle, productName, statusLabel } from "./app.ts";
import {
  getResearchStockModel,
  metricsPassAcceptance,
  pageCatalogModels,
  RESEARCH_STOCK_MODELS,
} from "./research/catalog.ts";
import { solveExplicit } from "./fe/solver.ts";

test("pageTitle includes the product name", () => {
  expect(pageTitle()).toContain(productName);
});

test("status is mvp", () => {
  expect(statusLabel).toBe("mvp");
});

test("research catalog leads with Letter A, labels B, hides C from the page", () => {
  const pageIds = pageCatalogModels().map((m) => m.id);
  expect(pageIds[0]).toBe("inflate-a-desmopan");
  expect(pageIds).toContain("inflate-b-desmopan");
  expect(pageIds).not.toContain("inflate-c-desmopan");
  expect(pageIds).toContain("taylor-bar-copper");

  const inflate = getResearchStockModel("inflate-a-desmopan");
  expect(inflate.kind).toBe("inflate-nh-membrane");
  if (inflate.kind !== "inflate-nh-membrane") return;
  const model = inflate.create();
  expect(model.kind).toBe("inflate-nh-membrane");
  expect(model.mesh.nQuads).toBe(1554);
  expect(model.mesh.nTris).toBe(0);
  expect(model.law.loadFamily).toBe("dynamic-pload-40ms");
  expect(inflate.validation).toBe("radioss-dynamic-golden");
  expect(inflate.listedOnPage).toBe(true);
  expect(inflate.summary).toContain("only validated inflate letter");
  expect(inflate.summary).toContain("outward-oriented");
  expect(inflate.summary).toContain("not validated");
  expect(inflate.summary).toContain("54 kPa figure is not claimed");
  expect(model.controls.contactKind).toBe("node-node");
  expect(() => getResearchStockModel("inflate-a-qs-ish")).toThrow(/unknown research stock model/);

  const b = getResearchStockModel("inflate-b-desmopan");
  expect(b.kind).toBe("inflate-nh-membrane");
  if (b.kind !== "inflate-nh-membrane") return;
  expect(b.validation).toBe("unvalidated-demo");
  expect(b.listedOnPage).toBe(true);
  expect(b.title).toContain("unvalidated demo, unstable past stretch 2");
  expect(b.summary).toContain("unstable past stretch 2");
  expect(b.summary).toContain("404 of 2178");
  expect(b.summary).toContain("refine ladder");
  expect(b.summary.toLowerCase()).not.toContain("playable");
  const bModel = b.create();
  expect(bModel.mesh.letter).toBe("B");
  expect(bModel.law.mu1).toBe(model.law.mu1);
  expect(bModel.law.gapMin).toBe(model.law.gapMin);

  const c = getResearchStockModel("inflate-c-desmopan");
  expect(c.kind).toBe("inflate-nh-membrane");
  if (c.kind !== "inflate-nh-membrane") return;
  expect(c.validation).toBe("unvalidated-demo-unstable");
  expect(c.listedOnPage).toBe(false);
  expect(c.title).toContain("unstable");
  expect(c.summary).toContain("412 of 1972");
  expect(c.summary).toContain("refine ladder");
  expect(c.summary.toLowerCase()).not.toContain("playable");
  const cModel = c.create();
  expect(cModel.mesh.letter).toBe("C");
  expect(cModel.law.h0).toBe(model.law.h0);

  expect(RESEARCH_STOCK_MODELS.some((m) => m.id === "inflate-c-desmopan")).toBe(true);
});

test("research catalog exposes the Taylor bar stock model", () => {
  expect(RESEARCH_STOCK_MODELS.length).toBeGreaterThan(0);
  const taylor = getResearchStockModel("taylor-bar-copper");
  expect(taylor.kind).toBe("taylor-j2-hex");
  if (taylor.kind !== "taylor-j2-hex") return;
  expect(taylor.researchPath).toContain("04-validation-strategy");
  const model = taylor.create();
  expect(model.meta.name).toBe("taylor-bar-copper");
  expect(model.mesh.hexes.length).toBeGreaterThan(0);
});

test("stock Taylor model solves inside research acceptance bands", () => {
  const taylor = getResearchStockModel("taylor-bar-copper");
  expect(taylor.kind).toBe("taylor-j2-hex");
  if (taylor.kind !== "taylor-j2-hex") return;
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
