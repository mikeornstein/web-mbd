/**
 * MEASUREMENT. Not a physics pass. Does not gate.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import { ADYREL_VELOCITY_SCALE } from "../src/inflate/constants.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("MEASUREMENT 0–16 ms relaxation (not a pass, not a gate)", () => {
  it("prediction was written before the measurement run", () => {
    const text = readFileSync(new URL("adyrel-measurement-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new measurement run");
    expect(text).toContain("between kill-on and kill-off, close");
    expect(text).toContain("should **not** close the gap to the golden");
    expect(text).toContain("what the engine uses, not a proposed setting");
  });

  it("shipped default is still the 0.18 peak kill", () => {
    expect(createInflateAModel().controls.damping).toEqual({
      kind: "peak-kill",
      scale: ADYREL_VELOCITY_SCALE,
      minInterval: 0,
    });
  });
});
