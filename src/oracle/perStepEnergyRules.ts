/**
 * Per-step energy bookkeeping rules. Written before the measurement run.
 * Do not change these numbers or this verdict table after seeing results.
 * Do not apply any time shift. Do not widen any bar.
 */

import { RAYLEIGH_ALPHA } from "../inflate/constants.js";
import {
  BOOKKEEPING_REL,
  VERDICT_CONVENTION,
  VERDICT_DYNAMIC_LAG,
  VERDICT_MIXED,
  VERDICT_SPREADS_STRAIN,
} from "./stretchDiagnosticRules.js";

export const PER_STEP_NOT_COMPARE_GATE =
  "The per-step bookkeeping is a correctness gate on the toy. It does not turn a red compare:inflate into a green mark.";

export const PER_STEP_GATE_MS = [2, 4, 6, 8] as const;
export const PER_STEP_EVERY_FRAME_MS = [0, 2, 4, 6, 8, 16] as const;
export const PER_STEP_REPORT_MS = [0, 2, 4, 6, 8, 10, 12, 14, 16] as const;
export const ENGINE_STEP_CAP_S = 0.000002;
export const DAMPING_CROSSCHECK_REL = 0.01;
export const RAYLEIGH_TWO_ALPHA = 160;
export const PER_STEP_CLOSE_REL = BOOKKEEPING_REL;

export const RULE_PER_STEP_0_SUM =
  "0. Sum at every solver step, not between 2 ms animation frames. Pressure work: at each solver step add ½ (p at the end of the step + p at the start of the step) × (volume at the end − volume at the start). Pressure at the start is the pressure used to assemble that step. Volume at the end includes contact projection on that step. Strain energy is (shear modulus / 2) × rest thickness × sum over triangles of (first invariant − 3) × rest area, from node positions with the toy’s own function. Kinetic energy is ½ m |v|² at that frame. Logged damping loss is the trapezoid of twice the Rayleigh mass rate times kinetic energy, summed at every solver step. The Rayleigh force −α m v removes power α m |v|² = 2 α KE. Rayleigh mass rate α = 80 per second. This is not the remainder identity.";

export const RULE_PER_STEP_1_TWO_SIZES =
  "1. Two step sizes. Run the shipped kill-off Letter A toy with no time-step cap (about 8 microseconds) AND with dtMax = 0.000002 s (the engine’s 2 microsecond step). Do not change CFL, damping, mesh, stiffness, or load. The two must agree: for each of 2, 4, 6 and 8 ms, both close under 3% or both miss. If they disagree, STOP and report that the energy numbers are not trustworthy.";

export const RULE_PER_STEP_2_SIGN =
  "2. Signed gap per frame: gap = pressure work − (strain + kinetic + damping). Report sign and size. Positive (pressure work larger): energy is leaving uncounted (for example velocity clamping, unlogged damping, dissipation). Negative (pressure work smaller): energy appears from nowhere (for example first ramp steps, tension-field clamp, contact).";

export const RULE_PER_STEP_3_DAMPING =
  "3. Damping cross-check: logged damping loss must equal 160 × the time integral of kinetic energy (trapezoid at every solver step) within 1%. If it fails, the damping bookkeeping is wrong; STOP. Report an independent Rayleigh force-work sum (α m |v|² Δt using the velocity the force saw at assemble) next to that check. The 1% rule is logged versus 160 × the kinetic-energy integral, not the force-work column.";

export const RULE_PER_STEP_4_BAR =
  "4. Close bar (unchanged, not widened): |gap| / max(|pressure work|, |strain + kinetic + damping|, 10⁻¹²) ≤ 3% at a frame.";

export const RULE_PER_STEP_5_SAMPLING =
  "5. If the per-step sum closes under 3% at every reported frame at both step sizes: the earlier 2 ms-sample gap was sampling. Only the summation in the test and page changes. Then apply the already-committed Chiron/Themis decision rows (energy agrees / median / shift) with this per-step bookkeeping as the gate. Do not apply a time shift. Do not widen any bar.";

export const RULE_PER_STEP_6_DEFECT =
  "6. If the per-step sum stays above 3% at 2, 4, 6 or 8 ms at BOTH step sizes: it is a toy defect. Read the code and find it (candidates: the damping term, anything that clamps or zeroes velocity, the handling of the first ramp steps, tension-field clamp, contact). Report the defect with file and line. Propose the smallest fix but do not apply it. Early frames are not graded until it is fixed. Do not report energy-agrees / median / shift verdicts.";

export const RULE_PER_STEP_7_DAMPING_STOP =
  "7. If the damping cross-check fails at either step size: STOP, the damping bookkeeping is wrong. Do not report energy verdicts.";

export const RULE_PER_STEP_8_FRAMES =
  "8. Main evidence frames for the table are 0, 2, 4, 6, 8 and 16 ms. Interpolated 10, 12, 14 ms are reported but decide nothing for the Chiron/Themis rows. The 3% close at 2–8 ms is the defect criterion. “Every reported frame” in rule 5 means 0, 2, 4, 6, 8 and 16 ms.";

