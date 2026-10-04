import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { H0, MU } from "../src/inflate/constants.js";
import { INFLATE_BANDS } from "../src/oracle/compareInflate.js";
import { loadInflateGolden } from "../src/oracle/inflateGolden.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function readText(name: string): string {
  return readFileSync(new URL(name, DIAG), "utf8");
}

function readJson(name: string): unknown {
  return JSON.parse(readText(name));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`diag: bad ${label}`);
  return v;
}

function bool(v: unknown, label: string): boolean {
  if (typeof v !== "boolean") throw new Error(`diag: bad ${label}`);
  return v;
}

function str(v: unknown, label: string): string {
  if (typeof v !== "string") throw new Error(`diag: bad ${label}`);
  return v;
}

function arr(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`diag: bad ${label}`);
  return v;
}

type RadiossFrame = {
  frame: number;
  t: number;
  p_Pa: number;
  lam_max: number;
  V_mL: number;
};

function parseRadiossFrame(raw: unknown, i: number): RadiossFrame {
  if (!isRecord(raw)) throw new Error(`diag: radioss frame ${String(i)} not an object`);
  return {
    frame: num(raw["frame"], `radioss[${String(i)}].frame`),
    t: num(raw["t"], `radioss[${String(i)}].t`),
    p_Pa: num(raw["p_Pa"], `radioss[${String(i)}].p_Pa`),
    lam_max: num(raw["lam_max"], `radioss[${String(i)}].lam_max`),
    V_mL: num(raw["V_mL"], `radioss[${String(i)}].V_mL`),
  };
}

function parseRadiossTape(raw: unknown, label: string): RadiossFrame[] {
  return arr(raw, label).map((row, i) => parseRadiossFrame(row, i));
}

type ToyFrame = {
  frame: number;
  t: number;
  lambdaMax: number;
  p_Pa: number;
  V_mL: number;
};

function parseToyFrame(raw: unknown, i: number): ToyFrame {
  if (!isRecord(raw)) throw new Error(`diag: toy frame ${String(i)} not an object`);
  return {
    frame: num(raw["frame"], `toy[${String(i)}].frame`),
    t: num(raw["t"], `toy[${String(i)}].t`),
    lambdaMax: num(raw["lambdaMax"], `toy[${String(i)}].lambdaMax`),
    p_Pa: num(raw["p_Pa"], `toy[${String(i)}].p_Pa`),
    V_mL: num(raw["V_mL"], `toy[${String(i)}].V_mL`),
  };
}

type CombinedFrame = {
  frame: number;
  radioss_stretch: number | null;
  toy_stretch: number | null;
  radioss_V_mL: number | null;
  toy_V_mL: number | null;
  radioss_p_Pa: number | null;
  toy_p_Pa: number | null;
};

function parseNullableNum(v: unknown, label: string): number | null {
  if (v === null) return null;
  return num(v, label);
}

function parseCombinedFrame(raw: unknown, i: number): CombinedFrame {
  if (!isRecord(raw)) throw new Error(`diag: combined frame ${String(i)} not an object`);
  return {
    frame: num(raw["frame"], `every_frame[${String(i)}].frame`),
    radioss_stretch: parseNullableNum(raw["radioss_stretch"], `every_frame[${String(i)}].radioss_stretch`),
    toy_stretch: parseNullableNum(raw["toy_stretch"], `every_frame[${String(i)}].toy_stretch`),
    radioss_V_mL: parseNullableNum(raw["radioss_V_mL"], `every_frame[${String(i)}].radioss_V_mL`),
    toy_V_mL: parseNullableNum(raw["toy_V_mL"], `every_frame[${String(i)}].toy_V_mL`),
    radioss_p_Pa: parseNullableNum(raw["radioss_p_Pa"], `every_frame[${String(i)}].radioss_p_Pa`),
    toy_p_Pa: parseNullableNum(raw["toy_p_Pa"], `every_frame[${String(i)}].toy_p_Pa`),
  };
}

function relErr(ours: number, gold: number): number {
  return Math.abs(ours - gold) / Math.max(Math.abs(gold), 1e-30);
}

