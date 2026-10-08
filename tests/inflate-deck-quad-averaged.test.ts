/**
 * Quad-averaged measurement plan, locked before any new number.
 * Not a physics pass. Not a gate.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadShipMesh } from "../src/inflate/meshA.js";
import { deckQuadAveragedPageText } from "../src/oracle/deckQuadAveragedResults.js";
import { scoreQuadAveraged } from "../src/oracle/deckQuadAveragedScore.js";
import { quadAvgStatsFromPacked } from "../src/oracle/quadAveragedStretch.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);
const ROOT = new URL("../", import.meta.url);

function parseNodes(starter: string): { ids: number[]; xyz: string[] } {
  const lines = starter.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "/NODE");
  const ids: number[] = [];
  const xyz: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t.startsWith("/")) break;
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 4) continue;
    ids.push(Number(parts[0]));
    xyz.push(`${parts[1]} ${parts[2]} ${parts[3]}`);
  }
  return { ids, xyz };
}

function parseShells(starter: string): string[] {
  const lines = starter.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "/SHELL/1");
  const rows: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t.startsWith("/")) break;
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/);
    if (parts.length !== 5) continue;
    rows.push(parts.join(" "));
  }
  return rows;
}

describe("deck quad-averaged plan locked before any number", () => {
  it("prediction file carries Themis additions and rules A/B/C before numbers", () => {
    const text = readFileSync(new URL("deck-quad-averaged-prediction.md", DIAG), "utf8");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Written **before** any new number is computed");
    expect(flat).toContain("Do not change this file after seeing numbers");
    expect(flat).toContain("share node numbering");
    expect(flat).toContain("node-by-node distance between them is meaningful");
    expect(flat).toContain("Checked from the committed starters, before any new number");
    expect(flat).toContain("1,554 nodes, ids 1 through 1,554");
    expect(flat).toContain("maximum |Δ| = 0");
    expect(flat).toContain("identical four-node winding");
    expect(flat).toContain("RULE A");
    expect(flat).toContain("engine energy is primary");
    expect(flat).toContain("convention difference, not evidence about the toy");
    expect(flat).toContain("RULE B");
    expect(flat).toContain("factor 1.0");
    expect(flat).toContain("2 ms and at 6 ms");
    expect(flat).toContain("decides nothing");
    expect(flat).toContain("The bar stays at 4, 8 and 16 ms, factor 1.0");
    expect(flat).toContain("RULE C");
    expect(flat).toContain("quad-averaged stretch");
    expect(flat).toContain("MIXED, no verdict");
    expect(flat).toContain("Themis additions");
  });

  it("golden and Ishell 24 starters share node ids, rest coordinates, and shell winding", () => {
    const golden = readFileSync(new URL("radioss/diag-oriented-ismstr2/Ainflate_0000.rad", ROOT), "utf8");
    const ishell = readFileSync(new URL("radioss/diag-element-type/qeph-ismstr2/Ainflate_0000.rad", ROOT), "utf8");
    const gN = parseNodes(golden);
    const iN = parseNodes(ishell);
    expect(gN.ids).toHaveLength(1554);
    expect(iN.ids).toEqual(gN.ids);
    expect(gN.ids[0]).toBe(1);
    expect(gN.ids[1553]).toBe(1554);
    expect(iN.xyz).toEqual(gN.xyz);
    const gS = parseShells(golden);
    const iS = parseShells(ishell);
    expect(gS).toHaveLength(1554);
    expect(iS).toEqual(gS);
    expect(gS[0]).toBe("1 367 445 470 439");
    expect(golden).toMatch(/\/PROP\/SHELL\/1[\s\S]*?\n\s+1\s+2\s/);
    expect(ishell).toMatch(/\/PROP\/SHELL\/1[\s\S]*?\n\s+24\s+2\s/);
  });

  it("fine starter ids 1–1554 are the parent nodes of the golden rest", () => {
    const golden = readFileSync(new URL("radioss/diag-oriented-ismstr2/Ainflate_0000.rad", ROOT), "utf8");
    const fine = readFileSync(new URL("radioss/diag-element-type/fine/Ainflate_0000.rad", ROOT), "utf8");
    const gN = parseNodes(golden);
    const fN = parseNodes(fine);
    expect(fN.ids).toHaveLength(6216);
    expect(gN.ids).toHaveLength(1554);
    for (let i = 0; i < 1554; i++) {
      expect(fN.ids[i]).toBe(gN.ids[i]);
      const ga = gN.xyz[i]!.split(" ").map(Number);
      const fa = fN.xyz[i]!.split(" ").map(Number);
      const d = Math.hypot(ga[0]! - fa[0]!, ga[1]! - fa[1]!, ga[2]! - fa[2]!);
      expect(d).toBeLessThan(1e-12);
    }
  });

  it("page copy says engine column is primary and records the locked NO-ROW", () => {
    const page = deckQuadAveragedPageText();
    expect(page.rules).toContain("primary energy column");
    expect(page.rules).toContain("convention difference, not evidence about the toy");
    expect(page.results).toContain("Results (measurement; engine column primary, not compare:inflate):");
    expect(page.results).toContain("NO-ROW");
    expect(page.results).toContain("stores strain more evenly");
  });

  it("quad-centre stretch is 1 on the rest ship and follows a uniform scale", () => {
    const mesh = loadShipMesh("A");
    const rest = quadAvgStatsFromPacked(mesh.coords, mesh.coords, mesh.quads);
    expect(rest).not.toBeNull();
    if (rest === null) return;
    expect(rest.n).toBe(1554);
    expect(rest.median).toBeCloseTo(1, 6);
    expect(rest.max).toBeCloseTo(1, 6);
    const scaled = new Float64Array(mesh.coords.length);
    for (let i = 0; i < mesh.coords.length; i++) scaled[i] = mesh.coords[i]! * 1.1;
    const up = quadAvgStatsFromPacked(scaled, mesh.coords, mesh.quads);
    expect(up).not.toBeNull();
    if (up === null) return;
    expect(up.median).toBeCloseTo(1.1, 5);
  });

  it("Rule A engine-primary energy agrees when toy sits in the engine spread", () => {
    const ramp = (y0: number, slope: number): { t_ms: number; y: number }[] =>
      [0, 2, 4, 6, 8, 10, 12, 14, 16].map((t_ms) => ({ t_ms, y: y0 + slope * t_ms }));
    const score = scoreQuadAveraged({
      toyStrain4: 1.0,
      toyStrain8: 2.0,
      toyStrain16: 4.0,
      goldenEngine4: 1.0,
      goldenEngine8: 2.0,
      goldenEngine16: 4.0,
      deckEngineAt8: [1.9, 2.0, 2.1],
      deckEngineAt16: [3.8, 4.0, 4.2],
      volumeToy: ramp(420, 20),
      volumeGold: ramp(420, 20),
      medianToy: ramp(1.0, 0.015),
      medianGold: ramp(1.0, 0.015),
      maxToy: ramp(1.0, 0.07),
      maxGold: ramp(1.0, 0.07),
      ishellMedian8: 1.12,
      ishellMedian16: 1.24,
      toyGoldRms4: 0.001,
      toyGoldRms8: 0.001,
      toyGoldRms16: 0.001,
      goldIshellRms4: 0.002,
      goldIshellRms8: 0.002,
      goldIshellRms16: 0.002,
    });
    expect(score.energyAgrees).toBe(true);
    expect(score.energyLow).toBe(false);
    expect(score.medianAgrees).toBe(true);
    expect(score.oneShiftFits).toBe(true);
    expect(score.distanceBarHolds).toBe(true);
    expect(score.lockedKind).toBe("convention-or-hotspot");
    expect(score.ruleCKind).toBe("node-wobble-convention");
  });

  it("energy agrees and shifts disagree → MIXED, no verdict", () => {
    const volToy = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((t_ms) => ({ t_ms, y: 420 + 20 * t_ms }));
    const volGold = volToy;
    const medToy = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((t_ms) => ({ t_ms, y: 1 + 0.015 * t_ms }));
    const medGold = medToy;
    const maxToy = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((t_ms) => ({ t_ms, y: 1 + 0.07 * t_ms }));
    const maxGold = [0, 2, 4, 6, 8, 10, 12, 14, 16].map((t_ms) => ({ t_ms, y: 1 + 0.07 * (t_ms + 3) }));
    const score = scoreQuadAveraged({
      toyStrain4: 1.0,
      toyStrain8: 2.0,
      toyStrain16: 4.0,
      goldenEngine4: 1.0,
      goldenEngine8: 2.0,
      goldenEngine16: 4.0,
      deckEngineAt8: [1.9, 2.0, 2.1],
      deckEngineAt16: [3.8, 4.0, 4.2],
      volumeToy: volToy,
      volumeGold: volGold,
      medianToy: medToy,
      medianGold: medGold,
      maxToy: maxToy,
      maxGold: maxGold,
      ishellMedian8: 1.12,
      ishellMedian16: 1.24,
      toyGoldRms4: 0.001,
      toyGoldRms8: 0.001,
      toyGoldRms16: 0.001,
      goldIshellRms4: 0.002,
      goldIshellRms8: 0.002,
      goldIshellRms16: 0.002,
    });
    expect(score.energyAgrees).toBe(true);
    expect(score.oneShiftFits).toBe(false);
    expect(score.lockedLine).toContain("MIXED, no verdict");
  });

  it("derived tables keep engine energy primary and do not change the prediction file", () => {
    const pred = readFileSync(new URL("deck-quad-averaged-prediction.md", DIAG), "utf8");
    expect(pred).toContain("Written **before** any new number is computed");
    expect(pred.replace(/\s+/g, " ")).toContain("Do not change this file after seeing numbers");
    const text = readFileSync(new URL("deck-quad-averaged-results.md", DIAG), "utf8");
    expect(text).toContain("engine internal (J, **primary**)");
    expect(text).toContain("convention difference, not evidence about the toy");
    expect(text).toContain("NO-ROW");
    expect(text).toContain("stores strain more evenly");
    expect(text).toContain("report only, decides nothing");
    expect(text).toContain("bar frame (factor 1.0)");
  });
});
