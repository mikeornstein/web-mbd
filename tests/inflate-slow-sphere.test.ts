/**
 * Slow-load sphere check. Stop if the curve is missed. Not a default change.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";

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

  it("shipped default is velocity kill off", () => {
    expect(createInflateAModel().controls.damping).toEqual({ kind: "off" });
    expect(createInflateAModel().controls.dtMax).toBeUndefined();
  });

  it("committed Part 1 result is a fail on the 2% top-stretch yardstick; default unchanged", () => {
    const md = readFileSync(new URL("slow-sphere-results.md", DIAG), "utf8");
    expect(md).toContain("FAIL");
    expect(md).toContain("Stop. Do not go on to Part 2");
    expect(md).toContain("pinned only to the OpenCourant copy");
    expect(md).toContain("4.7%");
    const raw: unknown = JSON.parse(
      readFileSync(new URL("slow-sphere-results.json", DIAG), "utf8"),
    );
    function isRecord(v: unknown): v is Record<string, unknown> {
      return typeof v === "object" && v !== null;
    }
    function num(v: unknown, label: string): number {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`slow-sphere test: bad ${label}`);
      return v;
    }
    if (!isRecord(raw)) throw new Error("slow-sphere json");
    expect(raw["follows"]).toBe(false);
    expect(raw["failKind"]).toBe("top-stretch-yardstick");
    expect(raw["defaultUnchanged"]).toBe("peak-kill-0.18");
    expect(raw["punchedThrough"]).toBe(false);
    expect(raw["dtCapRun"]).toBe(false);
    expect(raw["openCourantCommitOnly"]).toBe("6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba");
    expect(num(raw["risingBranchMaxAbsRel"], "branch")).toBeCloseTo(0.009, 2);
    expect(num(raw["topLamRel"], "topLam")).toBeCloseTo(0.047, 2);
    expect(num(raw["topPRel"], "topP")).toBe(0);
  });
});