export const RULE_PER_STEP_9_NODES =
  "9. Node positions for Radioss decks: search the repository, run directories, and artifacts of pull requests 18 to 22 first. If animation frames are missing, say so and do not invent strain energy. Do not re-run Radioss without being told.";

export const VERDICT_PER_STEP_SAMPLING =
  "The earlier 2 ms-sample gap was sampling. Only the summation in the test and page changes.";

export const VERDICT_PER_STEP_DEFECT =
  "STOP: toy defect. Per-step bookkeeping stays above 3% at 2 to 8 ms at both step sizes. Early frames are not graded until it is fixed. No energy verdicts.";

export const VERDICT_PER_STEP_DISAGREE =
  "STOP: energy numbers are not trustworthy (the two step sizes disagree). No verdicts.";

export const VERDICT_PER_STEP_DAMPING =
  "STOP: damping bookkeeping is wrong (logged damping is not 160 × the kinetic-energy integral within 1%). No verdicts.";

export const VERDICT_PER_STEP_UNTRUSTWORTHY =
  "STOP: energy numbers are not trustworthy (per-step bookkeeping failed). No verdicts.";

export const PER_STEP_ENERGY_RULES_LINES: readonly string[] = [
  PER_STEP_NOT_COMPARE_GATE,
  RULE_PER_STEP_0_SUM,
  RULE_PER_STEP_1_TWO_SIZES,
  RULE_PER_STEP_2_SIGN,
  RULE_PER_STEP_3_DAMPING,
  RULE_PER_STEP_4_BAR,
  RULE_PER_STEP_5_SAMPLING,
  RULE_PER_STEP_6_DEFECT,
  RULE_PER_STEP_7_DAMPING_STOP,
  RULE_PER_STEP_8_FRAMES,
  RULE_PER_STEP_9_NODES,
];

export type GapSign = "positive" | "negative" | "zero";

export type PerStepGateKind =
  | "sampling-was-the-gap"
  | "toy-defect"
  | "step-sizes-disagree"
  | "damping-bookkeeping-wrong"
  | "stop-untrustworthy";

export interface PerStepEnergyFrame {
  t_ms: number;
  pressureWork_J: number;
  strain_J: number;
  kinetic_J: number;
  dampingLogged_J: number;
  keIntegral_J_s: number;
  dampingForceWork_J: number;
  interpolated: boolean;
}

export interface SignedGap {
  gap_J: number;
  rel: number;
  sign: GapSign;
  close: boolean;
}

export interface DampingCrossCheck {
  logged_J: number;
  keIntegral_J_s: number;
  expected_J: number;
  rel: number;
  ok: boolean;
}

export interface PerStepRunInput {
  label: string;
  meanDt_s: number;
  nSteps: number;
  frames: readonly PerStepEnergyFrame[];
}

export interface PerStepFrameScore extends PerStepEnergyFrame, SignedGap {
  damping: DampingCrossCheck;
}

export interface PerStepRunScore {
  label: string;
  meanDt_s: number;
  nSteps: number;
  frames: PerStepFrameScore[];
  dampingOk: boolean;
  dampingWorstRel: number | null;
  closeEveryEvidenceFrame: boolean;
  missAtGateMs: number[];
}

export interface PerStepGateScore {
  cfl: PerStepRunScore;
  cap: PerStepRunScore;
  stepSizesAgree: boolean;
  kind: PerStepGateKind;
  verdictLine: string;
  applyChironThemisRows: boolean;
}

if (BOOKKEEPING_REL !== 0.03) {
  throw new Error("per-step close bar must stay the committed 3%");
}
if (RAYLEIGH_TWO_ALPHA !== 2 * 80) {
  throw new Error("160 must stay 2 × 80");
}
if (RAYLEIGH_ALPHA !== 80) {
  throw new Error("Rayleigh mass rate drifted; do not retune");
}

export function signedEnergyGap(pressureWork_J: number, rhs_J: number): SignedGap {
  const gap_J = pressureWork_J - rhs_J;
  const denom = Math.max(Math.abs(pressureWork_J), Math.abs(rhs_J), 1e-12);
  const rel = Math.abs(gap_J) / denom;
  let sign: GapSign = "zero";
  if (gap_J > 0) sign = "positive";
  else if (gap_J < 0) sign = "negative";
  return { gap_J, rel, sign, close: rel <= PER_STEP_CLOSE_REL };
}

export function dampingCrossCheck(logged_J: number, keIntegral_J_s: number): DampingCrossCheck {
  const expected_J = RAYLEIGH_TWO_ALPHA * keIntegral_J_s;
  const denom = Math.max(Math.abs(logged_J), Math.abs(expected_J), 1e-12);
  const rel = Math.abs(logged_J - expected_J) / denom;
  return { logged_J, keIntegral_J_s, expected_J, rel, ok: rel <= DAMPING_CROSSCHECK_REL };
}

