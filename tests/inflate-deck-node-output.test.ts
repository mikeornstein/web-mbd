/**
 * Four-deck node-output plan, locked before the engine run.
 * Not a physics pass. Not a gate.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadShipMesh } from "../src/inflate/meshA.js";
import { reverseQuad } from "../src/inflate/orientShell.js";
import {
  DECK_NODE_DECIDING_MS,
  DECK_NODE_REAL_BUT_NOT_DECIDING_MS,
  DECK_NODE_REQUESTED_MS,
  FINE_MESH_SPLIT_CAVEAT,
  OPENCOURANT_ENGINE_COMMIT,
  OPENCOURANT_TAG,
  OPENCOURANT_ZIP_BYTES,
  OPENCOURANT_ZIP_SHA256,
  PRIMARY_SPLIT,
  SENSITIVITY_SPLIT,
} from "../src/oracle/deckNodeOutputRules.js";
import {
  parseRadiossShellBlock,
  reversePreservesPrimaryPair,
  splitPlanFor1554Quads,
  splitPlanForCommittedTriangles,
  splitPlanForFineLocal,
  splitQuadCstsIsI0I2,
  toyDiagonalsFromOrientedQuads,
} from "../src/oracle/deckNodeEnergy.js";
import { deckNodeOutputPageText } from "../src/oracle/deckNodeOutputResults.js";
import {
  BOOKKEEPING_REL,
  ENERGY_AGREE_REL,
  MEDIAN_STRAIN_AGREE_REL,
  SHIFT_AGREE_MS,
  SHIFT_MAX_ABS_MS,
} from "../src/oracle/stretchDiagnosticRules.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);
const ROOT = new URL("../", import.meta.url);

describe("deck node-output plan locked before the run", () => {
  it("prediction file still carries the locked plan written before the run", () => {
    const text = readFileSync(new URL("deck-node-output-prediction.md", DIAG), "utf8");
    const flat = text.replace(/\s+/g, " ");
    expect(flat).toContain("Written **before** any engine run");
    expect(flat).toContain("Do not change this file after seeing numbers");
    expect(flat).toContain("pinned only to the OpenCourant copy");
    expect(flat).toContain(OPENCOURANT_ZIP_SHA256);
    expect(flat).toContain("83864216");
    expect(flat).toContain(OPENCOURANT_ENGINE_COMMIT);
    expect(flat).toContain("radioss/diag-oriented-ismstr2");
    expect(flat).toContain("radioss/diag-element-type/qeph-ismstr2");
    expect(flat).toContain("radioss/diag-element-type/fine");
    expect(flat).toContain("radioss/diag-element-type/sh3n");
    expect(flat).toContain("fifth deck");
    expect(flat).toContain("/DT/ANIM");
    expect(flat).toContain("is forbidden");
    expect(flat).toContain("/ANIM/VECT/VEL");
    expect(flat).toContain("Never interpolate node coordinates");
    expect(flat).toContain("may now be reported as real");
    expect(flat).toContain("deciding rows stay 4, 8 and 16 ms");
    expect(flat).toContain("convention difference");
    expect(flat).toContain("first node to third node");
    expect(flat).toContain("wrinkle clamp");
    expect(flat).toContain("1-to-4");
    expect(flat).toContain("SENSITIVITY");
    expect(flat).toContain("scripts/run-deck-node-output.sh");
    expect(PRIMARY_SPLIT.toLowerCase()).toContain("i0–i2");
    expect(SENSITIVITY_SPLIT.toLowerCase()).toContain("i1–i3");
    expect(FINE_MESH_SPLIT_CAVEAT).toContain("6,216");
    expect([...DECK_NODE_REQUESTED_MS]).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16]);
    expect([...DECK_NODE_DECIDING_MS]).toEqual([4, 8, 16]);
    expect([...DECK_NODE_REAL_BUT_NOT_DECIDING_MS]).toEqual([10, 12, 14]);
    expect(BOOKKEEPING_REL).toBe(0.03);
    expect(ENERGY_AGREE_REL).toBe(0.05);
    expect(MEDIAN_STRAIN_AGREE_REL).toBe(0.05);
    expect(SHIFT_AGREE_MS).toBe(0.5);
    expect(SHIFT_MAX_ABS_MS).toBe(2);
    const page = deckNodeOutputPageText();
    expect(page.rules).toContain("MEASUREMENT, not a gate");
    expect(page.results).toContain("spreads strain differently");
  });

  it("package pin matches the locked hash and size", () => {
    const raw: unknown = JSON.parse(readFileSync(new URL("opencourant-linux64-pin.json", DIAG), "utf8"));
    expect(raw).toMatchObject({
      tag: OPENCOURANT_TAG,
      zipSha256: OPENCOURANT_ZIP_SHA256,
      zipBytes: OPENCOURANT_ZIP_BYTES,
      engineCommit: OPENCOURANT_ENGINE_COMMIT,
      writtenBeforeRun: true,
    });
  });

  it("run script overlays velocity in the run copy and refuses /DT/ANIM", () => {
    const script = readFileSync(new URL("scripts/run-deck-node-output.sh", ROOT), "utf8");
    expect(script).toContain("/ANIM/VECT/VEL");
    expect(script).toContain("refusing /DT/ANIM");
    expect(script).toContain("diag-oriented-ismstr2");
    expect(script).toContain("qeph-ismstr2");
    expect(script).toContain("diag-element-type/fine");
    expect(script).toContain("diag-element-type/sh3n");
    expect(script).toContain("does not replace radioss/A-inflate");
    expect(script).not.toMatch(/run_one "\$ROOT\/radioss\/A-inflate"/);
    expect(script).toContain("sha256");
    expect(script).toContain("anim_to_vtk");
    expect(script).toContain("th_to_csv");
  });

  it("toy split is first-to-third node; reverse keeps that pair; 3108 triangles", () => {
    const mesh = loadShipMesh("A");
    expect(mesh.nQuads).toBe(1554);
    expect(mesh.quads.length / 4).toBe(1554);
    const q0: [number, number, number, number] = [
      mesh.quads[0]!,
      mesh.quads[1]!,
      mesh.quads[2]!,
      mesh.quads[3]!,
    ];
    expect(splitQuadCstsIsI0I2(mesh.coords, q0)).toBe(true);
    expect(reversePreservesPrimaryPair(q0)).toBe(true);
    const rev = reverseQuad(q0);
    expect(new Set([rev[0], rev[2]])).toEqual(new Set([q0[0], q0[2]]));
    const diags = toyDiagonalsFromOrientedQuads(mesh.quads);
    expect(diags).toHaveLength(1554);
    expect(diags.every((d) => reversePreservesPrimaryPair(d.nodes))).toBe(true);
  });

  it("maps golden and Ishell 24 quads onto the toy i0–i2 pair; SH3N already uses it", () => {
    const mesh = loadShipMesh("A");
    const toy = toyDiagonalsFromOrientedQuads(mesh.quads);
    const golden = readFileSync(new URL("radioss/diag-oriented-ismstr2/Ainflate_0000.rad", ROOT), "utf8");
    const ishell = readFileSync(new URL("radioss/diag-element-type/qeph-ismstr2/Ainflate_0000.rad", ROOT), "utf8");
    const sh3n = readFileSync(new URL("radioss/diag-element-type/sh3n/Ainflate_0000.rad", ROOT), "utf8");
    const fine = readFileSync(new URL("radioss/diag-element-type/fine/Ainflate_0000.rad", ROOT), "utf8");
    const gPlan = splitPlanFor1554Quads(toy, parseRadiossShellBlock(golden, "/SHELL/1"));
    const iPlan = splitPlanFor1554Quads(toy, parseRadiossShellBlock(ishell, "/SHELL/1"));
    const tPlan = splitPlanForCommittedTriangles(toy, parseRadiossShellBlock(sh3n, "/SH3N/1"));
    const fPlan = splitPlanForFineLocal(parseRadiossShellBlock(fine, "/SHELL/1"));
    expect(gPlan.mappedCount).toBe(1554);
    expect(gPlan.unmappedCount).toBe(0);
    expect(gPlan.primaryTris).toHaveLength(3108);
    expect(iPlan.mappedCount).toBe(1554);
    expect(iPlan.unmappedCount).toBe(0);
    expect(tPlan.kind).toBe("triangle-committed");
    expect(tPlan.primaryTris).toHaveLength(3108);
    expect(tPlan.mappedCount).toBe(1554);
    expect(fPlan.kind).toBe("fine-local");
    expect(fPlan.primaryTris).toHaveLength(6216 * 2);
    expect(fPlan.note).toContain("cannot share the 1554-quad node-pair map");
  });

  it("derived table records the locked-rule verdict and the package pin", () => {
    const text = readFileSync(new URL("deck-node-output-results.md", DIAG), "utf8").trim();
    expect(text).toContain("spreads strain differently");
    expect(text).toContain(OPENCOURANT_ZIP_SHA256);
    expect(text).toContain("real frame, not interpolated");
    expect(text).toContain("convention difference");
    expect(text).toContain("sensitivity");
    expect(text).not.toContain("interpolated from 8");
    const pred = readFileSync(new URL("deck-node-output-prediction.md", DIAG), "utf8");
    expect(pred).toContain("Written **before** any engine run");
  });
});
