import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadShipMesh } from "../src/inflate/meshA.js";
import { percentile, stretchFieldFromCoords, stretchStats } from "../src/oracle/stretchField.js";
import { cellsAsNodeQuads, parseVtkAnimFrame, scatterToNodeOrder } from "../src/oracle/vtkAnim.js";

const VTK = new URL("../radioss/A-inflate/run/", import.meta.url);
const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("stretch measure (definition check, no physics change)", () => {
  it("animation frame 0 maps onto the same rest nodes as the toy ship mesh", () => {
    const ship = loadShipMesh("A");
    const vtk = parseVtkAnimFrame(readFileSync(new URL("Ainflate_A001.vtk", VTK), "utf8"), 1554, 1554);
    expect(vtk.t).toBe(0);
    const rest = scatterToNodeOrder(vtk, 1554);
    let maxAbs = 0;
    for (let i = 0; i < ship.coords.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(ship.coords[i]! - rest[i]!));
    }
    expect(maxAbs).toBeLessThan(1e-6);
  });

  it("CST on animation cells at 16 ms recovers the published golden max", () => {
    const restFrame = parseVtkAnimFrame(readFileSync(new URL("Ainflate_A001.vtk", VTK), "utf8"), 1554, 1554);
    const warnFrame = parseVtkAnimFrame(readFileSync(new URL("Ainflate_A009.vtk", VTK), "utf8"), 1554, 1554);
    expect(warnFrame.t).toBeCloseTo(0.0160038, 8);
    const rest = scatterToNodeOrder(restFrame, 1554);
    const cur = scatterToNodeOrder(warnFrame, 1554);
    const quads = cellsAsNodeQuads(restFrame);
    const field = stretchFieldFromCoords(cur, rest, quads, Array.from(warnFrame.elementIdByCell));
    const stats = stretchStats(field);
    const published = 2.128161758970982;
    expect(relClose(stats.max, published)).toBe(true);
    const warnJson = JSON.parse(readFileSync(new URL("oriented-ismstr2-warn.json", DIAG), "utf8")) as {
      lambda_field: { lam_max: number; n_quads: number };
    };
    expect(warnJson.lambda_field.n_quads).toBe(1554);
    expect(relClose(stats.max, warnJson.lambda_field.lam_max)).toBe(true);
  });

  it("percentile helper is monotonic", () => {
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("committed 0–16 ms results say real motion, not a measurement effect", () => {
    const raw: unknown = JSON.parse(readFileSync(new URL("stretch-measure.json", DIAG), "utf8"));
    if (typeof raw !== "object" || raw === null) throw new Error("stretch-measure.json");
    const rec = raw as Record<string, unknown>;
    const def = rec["definition"] as Record<string, unknown>;
    expect(def["recomputedMatchesPublished"]).toBe(true);
    const verdict = rec["windowVerdict"] as Record<string, unknown>;
    expect(verdict["twoMsSameHotElement"]).toBe(false);
    expect(verdict["twoMsLooksLikeMeasurementEffect"]).toBe(false);
    expect(verdict["killOnOfficialEveryFrame"]).toBe(false);
    expect(verdict["killOffOfficialEveryFrame"]).toBe(false);
    const snaps = rec["snapshots"] as unknown[];
    expect(snaps.length).toBe(3);
    const md = readFileSync(new URL("stretch-measure.md", DIAG), "utf8");
    expect(md).toContain("real motion difference");
    expect(md).toContain("| 16.00 | off | 1.08%");
    expect(md).toContain("sit in different");
  });
});

function relClose(a: number, b: number): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-30) < 1e-12;
}
