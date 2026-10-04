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

  it("shipped default does not cap the time step and stays peak-kill", () => {
    const model = createInflateAModel();
    expect(model.controls.damping.kind).toBe("peak-kill");
    expect(model.controls.dtMax).toBeUndefined();
  });
});
