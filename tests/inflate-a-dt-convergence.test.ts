/**
 * CONVERGENCE CHECK. Not a damping variant. Not a physics pass.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("time-step convergence check (kill off, listing 2 μs cap)", () => {
  it("prediction was written before the capped-Δt run", () => {
    const text = readFileSync(new URL("dt-convergence-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new time-step run");
    expect(text).toContain("1.971×10⁻⁶ s");
    expect(text).toContain("If the toy is **step-independent**");
  });

  it("sphere prediction was written before the capped-Δt sphere print", () => {
    const text = readFileSync(new URL("dt-convergence-sphere-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new sphere print");
    expect(text).toContain("step-size");
    expect(text).toContain("before anyone reads the film frames");
    expect(text).toContain("7.6");
    expect(text).toContain("32");
  });

  it("shipped default does not cap the time step and stays peak-kill", () => {
    const model = createInflateAModel();
    expect(model.controls.damping.kind).toBe("peak-kill");
    expect(model.controls.dtMax).toBeUndefined();
  });

  it("committed capped-Δt table is step-independent at 2, 8, and 16 ms", () => {
    const md = readFileSync(new URL("dt-convergence-results.md", DIAG), "utf8");
    expect(md).toContain("step-independent");
    expect(md).toContain("pinned only to the OpenCourant copy");
    const raw: unknown = JSON.parse(
      readFileSync(new URL("dt-convergence-results.json", DIAG), "utf8"),
    );
    function isRecord(v: unknown): v is Record<string, unknown> {
      return typeof v === "object" && v !== null;
    }
    function num(v: unknown, label: string): number {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`dt test: bad ${label}`);
      return v;
    }
    if (!isRecord(raw)) throw new Error("dt json");
    expect(raw["stepDependent"]).toBe(false);
    expect(raw["sphereMoved"]).toBe(false);
    expect(raw["framesMoved"]).toBe(false);
    expect(raw["defaultUnchanged"]).toBe("peak-kill-0.18");
    expect(md).toContain("Sphere check (printed first");
    expect(md).toContain("7.65 ms");
    const sphere = raw["sphere"];
    if (!isRecord(sphere) || !isRecord(sphere["current"]) || !isRecord(sphere["capped"])) {
      throw new Error("sphere");
    }
    expect(num(sphere["current"]["t"], "sphere.current.t") * 1e3).toBeCloseTo(7.6, 1);
    expect(num(sphere["capped"]["t"], "sphere.capped.t") * 1e3).toBeCloseTo(7.65, 1);
    expect(num(sphere["capped"]["p_Pa"], "sphere.capped.p") / 1000).toBeCloseTo(12.43, 1);
    const rows = raw["rows"];
    if (!Array.isArray(rows)) throw new Error("rows");
    const at2 = rows[1];
    const at16 = rows[8];
    if (!isRecord(at2) || !isRecord(at16)) throw new Error("key rows");
    if (!isRecord(at2["capped"]) || !isRecord(at16["capped"]) || !isRecord(at16["current"])) {
      throw new Error("cells");
    }
    expect(num(at2["capped"]["lambdaMax"], "2ms")).toBeCloseTo(1.116, 2);
    expect(num(at16["capped"]["lambdaMax"], "16ms cap")).toBeCloseTo(2.071, 2);
    expect(num(at16["current"]["lambdaMax"], "16ms cur")).toBeCloseTo(2.105, 2);
  });
});
