import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { solveInflate } from "../src/fe/inflateSolver.js";
import {
  cstTrianglesFromQuads,
  edgeConsistency,
  orientTrianglesOutward,
  shellWindingReport,
  signedVolumeOfTriangles,
} from "../src/inflate/orientShell.js";
import { compareInflateToGolden, diagnosisMissMatchesLock, toySamplesFromSolve } from "../src/oracle/compareInflate.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "../src/oracle/inflateGolden.js";

describe("diagnosis: kill-off freeze locked; Themis deck-spread expected to miss", () => {
  it("diagnosis: kill-off freeze at frame 8 / stretch 2.105, Themis miss, no punch", () => {
    assertGoldenLawMatchesLock();
    const golden = loadInflateGolden();
    expect(golden.bands.lambdaRel).toBe(0.02);
    expect(golden.bands.volumeRel).toBe(0.05);
    expect(golden.bands.pressureRel).toBe(0.05);
    const model = createInflateAModel();
    expect(model.controls.damping).toEqual({ kind: "off" });
    const a = solveInflate(model, { maxWallMs: 600_000 });
    const b = solveInflate(model, { maxWallMs: 600_000 });
    expect(a.metrics.nSteps).toBe(b.metrics.nSteps);
    expect(a.metrics.warn).not.toBeNull();
    if (a.metrics.warn === null || b.metrics.warn === null) return;
    expect(Object.is(a.metrics.warn.lambdaMax, b.metrics.warn.lambdaMax)).toBe(true);
    expect(a.metrics.warn.psi_J).toBeGreaterThanOrEqual(0);
    expect(a.metrics.punchedThrough).toBe(false);
    expect(a.metrics.warn.frame).toBe(8);
    expect(a.metrics.warn.lambdaMax).toBeCloseTo(2.105201010510652, 8);
    expect(a.metrics.warn.frame).toBe(a.lambdaHistory.length - 1);
    expect(a.metrics.lambdaMax).toBe(a.metrics.warn.lambdaMax);
    expect(a.law.mu1).toBe(golden.law.mu1);
    expect(a.law.rho).toBe(golden.law.rho);
    const cmp = compareInflateToGolden(
      { ...a.metrics, law: a.law, samples: toySamplesFromSolve(a) },
      golden,
    );
    expect(cmp.lawEqual).toBe(true);
    expect(cmp.loadFamilyEqual).toBe(true);
    expect(cmp.gatingBar).toBe("themis-deck-spread");
    expect(cmp.ok).toBe(false);
    expect(cmp.themisOk).toBe(false);
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
    expect(a.metrics.t).toBe(a.metrics.warn.t);
  }, 120_000);
});
