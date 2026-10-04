/**
 * Stretch-diagnostic decision rules, locked before the run.
 * Not a physics pass. Not a gate.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOOKKEEPING_REL,
  ENERGY_AGREE_REL,
  MEDIAN_STRAIN_AGREE_REL,
  RULE_0_BOOKKEEPING,
  RULE_1_ENERGY,
  RULE_2_SHIFT,
  RULE_3_MEDIAN,
  RULE_4_EARLY_SPREAD,
  SHIFT_AGREE_MS,
  SHIFT_MAX_ABS_MS,
  STRETCH_DIAG_EVIDENCE_MS,
  STRETCH_DIAG_INTERP_MS,
  VERDICT_CONVENTION,
  VERDICT_DYNAMIC_LAG,
  VERDICT_MIXED,
  VERDICT_SPREADS_STRAIN,
  scoreStretchDiagnostics,
  type EnergyFrameInput,
  type SeriesPoint,
  type StretchDiagnosticsInput,
} from "../src/oracle/stretchDiagnosticRules.js";
import { stretchDiagnosticsPageText } from "../src/oracle/stretchDiagnosticResults.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function ramp(y0: number, slopePerMs: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const t_ms of [0, 2, 4, 6, 8, 10, 12, 14, 16]) {
    out.push({ t_ms, y: y0 + slopePerMs * t_ms });
  }
  return out;
}

function balancedBooks(): EnergyFrameInput[] {
  return [0, 2, 4, 8, 16].map((t_ms) => {
    const strain_J = 0.1 * t_ms;
    const kinetic_J = 0.01;
    const damping_J = 0.02 * t_ms;
    return {
      t_ms,
      strain_J,
      kinetic_J,
      damping_J,
      pressureWork_J: strain_J + kinetic_J + damping_J,
      interpolated: false,
    };
  });
}

function baseInput(over: Partial<StretchDiagnosticsInput> = {}): StretchDiagnosticsInput {
  const volume = ramp(420, 20);
  const median = ramp(1.0, 0.015);
  const max = ramp(1.0, 0.07);
  return {
    bookkeeping: balancedBooks(),
    toyStrain: [
      { t_ms: 4, psi_J: 1.0, interpolated: false },
      { t_ms: 8, psi_J: 2.0, interpolated: false },
      { t_ms: 16, psi_J: 4.0, interpolated: false },
    ],
    goldenStrain: {
      at8_J: 2.0,
      at16_J: 4.0,
      at4_J: 1.0,
      fromToyFunctionOnNodePositions: true,
      note: "synthetic",
    },
    deckStrainAt8: [1.9, 2.0, 2.1],
    deckStrainAt16: [3.8, 4.0, 4.2],
    volumeToy: volume,
    volumeGold: volume,
    medianToy: median,
    medianGold: median,
    maxToy: max,
    maxGold: max,
    ...over,
  };
}

describe("stretch diagnostic rules locked before the run", () => {
  it("prediction file and page carry the locked rules and no results yet", () => {
    const text = readFileSync(new URL("stretch-diagnostics-prediction.md", DIAG), "utf8");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Written **before** any new diagnostic run");
    expect(flat).toContain(RULE_0_BOOKKEEPING.slice(0, 40));
    expect(flat).toContain("pressure work = strain energy + kinetic");
    expect(flat).toContain("within 5% of the golden's");
    expect(flat).toContain("0.5 ms of each other");
    expect(flat).toContain("median strain (stretch minus 1)");
    expect(flat).toContain("spread of all decks, not the golden alone");
    expect(flat).toContain(VERDICT_CONVENTION);
    expect(flat).toContain(VERDICT_DYNAMIC_LAG);
    expect(flat).toContain(VERDICT_SPREADS_STRAIN);
    expect(flat).toContain(VERDICT_MIXED);
    expect(flat).toContain("pinned only to the OpenCourant copy");
    expect(BOOKKEEPING_REL).toBe(0.03);
    expect(ENERGY_AGREE_REL).toBe(0.05);
    expect(MEDIAN_STRAIN_AGREE_REL).toBe(0.05);
    expect(SHIFT_AGREE_MS).toBe(0.5);
    expect(SHIFT_MAX_ABS_MS).toBe(2);
    expect([...STRETCH_DIAG_EVIDENCE_MS]).toEqual([2, 4, 8, 16]);
    expect([...STRETCH_DIAG_INTERP_MS]).toEqual([10, 12, 14]);
    const page = stretchDiagnosticsPageText();
    expect(page.rules).toContain(RULE_1_ENERGY.slice(0, 20));
    expect(page.rules).toContain(RULE_2_SHIFT.slice(0, 20));
    expect(page.rules).toContain(RULE_3_MEDIAN.slice(0, 20));
    expect(page.rules).toContain(RULE_4_EARLY_SPREAD.slice(0, 20));
    expect(page.results).toContain("Rules committed first");
    expect(page.results).toContain("Results not yet written");
  });

  it("STOP when bookkeeping fails; no verdicts", () => {
    const books = balancedBooks();
    const broken = books.map((row, i) =>
      i === 0 ? row : { ...row, pressureWork_J: row.pressureWork_J * 2 },
    );
    const score = scoreStretchDiagnostics(baseInput({ bookkeeping: broken }));
    expect(score.bookkeepingOk).toBe(false);
    expect(score.matchingRows).toEqual(["stop-bookkeeping"]);
    expect(score.verdictLine).toContain("STOP");
    expect(score.verdictLine).toContain("not trustworthy");
  });

  it("energy agrees and median agrees → convention (page says toy physics is not at fault)", () => {
    const score = scoreStretchDiagnostics(baseInput());
    expect(score.bookkeepingOk).toBe(true);
    expect(score.energyAgrees).toBe(true);
    expect(score.medianAgrees).toBe(true);
    expect(score.oneShiftFits).toBe(true);
    expect(score.matchingRows).toEqual(["convention-or-hotspot"]);
    expect(score.verdictLine).toBe(VERDICT_CONVENTION);
  });

  it("energy low and one shift fits → dynamic lag", () => {
    const score = scoreStretchDiagnostics(
      baseInput({
        toyStrain: [
          { t_ms: 4, psi_J: 0.5, interpolated: false },
          { t_ms: 8, psi_J: 1.0, interpolated: false },
          { t_ms: 16, psi_J: 2.0, interpolated: false },
        ],
      }),
    );
    expect(score.energyAgrees).toBe(false);
    expect(score.energyLow).toBe(true);
    expect(score.oneShiftFits).toBe(true);
    expect(score.matchingRows).toEqual(["dynamic-lag"]);
    expect(score.verdictLine).toBe(VERDICT_DYNAMIC_LAG);
  });

  it("energy low and shifts disagree → spreads strain", () => {
    const delayedMax = ramp(1.0, 0.07).map((row) => ({
      t_ms: row.t_ms,
      y: 1 + 0.07 * (row.t_ms - 3),
    }));
    const score = scoreStretchDiagnostics(
      baseInput({
        toyStrain: [
          { t_ms: 4, psi_J: 0.5, interpolated: false },
          { t_ms: 8, psi_J: 1.0, interpolated: false },
          { t_ms: 16, psi_J: 2.0, interpolated: false },
        ],
        maxToy: delayedMax,
      }),
    );
    expect(score.energyLow).toBe(true);
    expect(score.oneShiftFits).toBe(false);
    expect(score.matchingRows).toEqual(["spreads-strain-differently"]);
    expect(score.verdictLine).toBe(VERDICT_SPREADS_STRAIN);
  });

  it("energy agrees, median disagrees, shifts disagree → MIXED only", () => {
    const delayedMax = ramp(1.0, 0.07).map((row) => ({
      t_ms: row.t_ms,
      y: 1 + 0.07 * (row.t_ms - 3),
    }));
    const score = scoreStretchDiagnostics(
      baseInput({
        medianToy: ramp(1.0, 0.03),
        maxToy: delayedMax,
      }),
    );
    expect(score.energyAgrees).toBe(true);
    expect(score.medianAgrees).toBe(false);
    expect(score.oneShiftFits).toBe(false);
    expect(score.matchingRows).toEqual(["mixed"]);
    expect(score.verdictLine).toBe(VERDICT_MIXED);
  });

  it("energy agrees and median agrees but shifts disagree → both convention and MIXED", () => {
    const delayedMax = ramp(1.0, 0.07).map((row) => ({
      t_ms: row.t_ms,
      y: 1 + 0.07 * (row.t_ms - 3),
    }));
    const score = scoreStretchDiagnostics(baseInput({ maxToy: delayedMax }));
    expect(score.energyAgrees).toBe(true);
    expect(score.medianAgrees).toBe(true);
    expect(score.oneShiftFits).toBe(false);
    expect(score.matchingRows).toEqual(["convention-or-hotspot", "mixed"]);
    expect(score.verdictLine).toContain(VERDICT_CONVENTION);
    expect(score.verdictLine).toContain(VERDICT_MIXED);
  });

  it("missing golden node-position strain energy cannot score energy-agrees", () => {
    const score = scoreStretchDiagnostics(
      baseInput({
        goldenStrain: {
          at8_J: null,
          at16_J: null,
          at4_J: null,
          fromToyFunctionOnNodePositions: false,
          note: "animation frames not in this repository",
        },
        deckStrainAt8: [],
        deckStrainAt16: [],
      }),
    );
    expect(score.energyComparable).toBe(false);
    expect(score.energyAgrees).toBe(false);
    expect(score.energyLow).toBe(false);
    expect(score.matchingRows).toEqual(["no-row"]);
    expect(score.verdictLine).toContain("NO-ROW");
  });
});