function frameAt(frames: readonly PerStepEnergyFrame[], t_ms: number): PerStepEnergyFrame | null {
  let best: PerStepEnergyFrame | null = null;
  let bestDt = Infinity;
  for (const row of frames) {
    const dt = Math.abs(row.t_ms - t_ms);
    if (dt < bestDt) {
      best = row;
      bestDt = dt;
    }
  }
  if (best === null || bestDt > 1.1) return null;
  return best;
}

function scoreRun(run: PerStepRunInput): PerStepRunScore {
  const frames: PerStepFrameScore[] = [];
  let dampingOk = true;
  let dampingWorstRel: number | null = 0;
  for (const row of run.frames) {
    const rhs = row.strain_J + row.kinetic_J + row.dampingLogged_J;
    const gap = signedEnergyGap(row.pressureWork_J, rhs);
    const damping = dampingCrossCheck(row.dampingLogged_J, row.keIntegral_J_s);
    if (dampingWorstRel === null || damping.rel > dampingWorstRel) dampingWorstRel = damping.rel;
    if (!damping.ok) dampingOk = false;
    frames.push({ ...row, ...gap, damping });
  }
  if (run.frames.length === 0) {
    dampingOk = false;
    dampingWorstRel = null;
  }
  const missAtGateMs: number[] = [];
  for (const t_ms of PER_STEP_GATE_MS) {
    const hit = frameAt(run.frames, t_ms);
    if (hit === null) {
      missAtGateMs.push(t_ms);
      continue;
    }
    const rhs = hit.strain_J + hit.kinetic_J + hit.dampingLogged_J;
    if (!signedEnergyGap(hit.pressureWork_J, rhs).close) missAtGateMs.push(t_ms);
  }
  let closeEveryEvidenceFrame = run.frames.length > 0;
  for (const t_ms of PER_STEP_EVERY_FRAME_MS) {
    const hit = frameAt(run.frames, t_ms);
    if (hit === null) {
      closeEveryEvidenceFrame = false;
      break;
    }
    const rhs = hit.strain_J + hit.kinetic_J + hit.dampingLogged_J;
    if (!signedEnergyGap(hit.pressureWork_J, rhs).close) {
      closeEveryEvidenceFrame = false;
      break;
    }
  }
  return {
    label: run.label,
    meanDt_s: run.meanDt_s,
    nSteps: run.nSteps,
    frames,
    dampingOk,
    dampingWorstRel,
    closeEveryEvidenceFrame,
    missAtGateMs,
  };
}

export function scorePerStepEnergyGate(cfl: PerStepRunInput, cap: PerStepRunInput): PerStepGateScore {
  const cflScore = scoreRun(cfl);
  const capScore = scoreRun(cap);
  let stepSizesAgree = true;
  for (const t_ms of PER_STEP_GATE_MS) {
    const a = cflScore.missAtGateMs.includes(t_ms);
    const b = capScore.missAtGateMs.includes(t_ms);
    if (a !== b) stepSizesAgree = false;
  }
  if (!cflScore.dampingOk || !capScore.dampingOk) {
    return {
      cfl: cflScore,
      cap: capScore,
      stepSizesAgree,
      kind: "damping-bookkeeping-wrong",
      verdictLine: VERDICT_PER_STEP_DAMPING,
      applyChironThemisRows: false,
    };
  }
  if (!stepSizesAgree) {
    return {
      cfl: cflScore,
      cap: capScore,
      stepSizesAgree,
      kind: "step-sizes-disagree",
      verdictLine: VERDICT_PER_STEP_DISAGREE,
      applyChironThemisRows: false,
    };
  }
  const bothClose = cflScore.closeEveryEvidenceFrame && capScore.closeEveryEvidenceFrame;
  if (bothClose) {
    return {
      cfl: cflScore,
      cap: capScore,
      stepSizesAgree,
      kind: "sampling-was-the-gap",
      verdictLine: VERDICT_PER_STEP_SAMPLING,
      applyChironThemisRows: true,
    };
  }
  const bothMissEarly = cflScore.missAtGateMs.length > 0 && capScore.missAtGateMs.length > 0;
  if (bothMissEarly) {
    return {
      cfl: cflScore,
      cap: capScore,
      stepSizesAgree,
      kind: "toy-defect",
      verdictLine: VERDICT_PER_STEP_DEFECT,
      applyChironThemisRows: false,
    };
  }
  return {
    cfl: cflScore,
    cap: capScore,
    stepSizesAgree,
    kind: "stop-untrustworthy",
    verdictLine: VERDICT_PER_STEP_UNTRUSTWORTHY,
    applyChironThemisRows: false,
  };
}

export const PER_STEP_CHIRON_THEMIS_ROWS: readonly string[] = [
  VERDICT_CONVENTION,
  VERDICT_DYNAMIC_LAG,
  VERDICT_SPREADS_STRAIN,
  VERDICT_MIXED,
];
