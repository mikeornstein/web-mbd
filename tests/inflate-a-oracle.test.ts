import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { solveInflate } from "../src/fe/inflateSolver.js";
import { cstSample, splitQuadCsts } from "../src/fe/membraneCst.js";
import { enclosedVolume } from "../src/inflate/meshA.js";
import { compareInflateToGolden } from "../src/oracle/compareInflate.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "../src/oracle/inflateGolden.js";

describe("letter-A inflate vs Radioss golden", () => {
  it("rest mesh has Ψ ≈ 0 and V ≈ 354 mL", () => {
    const model = createInflateAModel();
    let psi = 0;
    let resid = 0;
    for (let e = 0; e < model.mesh.nQuads; e++) {
      const pair = splitQuadCsts(
        model.mesh.coords,
        model.mesh.quads[e * 4]!,
        model.mesh.quads[e * 4 + 1]!,
        model.mesh.quads[e * 4 + 2]!,
        model.mesh.quads[e * 4 + 3]!,
      );
      if (!pair) continue;
      const a = cstSample(model.mesh.coords, pair.a, model.law.mu1, model.law.h0);
      const b = cstSample(model.mesh.coords, pair.b, model.law.mu1, model.law.h0);
      psi += a.W + b.W;
      resid = Math.max(resid, a.incompressResidual, b.incompressResidual);
    }
    expect(psi).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.abs(psi)).toBeLessThan(1e-8);
    expect(resid).toBeLessThan(1e-12);
    expect(enclosedVolume(model.mesh.coords, model.mesh.quads) * 1e6).toBeCloseTo(354, 0);
  });

  it("reaches first λ≥2 inside Themis bands vs checked-in Radioss golden", () => {
    assertGoldenLawMatchesLock();
    const golden = loadInflateGolden();
    const model = createInflateAModel();
    const a = solveInflate(model, { maxWallMs: 600_000 });
    const b = solveInflate(model, { maxWallMs: 600_000 });
    expect(a.metrics.nSteps).toBe(b.metrics.nSteps);
    expect(a.metrics.warn).not.toBeNull();
    if (a.metrics.warn === null || b.metrics.warn === null) return;
    expect(Object.is(a.metrics.warn.lambdaMax, b.metrics.warn.lambdaMax)).toBe(true);
    expect(a.metrics.warn.psi_J).toBeGreaterThanOrEqual(0);
    expect(a.metrics.punchedThrough).toBe(false);
    expect(a.metrics.warn.lambdaMax).toBeGreaterThanOrEqual(2);
    expect(a.metrics.warn.lambdaMax).toBeLessThan(3);
    expect(a.metrics.warn.frame).toBe(a.lambdaHistory.length - 1);
    expect(a.metrics.lambdaMax).toBe(a.metrics.warn.lambdaMax);
    expect(a.metrics.contactClass).toBe("type19-class-gapmin-node-node");
    expect(a.metrics.loadFamily).toBe(golden.loadFamily);
    expect(a.law.mu1).toBe(golden.law.mu1);
    expect(a.law.rho).toBe(golden.law.rho);
    const cmp = compareInflateToGolden({ ...a.metrics, law: a.law }, golden);
    expect(cmp.lawEqual).toBe(true);
    expect(cmp.loadFamilyEqual).toBe(true);
    expect(cmp.ok).toBe(true);
  }, 120_000);
});
