import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadShipMesh } from "../src/inflate/meshA.js";
import { percentile, stretchFieldFromCoords, stretchStats } from "../src/oracle/stretchField.js";
import { cellsAsNodeQuads, parseVtkAnimFrame, scatterToNodeOrder } from "../src/oracle/vtkAnim.js";

const VTK = new URL("../radioss/A-inflate/run/", import.meta.url);
const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);
const VTK_REST = new URL("Ainflate_A001.vtk", VTK);
const VTK_WARN = new URL("Ainflate_A009.vtk", VTK);
const HAVE_VTK = existsSync(fileURLToPath(VTK_REST)) && existsSync(fileURLToPath(VTK_WARN));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`stretch-measure test: bad ${label}`);
  return v;
}

describe("stretch measure (definition check, no physics change)", () => {
  it.skipIf(!HAVE_VTK)("animation frame 0 maps onto the same rest nodes as the toy ship mesh", () => {
    const ship = loadShipMesh("A");
    const vtk = parseVtkAnimFrame(readFileSync(VTK_REST, "utf8"), 1554, 1554);
    expect(vtk.t).toBe(0);
    const rest = scatterToNodeOrder(vtk, 1554);
    let maxAbs = 0;
    for (let i = 0; i < ship.coords.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(ship.coords[i]! - rest[i]!));
    }
    expect(maxAbs).toBeLessThan(1e-6);
  });

  it.skipIf(!HAVE_VTK)("CST on animation cells at 16 ms recovers the published golden max", () => {
    const restFrame = parseVtkAnimFrame(readFileSync(VTK_REST, "utf8"), 1554, 1554);
    const warnFrame = parseVtkAnimFrame(readFileSync(VTK_WARN, "utf8"), 1554, 1554);
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
    if (!isRecord(raw)) throw new Error("stretch-measure.json");
    const def = raw["definition"];
    if (!isRecord(def)) throw new Error("definition");
    expect(def["recomputedMatchesPublished"]).toBe(true);
    expect(Object.is(num(def["publishedFrame8Max"], "publishedFrame8Max"), 2.128161758970982)).toBe(true);
    expect(Object.is(num(def["recomputedFrame8Max"], "recomputedFrame8Max"), 2.128161758970982)).toBe(true);

    const verdict = raw["windowVerdict"];
    if (!isRecord(verdict)) throw new Error("windowVerdict");
    expect(verdict["twoMsSameHotElement"]).toBe(false);
    expect(verdict["twoMsLooksLikeMeasurementEffect"]).toBe(false);
    expect(verdict["killOnOfficialEveryFrame"]).toBe(false);
    expect(verdict["killOffOfficialEveryFrame"]).toBe(false);
    expect(verdict["killOnExtraP95EveryFrame"]).toBe(false);
    expect(verdict["killOffExtraP95EveryFrame"]).toBe(false);

    const snaps = raw["snapshots"];
    if (!Array.isArray(snaps) || snaps.length !== 3) throw new Error("snapshots");
    const two = snaps[0];
    if (!isRecord(two)) throw new Error("snapshots[0]");
    expect(two["t_ms"]).toBe(2);
    const toyOn = two["toyKillOn"];
    if (!isRecord(toyOn)) throw new Error("toyKillOn");
    const vs = toyOn["vsRadioss"];
    if (!isRecord(vs)) throw new Error("vsRadioss");
    expect(vs["sameHotElement"]).toBe(false);
    expect(num(vs["toyStretchAtRadiossHot"], "toyStretchAtRadiossHot")).toBeCloseTo(1.04, 2);
    expect(num(vs["radiossStretchAtToyHot"], "radiossStretchAtToyHot")).toBeCloseTo(1.15, 2);
    const radioss = two["radioss"];
    if (!isRecord(radioss)) throw new Error("radioss");
    const rStats = radioss["stats"];
    if (!isRecord(rStats)) throw new Error("radioss.stats");
    expect(num(rStats["max"], "radioss max 2 ms")).toBeCloseTo(1.696, 3);
    const tStats = toyOn["stats"];
    if (!isRecord(tStats)) throw new Error("toyKillOn.stats");
    expect(num(tStats["max"], "toy max 2 ms")).toBeCloseTo(1.118, 3);

    const md = readFileSync(new URL("stretch-measure.md", DIAG), "utf8");
    expect(md).toContain("real motion difference");
    expect(md).toContain("| 16.00 | off | 1.08%");
    expect(md).toContain("sit in different");
  });
});

function relClose(a: number, b: number): boolean {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-30) < 1e-12;
}
