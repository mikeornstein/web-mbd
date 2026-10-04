/**
 * Kill-off default prediction lock. Not a physics pass by itself.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 * AGPL solver is not shipped in the Pages bundle.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

describe("kill-off default prediction (before any new run)", () => {
  it("prediction was written before any new solver run", () => {
    const text = readFileSync(new URL("kill-off-default-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new solver run");
    expect(text).toContain("Themis");
    expect(text).toContain("gates");
    expect(text).toContain("32.38");
    expect(text).toContain("1.18757");
    expect(text).toContain("4.7%");
    expect(text).toContain("0.9%");
    expect(text).toContain("stretch 1.50");
    expect(text).toContain("stretch 2.00");
    expect(text).toContain("pinned only to the OpenCourant copy");
  });

  it("sphere result doc records Part 1 miss and probe pass without editing those tapes", () => {
    const text = readFileSync(new URL("sphere-result.md", DIAG), "utf8");
    expect(text).toContain("4.7%");
    expect(text).toContain("0.9%");
    expect(text).toContain("1.1%");
    expect(text).toContain("0.2%");
    expect(text).toContain("not edited");
    const part1 = readFileSync(new URL("slow-sphere-results.md", DIAG), "utf8");
    expect(part1).toContain("Ramp-end stretch vs 1.383: **4.7%**");
    const probe = readFileSync(new URL("sphere-probe-results.md", DIAG), "utf8");
    expect(probe).toContain("1.1%");
  });
});
