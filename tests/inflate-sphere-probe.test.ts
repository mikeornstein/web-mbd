/**
 * Sphere snap-through / 28 kPa hold probe. Not a default change.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("sphere snap-through and 28 kPa hold (prediction before any run)", () => {
  it("prediction was written before any new solver run, with bars and the independent closed form", () => {
    const text = readFileSync(new URL("sphere-probe-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new solver run");
    expect(text).toContain("λ(28 kPa) = 1.18757");
    expect(text).toContain("99.07%");
    expect(text).toContain("99.62%");
    expect(text).toContain("slower** of the two");
    expect(text).toContain("crosses");
    expect(text).toContain("1.60");
    expect(text).toContain("80 per second");
    expect(text).toContain("Do **not** hold at");
    expect(text).toContain("32.02 kPa");
    expect(text).toContain("1.971");
    expect(text).toContain("Part 1 stays as recorded");
  });

  it("shipped default is velocity kill off", () => {
    expect(createInflateAModel().controls.damping).toEqual({ kind: "off" });
  });

  it("Part 1 recorded result is left as a 4.7% top-stretch miss", () => {
    const md = readFileSync(new URL("slow-sphere-results.md", DIAG), "utf8");
    expect(md).toContain("Ramp-end stretch vs 1.383: **4.7%**");
    expect(md).toContain("0.9%");
  });

  it("committed probe meets the slower-ramp 5% snap bar and the 2% hold-stretch bar", () => {
    const md = readFileSync(new URL("sphere-probe-results.md", DIAG), "utf8");
    expect(md).toContain("PASS");
    expect(md).toContain("fell toward 32 kPa");
    expect(md).toContain("pinned only to the OpenCourant copy");
    const raw: unknown = JSON.parse(
      readFileSync(new URL("sphere-probe-results.json", DIAG), "utf8"),
    );
    function isRecord(v: unknown): v is Record<string, unknown> {
      return typeof v === "object" && v !== null;
    }
    function num(v: unknown, label: string): number {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`sphere-probe test: bad ${label}`);
      return v;
    }
    if (!isRecord(raw)) throw new Error("sphere-probe json");
    expect(raw["slowPass"]).toBe(true);
    expect(raw["holdPass"]).toBe(true);
    expect(raw["slowCapPass"]).toBe(true);
    expect(raw["holdCapPass"]).toBe(true);
    expect(raw["fellToward"]).toBe(true);
    expect(raw["anyMiss"]).toBe(false);
    expect(raw["defaultUnchanged"]).toBe("peak-kill-0.18");
    expect(num(raw["slowSnapP_Pa"], "slowSnap") / 1000).toBeCloseTo(32.38, 1);
    expect(num(raw["fastSnapP_Pa"], "fastSnap") / 1000).toBeCloseTo(32.52, 1);
    expect(num(raw["holdLam"], "holdLam")).toBeCloseTo(1.1856, 3);
    expect(num(raw["slowRel"], "slowRel")).toBeLessThan(0.05);
    expect(num(raw["holdRel"], "holdRel")).toBeLessThan(0.02);
  });
});
