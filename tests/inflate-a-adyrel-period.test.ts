import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import {
  ENGINE_LISTING_FIRST_ON_TIME_S,
  firstOnRatePerSecond,
} from "../src/inflate/adaptivePeriod.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`adyrel-period test: bad ${label}`);
  return v;
}

describe("adaptive-period option (shipped default is kill-off)", () => {
  it("prediction file states the per-second port and copied 2.79 ms before any code", () => {
    const text = readFileSync(new URL("adyrel-period-port-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new toy code");
    expect(text).toContain("This work uses the per-second port with a real-time onset");
    expect(text).toContain("copied reference value from the engine’s real run on this deck");
    expect(text).toContain("1.65 ms");
    expect(text).toContain("2.79 ms");
    expect(text).toContain("print both, **stop**");
    expect(text.indexOf("per-second port")).toBeLessThan(text.indexOf("Sphere check"));
  });

  it("shipped letter A is velocity kill off, not continuous relaxation", () => {
    const model = createInflateAModel();
    expect(model.controls.damping).toEqual({ kind: "off" });
    expect(model.controls.damping.kind).not.toBe("adaptive-period");
  });

  it("copied listing onset is not a toy-computed free parameter", () => {
    expect(ENGINE_LISTING_FIRST_ON_TIME_S).toBe(0.00279);
    const toyMeanDt = 0.02400758092700195 / 2917;
    expect(200 * toyMeanDt).toBeCloseTo(0.001646, 5);
    expect(firstOnRatePerSecond(toyMeanDt)).toBeCloseTo(12.15, 1);
    expect(200 * toyMeanDt).not.toBeCloseTo(ENGINE_LISTING_FIRST_ON_TIME_S, 3);
  });

  it("live rate print stopped because toy Δt makes 10⁻⁴ / Δt far from 51 /s", () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL("adyrel-period-port-results.json", DIAG), "utf8"),
    );
    if (!isRecord(raw)) throw new Error("results json");
    expect(raw["stop"]).toBe(true);
    expect(raw["defaultChanged"]).toBe(false);
    expect(raw["sphereCheck"]).toBe("not-run");
    expect(raw["portApplied"]).toBe("per-second");
    if (!isRecord(raw["applied"])) throw new Error("applied");
    if (!isRecord(raw["perStep"])) throw new Error("perStep");
    if (!isRecord(raw["engineListing"])) throw new Error("listing");
    const appliedRate = num(raw["applied"]["firstOnRatePerSecond"], "applied.rate");
    const stepRate = num(raw["perStep"]["firstOnRatePerSecond"], "perStep.rate");
    const listingRate = num(raw["engineListing"]["ratePerSecond"], "listing.rate");
    expect(appliedRate).toBeCloseTo(11.86, 1);
    expect(stepRate).toBeCloseTo(12.01, 1);
    expect(listingRate).toBeCloseTo(50.7, 0);
    expect(appliedRate * 2).toBeLessThan(listingRate);
  });
});
