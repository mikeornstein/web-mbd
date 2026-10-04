/**
 * Energy-split plan, locked before any new number.
 * Not a physics pass. Not a gate. Do not add a verdict row.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deckEnergySplitPageText } from "../src/oracle/deckEnergySplitResults.js";
import {
  ENERGY_SPLIT_COL_EXTERNAL,
  ENERGY_SPLIT_COL_INTERNAL,
  ENERGY_SPLIT_COL_KINETIC,
  NO_VERDICT_ROW,
  OUTCOME_A,
  OUTCOME_B,
  OUTCOME_C,
  PAGE_WORDING_ENERGY_BAR,
  PAGE_WORDING_LAG,
  PAGE_WORDING_MAX_STRETCH,
} from "../src/oracle/deckEnergySplitRules.js";
import { scoreEnergySplit } from "../src/oracle/deckEnergySplitScore.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("deck energy-split plan locked before any number", () => {
  it("prediction file carries the locked how, shares, and page wording before numbers", () => {
    const text = readFileSync(new URL("deck-energy-split-prediction.md", DIAG), "utf8");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Written **before** any new number is computed");
    expect(flat).toContain("Do not change this file after seeing numbers");
    expect(flat).toContain("Do not edit `deck-quad-averaged-prediction.md`");
    expect(flat).toContain("EXTERNAL WORK");
    expect(flat).toContain("INTERNAL ENERGY");
    expect(flat).toContain("KINETIC ENERGY");
    expect(flat).toContain("/TFILE 0.001");
    expect(flat).toContain("/PRINT/-200");
    expect(flat).toContain("dissipated = external work minus internal minus kinetic");
    expect(flat).toContain("the toy damps too much early");
    expect(flat).toContain("how mass is spread");
    expect(flat).toContain("how strain is distributed");
    expect(flat).toContain("Do not add a verdict row");
    expect(flat).toContain("reference solvers");
    expect(flat).toContain("Do not turn compare:inflate green");
  });

  it("page copy says not a gate and does not add a verdict row", () => {
    const page = deckEnergySplitPageText();
    expect(page.rules).toContain(NO_VERDICT_ROW);
    expect(page.rules).toContain(OUTCOME_A);
    expect(page.rules).toContain(PAGE_WORDING_LAG);
    expect(page.rules).toContain(PAGE_WORDING_MAX_STRETCH);
    expect(page.rules).toContain(PAGE_WORDING_ENERGY_BAR);
    expect(page.rules).toContain(ENERGY_SPLIT_COL_EXTERNAL);
    expect(page.rules).toContain(ENERGY_SPLIT_COL_INTERNAL);
    expect(page.rules).toContain(ENERGY_SPLIT_COL_KINETIC);
  });

  it("(a) fires when dissipated share is above the deck range at 4 and 8 ms", () => {
    const score = scoreEnergySplit({
      toy: [
        { t_ms: 4, dissipatedShare: 0.5, kineticShare: 0.2 },
        { t_ms: 8, dissipatedShare: 0.4, kineticShare: 0.2 },
      ],
      decksAt4: [
        { t_ms: 4, dissipatedShare: 0.1, kineticShare: 0.2 },
        { t_ms: 4, dissipatedShare: 0.2, kineticShare: 0.25 },
      ],
      decksAt8: [
        { t_ms: 8, dissipatedShare: 0.1, kineticShare: 0.15 },
        { t_ms: 8, dissipatedShare: 0.2, kineticShare: 0.22 },
      ],
    });
    expect(score.firesA).toBe(true);
    expect(score.firesB).toBe(false);
    expect(score.firesC).toBe(false);
    expect(score.kind).toBe("damps-too-much-early");
    expect(score.outcomeLine).toContain(OUTCOME_A);
  });

  it("(b) fires when kinetic share is outside the deck range at 4 and 8 ms", () => {
    const score = scoreEnergySplit({
      toy: [
        { t_ms: 4, dissipatedShare: 0.15, kineticShare: 0.9 },
        { t_ms: 8, dissipatedShare: 0.15, kineticShare: 0.01 },
      ],
      decksAt4: [
        { t_ms: 4, dissipatedShare: 0.1, kineticShare: 0.2 },
        { t_ms: 4, dissipatedShare: 0.2, kineticShare: 0.25 },
      ],
      decksAt8: [
        { t_ms: 8, dissipatedShare: 0.1, kineticShare: 0.2 },
        { t_ms: 8, dissipatedShare: 0.2, kineticShare: 0.3 },
      ],
    });
    expect(score.firesA).toBe(false);
    expect(score.firesB).toBe(true);
    expect(score.firesC).toBe(false);
    expect(score.kind).toBe("mass-spread");
    expect(score.outcomeLine).toContain(OUTCOME_B);
  });

  it("(c) fires when dissipated and kinetic shares both sit inside the range", () => {
    const score = scoreEnergySplit({
      toy: [
        { t_ms: 4, dissipatedShare: 0.15, kineticShare: 0.22 },
        { t_ms: 8, dissipatedShare: 0.18, kineticShare: 0.25 },
      ],
      decksAt4: [
        { t_ms: 4, dissipatedShare: 0.1, kineticShare: 0.2 },
        { t_ms: 4, dissipatedShare: 0.2, kineticShare: 0.3 },
      ],
      decksAt8: [
        { t_ms: 8, dissipatedShare: 0.1, kineticShare: 0.2 },
        { t_ms: 8, dissipatedShare: 0.2, kineticShare: 0.3 },
      ],
    });
    expect(score.firesA).toBe(false);
    expect(score.firesB).toBe(false);
    expect(score.firesC).toBe(true);
    expect(score.kind).toBe("strain-distributed");
    expect(score.outcomeLine).toContain(OUTCOME_C);
  });

  it("a mixed boolean set is other, not forced into a / b / c", () => {
    const score = scoreEnergySplit({
      toy: [
        { t_ms: 4, dissipatedShare: 0.9, kineticShare: 0.22 },
        { t_ms: 8, dissipatedShare: 0.15, kineticShare: 0.22 },
      ],
      decksAt4: [
        { t_ms: 4, dissipatedShare: 0.1, kineticShare: 0.2 },
        { t_ms: 4, dissipatedShare: 0.2, kineticShare: 0.3 },
      ],
      decksAt8: [
        { t_ms: 8, dissipatedShare: 0.1, kineticShare: 0.2 },
        { t_ms: 8, dissipatedShare: 0.2, kineticShare: 0.3 },
      ],
    });
    expect(score.firesA).toBe(false);
    expect(score.kind).toBe("other");
    expect(score.outcomeLine).toContain("Report any other combination exactly as it is");
  });

  it("derived table names T01 channels, skips triangle 16 ms, and does not add a verdict row", () => {
    const pred = readFileSync(new URL("deck-energy-split-prediction.md", DIAG), "utf8");
    expect(pred).toContain("Written **before** any new number is computed");
    const text = readFileSync(new URL("deck-energy-split-results.md", DIAG), "utf8");
    expect(text).toContain("AinflateT01.csv");
    expect(text).toContain("EXTERNAL WORK");
    expect(text).toContain("INTERNAL ENERGY");
    expect(text).toContain("KINETIC ENERGY");
    expect(text).toContain("/TFILE 0.001");
    expect(text).toContain("triangle deck died ~11.5 ms");
    expect(text).toContain("No verdict row was added");
    expect(text).toContain("(b) the lag points to how mass is spread");
    expect(text).not.toContain("Energy agrees and median agrees");
  });
});
