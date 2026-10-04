/**
 * Slow-load sphere check. Stop if the curve is missed. Not a default change.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { ADYREL_VELOCITY_SCALE } from "../src/inflate/constants.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("slow-load sphere vs closed-form curve (stop at first failure)", () => {
  it("prediction was written before any new solver run, including what 23.51 / 12.35 kPa means", () => {
    const text = readFileSync(new URL("slow-sphere-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new solver run");
    expect(text).toContain("23.51 kPa");
    expect(text).toContain("12.35 kPa");
    expect(text).toContain("not** a maximised quantity");
    expect(text).toContain("prescribed ramp");
    expect(text).toContain("crosses 1.383");
    expect(text).toContain("read from the code");
    expect(text).toContain("cannot** be the 32 kPa limit-point");
    expect(text).toContain("higher**");
    expect(text).toContain("pressure than the static curve");
  });

  it("shipped default is still the 0.18 peak kill", () => {
    expect(createInflateAModel().controls.damping).toEqual({
      kind: "peak-kill",
      scale: ADYREL_VELOCITY_SCALE,
      minInterval: 0,
    });
    expect(createInflateAModel().controls.dtMax).toBeUndefined();
  });
});
