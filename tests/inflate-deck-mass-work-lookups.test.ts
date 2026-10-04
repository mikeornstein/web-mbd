/**
 * Mass / work / ringing lookup plan, locked before any new number.
 * Not a physics pass. Not a gate. Do not add a verdict row. Do not propose a fix.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRadiossStarterNodes, parseRadiossShellBlock } from "../src/oracle/deckNodeEnergy.js";
import { deckMassWorkLookupPageText } from "../src/oracle/deckMassWorkLookupResults.js";
import {
  LOOKUP_COL_EXTERNAL,
  LOOKUP_COL_KINETIC,
  LOOKUP_HOW_MASS,
  LOOKUP_HOW_VOLUME_DECK,
  LOOKUP_MASS_REL,
  NO_FIX,
  NO_VERDICT_ROW,
  OUTCOME_MASS,
  OUTCOME_OPEN,
  OUTCOME_RINGING,
} from "../src/oracle/deckMassWorkLookupRules.js";
import { kineticOscillates, scoreMassWorkLookups, type MassRow } from "../src/oracle/deckMassWorkLookupScore.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

const toy: MassRow = {
  name: "toy",
  mass_kg: 1,
  density_kg_m3: 1130,
  thickness_m: 0.000381,
  restArea_m2: 1 / (1130 * 0.000381),
};

describe("deck mass/work/ringing plan locked before any number", () => {
  it("prediction file carries the three lookups and reading rules before numbers", () => {
    const text = readFileSync(new URL("deck-mass-and-work-lookups-plan.md", DIAG), "utf8");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Written **before** any new number is computed");
    expect(flat).toContain("Do not change this file after seeing numbers");
    expect(flat).toContain("Do not edit earlier plan files");
    expect(flat).toContain("deck-energy-split-prediction.md");
    expect(flat).toContain("density × thickness × rest area");
    expect(flat).toContain("RHO_I");
    expect(flat).toContain("Thick");
    expect(flat).toContain("ΔV = V(t) − V_rest");
    expect(flat).toContain("p × ΔV");
    expect(flat).toContain("EXTERNAL WORK");
    expect(flat).toContain("KINETIC ENERGY");
    expect(flat).toContain("/TFILE 0.001");
    expect(flat).toContain("rises and falls");
    expect(flat).toContain("stays high");
    expect(flat).toContain("more than 5%");
    expect(flat).toContain("the candidate cause is that mass difference");
    expect(flat).toContain("report **ringing**");
    expect(flat).toContain("report the cause as **open**");
    expect(flat).toContain("Do not propose or apply a fix");
    expect(flat).toContain("Do not add a verdict row");
    expect(flat).toContain("Do not turn compare:inflate green");
  });

  it("page copy says not a gate and does not add a verdict row", () => {
    const page = deckMassWorkLookupPageText();
    expect(page.rules).toContain(NO_VERDICT_ROW);
    expect(page.rules).toContain(NO_FIX);
    expect(page.rules).toContain(LOOKUP_HOW_MASS);
    expect(page.rules).toContain(LOOKUP_HOW_VOLUME_DECK);
    expect(page.rules).toContain(OUTCOME_MASS);
    expect(page.rules).toContain(OUTCOME_RINGING);
    expect(page.rules).toContain(OUTCOME_OPEN);
    expect(LOOKUP_COL_EXTERNAL).toBe("EXTERNAL WORK");
    expect(LOOKUP_COL_KINETIC).toBe("KINETIC ENERGY");
    expect(LOOKUP_MASS_REL).toBe(0.05);
  });

  it("(a) fires when any deck mass differs from the toy by more than 5%", () => {
    const score = scoreMassWorkLookups({
      toy,
      decks: [{ ...toy, name: "deck", mass_kg: 1.06, restArea_m2: toy.restArea_m2 * 1.06 }],
      toyKinetic: [
        { t_s: 0.004, kinetic_J: 1 },
        { t_s: 0.008, kinetic_J: 1 },
      ],
      windowFrom_s: 0.004,
      windowTo_s: 0.008,
    });
    expect(score.firesMass).toBe(true);
    expect(score.firesRinging).toBe(false);
    expect(score.firesOpen).toBe(false);
    expect(score.kind).toBe("mass-difference");
    expect(score.differingInput).toBe("rest area");
    expect(score.outcomeLine).toContain(OUTCOME_MASS);
  });

  it("(b) fires when masses match and kinetic energy oscillates", () => {
    const score = scoreMassWorkLookups({
      toy,
      decks: [{ ...toy, name: "deck" }],
      toyKinetic: [
        { t_s: 0.004, kinetic_J: 0.02 },
        { t_s: 0.006, kinetic_J: 0.08 },
        { t_s: 0.008, kinetic_J: 0.03 },
      ],
      windowFrom_s: 0.004,
      windowTo_s: 0.008,
    });
    expect(score.massMatch).toBe(true);
    expect(score.oscillates).toBe(true);
    expect(score.firesRinging).toBe(true);
    expect(score.kind).toBe("ringing");
    expect(score.outcomeLine).toContain(OUTCOME_RINGING);
  });

  it("(c) fires when masses match and there is no oscillation", () => {
    const score = scoreMassWorkLookups({
      toy,
      decks: [{ ...toy, name: "deck", mass_kg: 1.01 }],
      toyKinetic: [
        { t_s: 0.004, kinetic_J: 0.06 },
        { t_s: 0.006, kinetic_J: 0.055 },
        { t_s: 0.008, kinetic_J: 0.05 },
      ],
      windowFrom_s: 0.004,
      windowTo_s: 0.008,
    });
    expect(score.massMatch).toBe(true);
    expect(score.oscillates).toBe(false);
    expect(score.firesOpen).toBe(true);
    expect(score.kind).toBe("open");
    expect(score.outcomeLine).toContain(OUTCOME_OPEN);
  });

  it("kineticOscillates is false for a flat or monotonic series", () => {
    expect(
      kineticOscillates(
        [
          { t_s: 0.004, kinetic_J: 1 },
          { t_s: 0.006, kinetic_J: 1 },
          { t_s: 0.008, kinetic_J: 1 },
        ],
        0.004,
        0.008,
      ),
    ).toBe(false);
    expect(
      kineticOscillates(
        [
          { t_s: 0.004, kinetic_J: 0.2 },
          { t_s: 0.006, kinetic_J: 0.1 },
          { t_s: 0.008, kinetic_J: 0.05 },
        ],
        0.004,
        0.008,
      ),
    ).toBe(false);
  });

  it("parses starter /NODE ids without inventing a missing node", () => {
    const starter = [
      "/BEGIN",
      "/NODE",
      "         1                   0.0                   0.0                   0.0",
      "         2                   1.0                   0.0                   0.0",
      "         3                   0.0                   1.0                   0.0",
      "/SHELL/1",
      "         1          1          2          3          3",
    ].join("\n");
    const nodes = parseRadiossStarterNodes(starter);
    expect(nodes.nNodes).toBe(3);
    expect(nodes.coords[0]).toBe(0);
    expect(nodes.coords[3]).toBe(1);
    const shells = parseRadiossShellBlock(starter, "/SHELL/1");
    expect(shells).toHaveLength(1);
    expect(shells[0]?.nodes).toEqual([1, 2, 3, 3]);
  });

  it("derived table names T01 channels, records ringing, and does not add a verdict row", () => {
    const pred = readFileSync(new URL("deck-mass-and-work-lookups-plan.md", DIAG), "utf8");
    expect(pred).toContain("Written **before** any new number is computed");
    const text = readFileSync(new URL("deck-mass-and-work-lookups-results.md", DIAG), "utf8");
    expect(text).toContain("AinflateT01.csv");
    expect(text).toContain("EXTERNAL WORK");
    expect(text).toContain("KINETIC ENERGY");
    expect(text).toContain("/TFILE 0.001");
    expect(text).toContain("T01 has no volume column");
    expect(text).toContain("T01 has no pressure column");
    expect(text).toContain("rises and falls (ringing)");
    expect(text).toContain("Outcome: (b) ringing");
    expect(text).toContain("Do not add a verdict row");
    expect(text).toContain("Do not propose or apply a fix");
    expect(text).toContain("Max |deck − toy| / toy = 0.0000%");
  });
});
