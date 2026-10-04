/**
 * Shipped kill-off path: Letter A freeze, B labeled unstable, C hidden.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { describe, expect, it } from "vitest";
import {
  createInflateAModel,
  createInflateBModel,
  createInflateCModel,
} from "../src/fixtures/inflateA.js";
import { solveInflate } from "../src/fe/inflateSolver.js";
import { pageCatalogModels } from "../src/research/catalog.js";

describe("shipped kill-off path (Letter A / B / C)", () => {
  it("page lists A and B, hides C", () => {
    const ids = pageCatalogModels().map((m) => m.id);
    expect(ids).toContain("inflate-a-desmopan");
    expect(ids).toContain("inflate-b-desmopan");
    expect(ids).not.toContain("inflate-c-desmopan");
  });

  it("Letter A freeze is covered by the diagnosis lock; this file runs B and C", () => {
    expect(createInflateAModel().controls.damping).toEqual({ kind: "off" });
  });

  it("Letter B stays listed as unvalidated and may be unstable past stretch 2", () => {
    const model = createInflateBModel();
    expect(model.controls.damping).toEqual({ kind: "off" });
    const result = solveInflate(model, { maxWallMs: 600_000 });
    expect(result.metrics.warn === null || result.metrics.warn.lambdaMax >= 2).toBe(true);
  }, 120_000);

  it("Letter C remains hidden and is not a shipped letter", () => {
    const model = createInflateCModel();
    expect(model.controls.damping).toEqual({ kind: "off" });
    const result = solveInflate(model, { maxWallMs: 600_000 });
    expect(model.mesh.letter).toBe("C");
    expect(result.kind).toBe("inflate-nh-membrane");
  }, 120_000);
});