/** Incompressible neo-Hookean thin spherical membrane, Ogden α=2. */
function nhSpherePressure(lambda: number, mu: number, h0: number, r0: number): number {
  return 2 * mu * (h0 / r0) * (lambda ** -1 - lambda ** -7);
}

function equivalentSphereRadius(volume_m3: number): number {
  return Math.cbrt((3 * volume_m3) / (4 * Math.PI));
}

const tableRaw = readJson("four-item-table.json");
if (!isRecord(tableRaw)) throw new Error("diag: four-item-table.json not an object");
const itemsRaw = tableRaw["items"];
if (!isRecord(itemsRaw)) throw new Error("diag: items not an object");
const item1Raw = itemsRaw["1"];
const item2Raw = itemsRaw["2"];
const item3Raw = itemsRaw["3"];
const item4Raw = itemsRaw["4"];
if (!isRecord(item1Raw) || !isRecord(item2Raw) || !isRecord(item3Raw) || !isRecord(item4Raw)) {
  throw new Error("diag: missing item 1/2/3/4");
}

/**
 * Themis Quality lock: all four control items in one table.
 * If item 1 fails, the new package is the problem and the new golden does not count.
 * If it passes, the toy snap-through is what needs explaining; any fix is toy physics
 * with μ and the load law untouched. Diagnosis only — this file does not change the toy.
 */
