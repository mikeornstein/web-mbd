/**
 * Per-step energy bookkeeping rules, locked before the run.
 * Not a physics pass. Do not widen any bar. Do not apply a time shift.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RAYLEIGH_ALPHA } from "../src/inflate/constants.js";
import {
  BOOKKEEPING_REL,
  ENERGY_AGREE_REL,
  MEDIAN_STRAIN_AGREE_REL,
} from "../src/oracle/stretchDiagnosticRules.js";
import {
  DAMPING_CROSSCHECK_REL,
  ENGINE_STEP_CAP_S,
  PER_STEP_CLOSE_REL,
  PER_STEP_ENERGY_RULES_LINES,
  PER_STEP_EVERY_FRAME_MS,
  PER_STEP_GATE_MS,
  RAYLEIGH_TWO_ALPHA,
  RULE_PER_STEP_0_SUM,
  RULE_PER_STEP_1_TWO_SIZES,
  RULE_PER_STEP_2_SIGN,
  RULE_PER_STEP_3_DAMPING,
  RULE_PER_STEP_5_SAMPLING,
  RULE_PER_STEP_6_DEFECT,
  VERDICT_PER_STEP_DAMPING,
  VERDICT_PER_STEP_DEFECT,
  VERDICT_PER_STEP_DISAGREE,
  VERDICT_PER_STEP_SAMPLING,
  dampingCrossCheck,
  scorePerStepEnergyGate,
  signedEnergyGap,
  type PerStepEnergyFrame,
  type PerStepRunInput,
} from "../src/oracle/perStepEnergyRules.js";
import { perStepEnergyPageText } from "../src/oracle/perStepEnergyResults.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function closingFrames(): PerStepEnergyFrame[] {
  return [0, 2, 4, 6, 8, 10, 12, 14, 16].map((t_ms) => {
    const strain_J = 0.1 * t_ms;
    const kinetic_J = 0.01;
    const dampingLogged_J = 0.02 * t_ms;
    const keIntegral_J_s = dampingLogged_J / RAYLEIGH_TWO_ALPHA;
    return {
      t_ms,
      strain_J,
      kinetic_J,
      dampingLogged_J,
      keIntegral_J_s,
      dampingForceWork_J: dampingLogged_J,
      pressureWork_J: strain_J + kinetic_J + dampingLogged_J,
      interpolated: t_ms === 10 || t_ms === 12 || t_ms === 14,
    };
  });
}

function runOf(label: string, frames: PerStepEnergyFrame[], meanDt_s: number): PerStepRunInput {
  return { label, frames, meanDt_s, nSteps: 100 };
}

describe("per-step energy rules locked before the run", () => {
  it("prediction file still carries the locked rules written before the run", () => {
    const text = readFileSync(new URL("stretch-per-step-energy-prediction.md", DIAG), "utf8");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Written **before** any per-step energy run");
    expect(flat).toContain("Do not change this file after seeing numbers");
    expect(flat).toContain("pinned only to the OpenCourant copy");
    expect(flat).toContain("dtMax = 0.000002");
    expect(flat).toContain("160 × the time integral");
    expect(flat).toContain("within 1%");
    expect(flat).toContain("energy is leaving uncounted");
    expect(flat).toContain("energy appears from nowhere");
    expect(flat).toContain(RULE_PER_STEP_5_SAMPLING.slice(0, 40));
    expect(flat).toContain(RULE_PER_STEP_6_DEFECT.slice(0, 40));
    expect(PER_STEP_CLOSE_REL).toBe(0.03);
    expect(BOOKKEEPING_REL).toBe(0.03);
    expect(ENERGY_AGREE_REL).toBe(0.05);
    expect(MEDIAN_STRAIN_AGREE_REL).toBe(0.05);
    expect(DAMPING_CROSSCHECK_REL).toBe(0.01);
    expect(ENGINE_STEP_CAP_S).toBe(0.000002);
    expect(RAYLEIGH_TWO_ALPHA).toBe(160);
    expect(RAYLEIGH_TWO_ALPHA).toBe(2 * RAYLEIGH_ALPHA);
    expect([...PER_STEP_GATE_MS]).toEqual([2, 4, 6, 8]);
    expect([...PER_STEP_EVERY_FRAME_MS]).toEqual([0, 2, 4, 6, 8, 16]);
    const page = perStepEnergyPageText();
    expect(page.rules).toContain(RULE_PER_STEP_0_SUM.slice(0, 24));
    expect(page.rules).toContain(RULE_PER_STEP_1_TWO_SIZES.slice(0, 24));
    expect(page.rules).toContain(RULE_PER_STEP_2_SIGN.slice(0, 24));
    expect(page.rules).toContain(RULE_PER_STEP_3_DAMPING.slice(0, 24));
    expect(page.results).toContain("Results not yet written. Rules were committed first.");
    expect(PER_STEP_ENERGY_RULES_LINES.length).toBeGreaterThan(8);
  });

  it("positive gap means pressure work larger (energy leaving uncounted)", () => {
    const gap = signedEnergyGap(1.3, 1.0);
    expect(gap.sign).toBe("positive");
    expect(gap.gap_J).toBeCloseTo(0.3);
    expect(gap.close).toBe(false);
  });

  it("negative gap means pressure work smaller (energy appears from nowhere)", () => {
    const gap = signedEnergyGap(1.0, 1.3);
    expect(gap.sign).toBe("negative");
    expect(gap.gap_J).toBeCloseTo(-0.3);
    expect(gap.close).toBe(false);
  });

  it("closes under the unchanged 3% bar", () => {
    expect(signedEnergyGap(1.0, 1.02).close).toBe(true);
    expect(signedEnergyGap(1.0, 1.04).close).toBe(false);
  });

  it("damping cross-check is 160 times the kinetic-energy integral within 1%", () => {
    const ok = dampingCrossCheck(1.6, 0.01);
    expect(ok.expected_J).toBeCloseTo(1.6);
    expect(ok.ok).toBe(true);
    const bad = dampingCrossCheck(1.0, 0.01);
    expect(bad.ok).toBe(false);
  });

  it("both step sizes close at every frame → sampling, then Chiron/Themis rows may run", () => {
    const frames = closingFrames();
    const score = scorePerStepEnergyGate(runOf("cfl", frames, 8e-6), runOf("cap", frames, 2e-6));
    expect(score.kind).toBe("sampling-was-the-gap");
    expect(score.verdictLine).toBe(VERDICT_PER_STEP_SAMPLING);
    expect(score.applyChironThemisRows).toBe(true);
    expect(score.stepSizesAgree).toBe(true);
  });

  it("both step sizes miss 2–8 ms → toy defect, no energy verdicts", () => {
    const broken = closingFrames().map((row) =>
      row.t_ms >= 2 && row.t_ms <= 8 ? { ...row, pressureWork_J: row.pressureWork_J * 2 } : row,
    );
    const score = scorePerStepEnergyGate(runOf("cfl", broken, 8e-6), runOf("cap", broken, 2e-6));
    expect(score.kind).toBe("toy-defect");
    expect(score.verdictLine).toBe(VERDICT_PER_STEP_DEFECT);
    expect(score.applyChironThemisRows).toBe(false);
    expect(score.cfl.missAtGateMs).toEqual([2, 4, 6, 8]);
    expect(score.cap.missAtGateMs).toEqual([2, 4, 6, 8]);
  });

  it("step sizes disagree → STOP, numbers not trustworthy", () => {
    const closed = closingFrames();
    const broken = closingFrames().map((row) =>
      row.t_ms === 2 ? { ...row, pressureWork_J: row.pressureWork_J * 2 } : row,
    );
    const score = scorePerStepEnergyGate(runOf("cfl", closed, 8e-6), runOf("cap", broken, 2e-6));
    expect(score.kind).toBe("step-sizes-disagree");
    expect(score.verdictLine).toBe(VERDICT_PER_STEP_DISAGREE);
    expect(score.applyChironThemisRows).toBe(false);
  });

  it("damping cross-check fail → STOP, damping bookkeeping is wrong", () => {
    const bad = closingFrames().map((row) => ({ ...row, dampingLogged_J: row.dampingLogged_J + 1 }));
    const score = scorePerStepEnergyGate(runOf("cfl", bad, 8e-6), runOf("cap", closingFrames(), 2e-6));
    expect(score.kind).toBe("damping-bookkeeping-wrong");
    expect(score.verdictLine).toBe(VERDICT_PER_STEP_DAMPING);
    expect(score.applyChironThemisRows).toBe(false);
  });
});
