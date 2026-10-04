import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { solveInflate } from "../src/fe/inflateSolver.js";
import { cstSample, splitQuadCsts } from "../src/fe/membraneCst.js";
import { enclosedVolume, trueEnclosedVolume } from "../src/inflate/meshA.js";
import {
  cstTrianglesFromQuads,
  edgeConsistency,
  orientTrianglesOutward,
  shellWindingReport,
  signedVolumeOfTriangles,
} from "../src/inflate/orientShell.js";
import { compareInflateToGolden, diagnosisMissMatchesLock } from "../src/oracle/compareInflate.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "../src/oracle/inflateGolden.js";

describe("letter-A inflate vs Radioss golden", () => {
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

  it("live toy snap-through vs oriented Radioss is a miss at locked 2/5/5 bands (do not widen)", () => {
    assertGoldenLawMatchesLock();
    const golden = loadInflateGolden();
    expect(golden.bands.lambdaRel).toBe(0.02);
    expect(golden.bands.volumeRel).toBe(0.05);
    expect(golden.bands.pressureRel).toBe(0.05);
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
    expect(a.metrics.warn.frame).toBe(12);
    expect(a.metrics.warn.lambdaMax).toBeCloseTo(4.332389712832123, 8);
    expect(a.lambdaHistory[11]).toBeCloseTo(1.6119729537867542, 8);
    expect(a.metrics.warn.frame).toBe(a.lambdaHistory.length - 1);
    expect(a.metrics.lambdaMax).toBe(a.metrics.warn.lambdaMax);
    expect(a.metrics.contactClass).toBe("type19-class-gapmin-node-node");
    expect(a.metrics.loadFamily).toBe(golden.loadFamily);
    expect(a.law.mu1).toBe(golden.law.mu1);
    expect(a.law.rho).toBe(golden.law.rho);
    const cmp = compareInflateToGolden({ ...a.metrics, law: a.law }, golden);
    expect(cmp.lawEqual).toBe(true);
    expect(cmp.loadFamilyEqual).toBe(true);
    expect(cmp.ok).toBe(false);
    const diagnosis = diagnosisMissMatchesLock(cmp, golden, a.metrics.warn);
    expect(diagnosis.ok).toBe(true);

    const restWind = shellWindingReport(model.mesh.coords, model.mesh.quads, model.mesh.tris);
    const warnCoords = a.meshHistory[a.metrics.warn.frame];
    expect(warnCoords).toBeDefined();
    if (warnCoords === undefined) return;
    const warnWind = shellWindingReport(warnCoords, model.mesh.quads, model.mesh.tris);
    expect(restWind.trianglesNeedingFlip).toBe(0);
    expect(warnWind.trianglesNeedingFlip).toBe(0);
    expect(warnWind.inconsistentEdgeCount).toBe(0);
    const source = cstTrianglesFromQuads(model.mesh.quads);
    const restOrient = orientTrianglesOutward(model.mesh.coords, source);
    expect(restOrient.flipped.filter(Boolean)).toHaveLength(0);
    expect(edgeConsistency(source).inconsistentEdgeCount).toBe(0);
    expect(signedVolumeOfTriangles(warnCoords, source)).toBeGreaterThan(0);
    expect(a.metrics.warn.frame).toBe(a.lambdaHistory.length - 1);
    expect(a.metrics.t).toBe(a.metrics.warn.t);
  }, 120_000);

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