describe("PR18 OpenCourant control (Themis four-item table)", () => {
  it("reading rule is locked in the same table as the four items", () => {
    expect(str(tableRaw["reading_rule"], "reading_rule")).toContain("new golden does not count");
    expect(str(tableRaw["reading_rule"], "reading_rule")).toContain("snap-through");
    expect(str(tableRaw["reading_rule"], "reading_rule")).toContain("material stiffness and the load law untouched");
    expect(bool(tableRaw["diagnosis_only"], "diagnosis_only")).toBe(true);
    expect(bool(tableRaw["toy_unchanged"], "toy_unchanged")).toBe(true);
    expect(bool(tableRaw["mu_and_load_law_untouched"], "mu_and_load_law_untouched")).toBe(true);
    const bands = tableRaw["bands_unchanged"];
    if (!isRecord(bands)) throw new Error("diag: bands_unchanged");
    expect(num(bands["lambdaRel"], "bands.lambdaRel")).toBe(INFLATE_BANDS.lambdaRel);
    expect(num(bands["volumeRel"], "bands.volumeRel")).toBe(INFLATE_BANDS.volumeRel);
    expect(num(bands["pressureRel"], "bands.pressureRel")).toBe(INFLATE_BANDS.pressureRel);
    expect(num(bands["lambdaRel"], "bands.lambdaRel")).toBe(0.02);
    expect(num(bands["volumeRel"], "bands.volumeRel")).toBe(0.05);
    expect(num(bands["pressureRel"], "bands.pressureRel")).toBe(0.05);
    const golden = loadInflateGolden();
    expect(golden.bands.lambdaRel).toBe(0.02);
    expect(golden.bands.volumeRel).toBe(0.05);
    expect(golden.bands.pressureRel).toBe(0.05);
  });

  it("1. old unoriented deck on this package reproduces the old golden", () => {
    const unoriented = parseRadiossTape(readJson("unoriented-opencourant-metrics.json"), "unoriented");
    const frame11 = unoriented.find((row) => row.frame === 11);
    expect(frame11).toBeDefined();
    if (frame11 === undefined) return;

    const oldGolden = item1Raw["old_golden"];
    if (!isRecord(oldGolden)) throw new Error("diag: item1.old_golden");
    expect(num(oldGolden["frame"], "old_golden.frame")).toBe(11);
    expect(num(oldGolden["lambdaMax"], "old_golden.lambdaMax")).toBe(2.1404);
    expect(num(oldGolden["volume_mL"], "old_golden.volume_mL")).toBe(901.8);
    expect(num(oldGolden["p_Pa"], "old_golden.p_Pa")).toBe(35769);

    const lambdaRel = relErr(frame11.lam_max, 2.1404);
    const volumeRel = relErr(frame11.V_mL, 901.8);
    const pressureRel = relErr(frame11.p_Pa, 35769);
    expect(lambdaRel).toBeLessThanOrEqual(0.02);
    expect(volumeRel).toBeLessThanOrEqual(0.05);
    expect(pressureRel).toBeLessThanOrEqual(0.05);
    expect(lambdaRel).toBeLessThan(0.0001);
    expect(volumeRel).toBeLessThan(0.0001);
    expect(pressureRel).toBeLessThan(0.0001);

    expect(bool(item1Raw["reproduces_old_golden"], "item1.reproduces_old_golden")).toBe(true);
    expect(bool(item1Raw["package_is_the_problem"], "item1.package_is_the_problem")).toBe(false);
    expect(bool(item1Raw["new_oriented_golden_counts"], "item1.new_oriented_golden_counts")).toBe(true);

    const measured = item1Raw["measured"];
    if (!isRecord(measured)) throw new Error("diag: item1.measured");
    expect(Object.is(num(measured["lambdaMax"], "measured.lambdaMax"), frame11.lam_max)).toBe(true);
    expect(Object.is(num(measured["volume_mL"], "measured.volume_mL"), frame11.V_mL)).toBe(true);
    expect(Object.is(num(measured["p_Pa"], "measured.p_Pa"), frame11.p_Pa)).toBe(true);

    const unorientedDeck = readFileSync(new URL("../radioss/diag-unoriented/Ainflate_0000.rad", import.meta.url), "utf8");
    expect(unorientedDeck).toContain("Ismstr=10");
    expect(unorientedDeck).toMatch(/\n\s+1\s+10\s+2\s+1\s+0/);
  });

  it("2. oriented Ismstr 10 is refused and identical to Ismstr 2", () => {
    const ism10 = parseRadiossTape(
      readJson("oriented-ismstr10-requested-metrics.json"),
      "oriented-ismstr10",
    );
    const ism2 = parseRadiossTape(readJson("oriented-ismstr2-metrics.json"), "oriented-ismstr2");
    expect(ism10).toHaveLength(ism2.length);
    for (let i = 0; i < ism10.length; i++) {
      const a = ism10[i];
      const b = ism2[i];
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (a === undefined || b === undefined) return;
      expect(Object.is(a.t, b.t)).toBe(true);
      expect(Object.is(a.lam_max, b.lam_max)).toBe(true);
      expect(Object.is(a.V_mL, b.V_mL)).toBe(true);
      expect(Object.is(a.p_Pa, b.p_Pa)).toBe(true);
    }
    expect(bool(item2Raw["tapes_identical_every_frame"], "item2.tapes_identical_every_frame")).toBe(true);

    const starter10 = readText("oriented-ismstr10-starter-warning.txt");
    expect(starter10).toContain("WARNING ID :   3019");
    expect(starter10).toContain("INVALID ISMSTR=10, CHANGE TO 2");
    expect(starter10).toContain("INCOMPATIBLE TO ISHEL= 2");
    const ten = item2Raw["ismstr_10_requested"];
    if (!isRecord(ten)) throw new Error("diag: item2.ismstr_10_requested");
    expect(bool(ten["starter_refuses_10"], "starter_refuses_10")).toBe(true);
    expect(str(ten["starter_message"], "starter_message")).toContain("INVALID ISMSTR=10, CHANGE TO 2");

    const two = item2Raw["ismstr_2_written"];
    if (!isRecord(two)) throw new Error("diag: item2.ismstr_2_written");
    expect(bool(two["starter_refuses_10"], "ismstr2.starter_refuses_10")).toBe(false);

    const oriented10Deck = readFileSync(new URL("../radioss/A-inflate/Ainflate_0000.rad", import.meta.url), "utf8");
    const oriented2Deck = readFileSync(
      new URL("../radioss/diag-oriented-ismstr2/Ainflate_0000.rad", import.meta.url),
      "utf8",
    );
    expect(oriented10Deck).toContain("Ismstr=10");
    expect(oriented10Deck).toMatch(/\n\s+1\s+10\s+2\s+1\s+0/);
    expect(oriented2Deck).toContain("Ismstr=2");
    expect(oriented2Deck).toMatch(/\n\s+1\s+2\s+2\s+1\s+0/);
    expect(oriented2Deck).not.toContain("Ismstr=10");
  });

  it("3. stretch, pressure and volume vs time, every frame, both solvers", () => {
    const radioss = parseRadiossTape(readJson("oriented-ismstr2-metrics.json"), "oriented-ismstr2");
    const toyRaw = readJson("toy-history.json");
    if (!isRecord(toyRaw)) throw new Error("diag: toy-history.json");
    const toy = arr(toyRaw["frames"], "toy.frames").map((row, i) => parseToyFrame(row, i));
    const every = arr(item3Raw["every_frame"], "item3.every_frame").map((row, i) => parseCombinedFrame(row, i));

    expect(every.length).toBe(Math.max(radioss.length, toy.length));
    expect(every.length).toBe(13);

    for (const row of every) {
      const r = radioss.find((f) => f.frame === row.frame);
      const t = toy.find((f) => f.frame === row.frame);
      if (r !== undefined) {
        expect(Object.is(row.radioss_stretch, r.lam_max)).toBe(true);
        expect(Object.is(row.radioss_V_mL, r.V_mL)).toBe(true);
        expect(Object.is(row.radioss_p_Pa, r.p_Pa)).toBe(true);
      } else {
        expect(row.radioss_stretch).toBeNull();
      }
      if (t !== undefined) {
        expect(Object.is(row.toy_stretch, t.lambdaMax)).toBe(true);
        expect(Object.is(row.toy_V_mL, t.V_mL)).toBe(true);
        expect(Object.is(row.toy_p_Pa, t.p_Pa)).toBe(true);
      } else {
        expect(row.toy_stretch).toBeNull();
      }
    }

    const f0 = every[0];
    const f1 = every[1];
    const f8 = every[8];
    const f11 = every[11];
    const f12 = every[12];
    expect(f0).toBeDefined();
    expect(f1).toBeDefined();
    expect(f8).toBeDefined();
    expect(f11).toBeDefined();
    expect(f12).toBeDefined();
    if (f0 === undefined || f1 === undefined || f8 === undefined || f11 === undefined || f12 === undefined) return;

    expect(f0.radioss_stretch).toBeCloseTo(1, 6);
    expect(f0.toy_stretch).toBeCloseTo(1, 6);
    expect(f1.radioss_stretch).toBeCloseTo(1.709, 3);
    expect(f1.toy_stretch).toBeCloseTo(1.118, 3);
    expect(f8.radioss_stretch).toBeCloseTo(2.128, 3);
    expect(f8.toy_stretch).toBeCloseTo(1.422, 3);
    expect(f8.radioss_V_mL).toBeCloseTo(891.7, 1);
    expect(f8.toy_V_mL).toBeCloseTo(665.1, 1);
    expect(f11.radioss_stretch).toBeCloseTo(19.29, 2);
    expect(f11.toy_stretch).toBeCloseTo(1.612, 3);
    expect(f12.radioss_stretch).toBeNull();
    expect(f12.toy_stretch).toBeCloseTo(4.332, 3);
    expect(f12.toy_V_mL).toBeCloseTo(3274, 0);

    const first = item3Raw["first_divergence"];
    if (!isRecord(first)) throw new Error("diag: first_divergence");
    expect(num(first["frame"], "first_divergence.frame")).toBe(1);
    const snap = item3Raw["toy_snap"];
    if (!isRecord(snap)) throw new Error("diag: toy_snap");
    const before = snap["before"];
    const after = snap["after"];
    if (!isRecord(before) || !isRecord(after)) throw new Error("diag: toy_snap before/after");
    expect(num(before["frame"], "snap.before.frame")).toBe(11);
    expect(num(after["frame"], "snap.after.frame")).toBe(12);
    expect(num(before["stretch"], "snap.before.stretch")).toBeLessThan(2);
    expect(num(after["stretch"], "snap.after.stretch")).toBeGreaterThan(4);
  });

  it("4. closed-form peak-pressure estimate with formula and inputs written out", () => {
    expect(Object.is(MU, (800 * 6894.757) / 1.75)).toBe(true);
    expect(Object.is(H0, 0.015 * 0.0254)).toBe(true);
    expect(str(item4Raw["formula"], "formula")).toBe("p(λ) = 2 μ (H0/R0) (λ^{-1} - λ^{-7})");

    const inputs = item4Raw["inputs"];
    if (!isRecord(inputs)) throw new Error("diag: item4.inputs");
    expect(Object.is(num(inputs["mu_Pa"], "inputs.mu_Pa"), MU)).toBe(true);
    expect(Object.is(num(inputs["H0_m"], "inputs.H0_m"), H0)).toBe(true);
    expect(num(inputs["alpha"], "inputs.alpha")).toBe(2);

    const v0Oriented = num(inputs["V0_oriented_m3"], "V0_oriented_m3");
    const v0Aswound = num(inputs["V0_aswound_m3"], "V0_aswound_m3");
    const r0Oriented = equivalentSphereRadius(v0Oriented);
    const r0Aswound = equivalentSphereRadius(v0Aswound);
    const lambdaStar = 7 ** (1 / 6);
    const pMaxOriented = nhSpherePressure(lambdaStar, MU, H0, r0Oriented);
    const pMaxAswound = nhSpherePressure(lambdaStar, MU, H0, r0Aswound);

    const limit = item4Raw["limit_point_value"];
    if (!isRecord(limit)) throw new Error("diag: limit_point_value");
    expect(num(limit["lambda_star"], "lambda_star")).toBeCloseTo(lambdaStar, 12);
    expect(lambdaStar).toBeCloseTo(1.383, 3);

    const oriented = item4Raw["oriented_equivalent_sphere"];
    const aswound = item4Raw["aswound_equivalent_sphere"];
    if (!isRecord(oriented) || !isRecord(aswound)) throw new Error("diag: equivalent spheres");
    expect(num(oriented["R0_m"], "oriented.R0")).toBeCloseTo(r0Oriented, 12);
    expect(num(oriented["p_max_Pa"], "oriented.p_max")).toBeCloseTo(pMaxOriented, 6);
    expect(num(aswound["R0_m"], "aswound.R0")).toBeCloseTo(r0Aswound, 12);
    expect(num(aswound["p_max_Pa"], "aswound.p_max")).toBeCloseTo(pMaxAswound, 6);
    expect(pMaxOriented / 1000).toBeCloseTo(32.0, 1);
    expect(pMaxAswound / 1000).toBeCloseTo(33.9, 1);

    const pAt = oriented["p_at_lambda"];
    if (!isRecord(pAt)) throw new Error("diag: p_at_lambda");
    expect(num(pAt["2.13"], "p(2.13)")).toBeCloseTo(nhSpherePressure(2.13, MU, H0, r0Oriented), 6);
    expect(num(pAt["4.33"], "p(4.33)")).toBeCloseTo(nhSpherePressure(4.33, MU, H0, r0Oriented), 6);
    expect(nhSpherePressure(2, MU, H0, r0Oriented)).toBeLessThan(pMaxOriented);
    expect(nhSpherePressure(4.33, MU, H0, r0Oriented)).toBeLessThan(nhSpherePressure(2.13, MU, H0, r0Oriented));
  });

  it("reading-rule verdict: item 1 passed, so the miss is the toy snap-through", () => {
    expect(bool(item1Raw["reproduces_old_golden"], "reproduces_old_golden")).toBe(true);
    expect(bool(item1Raw["package_is_the_problem"], "package_is_the_problem")).toBe(false);
    expect(bool(item1Raw["new_oriented_golden_counts"], "new_oriented_golden_counts")).toBe(true);
    const verdict = str(tableRaw["reading_rule_verdict"], "reading_rule_verdict");
    expect(verdict).toContain("Item 1 reproduced the old golden");
    expect(verdict).toContain("package is not the problem");
    expect(verdict).toContain("snap-through");
    expect(verdict).not.toContain("new golden does not count");
  });
});
