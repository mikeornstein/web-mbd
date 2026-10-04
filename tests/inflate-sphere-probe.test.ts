/**
 * Sphere snap-through / 28 kPa hold probe. Not a default change.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { ADYREL_VELOCITY_SCALE } from "../src/inflate/constants.js";

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

  it("shipped default is still the 0.18 peak kill", () => {
    expect(createInflateAModel().controls.damping).toEqual({
      kind: "peak-kill",
      scale: ADYREL_VELOCITY_SCALE,
      minInterval: 0,
    });
  });

  it("Part 1 recorded result is left as a 4.7% top-stretch miss", () => {
    const md = readFileSync(new URL("slow-sphere-results.md", DIAG), "utf8");
    expect(md).toContain("Ramp-end stretch vs 1.383: **4.7%**");
    expect(md).toContain("0.9%");
  });
});
