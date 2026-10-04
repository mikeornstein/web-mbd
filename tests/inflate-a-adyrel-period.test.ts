import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { ADYREL_VELOCITY_SCALE } from "../src/inflate/constants.js";
import {
  ENGINE_LISTING_FIRST_ON_TIME_S,
  firstOnRatePerSecond,
} from "../src/inflate/adaptivePeriod.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("adaptive-period option (default still peak-kill)", () => {
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

  it("shipped letter A is still the 0.18 peak kill, not continuous relaxation", () => {
    const model = createInflateAModel();
    expect(model.controls.damping).toEqual({
      kind: "peak-kill",
      scale: ADYREL_VELOCITY_SCALE,
      minInterval: 0,
    });
    expect(model.controls.damping.kind).not.toBe("adaptive-period");
  });

  it("copied listing onset is not a toy-computed free parameter", () => {
    expect(ENGINE_LISTING_FIRST_ON_TIME_S).toBe(0.00279);
    const toyMeanDt = 0.02400758092700195 / 2917;
    expect(200 * toyMeanDt).toBeCloseTo(0.001646, 5);
    expect(firstOnRatePerSecond(toyMeanDt)).toBeCloseTo(12.15, 1);
    expect(200 * toyMeanDt).not.toBeCloseTo(ENGINE_LISTING_FIRST_ON_TIME_S, 3);
  });
});
