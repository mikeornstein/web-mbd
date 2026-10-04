import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { solveInflate } from "../src/fe/inflateSolver.js";
import { cstSample, splitQuadCsts } from "../src/fe/membraneCst.js";
import { enclosedVolume, trueEnclosedVolume } from "../src/inflate/meshA.js";

describe("letter-A inflate rest mesh and warn freeze", () => {
  it("rest mesh has Ψ ≈ 0 and true enclosed V ≈ 420.5 mL", () => {
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
    expect(trueEnclosedVolume(model.mesh.coords, model.mesh.quads) * 1e6).toBeCloseTo(420.5, 0);
    expect(enclosedVolume(model.mesh.coords, model.mesh.quads) * 1e6).toBeCloseTo(420.5, 0);
  });

  it("does not keep history past the warn freeze", () => {
    const model = createInflateAModel();
    const a = solveInflate(model, { maxWallMs: 600_000 });
    expect(a.metrics.warn).not.toBeNull();
    if (a.metrics.warn === null) return;
    expect(a.lambdaHistory.length - 1).toBe(a.metrics.warn.frame);
    expect(a.meshHistory.length - 1).toBe(a.metrics.warn.frame);
    expect(a.lambdaHistory[a.metrics.warn.frame]).toBeGreaterThanOrEqual(2);
    const past = a.lambdaHistory.slice(a.metrics.warn.frame + 1);
    expect(past).toHaveLength(0);
    expect(a.metrics.t).toBe(a.metrics.warn.t);
  }, 120_000);
});
