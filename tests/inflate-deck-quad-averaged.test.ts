/**
 * Quad-averaged measurement plan, locked before any new number.
 * Not a physics pass. Not a gate.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
});
