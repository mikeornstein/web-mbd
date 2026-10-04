/**
 * MEASUREMENT. Not a physics pass. Does not gate.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInflateAModel } from "../src/fixtures/inflateA.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`measurement test: bad ${label}`);
  return v;
}

describe("MEASUREMENT 0–16 ms relaxation (not a pass, not a gate)", () => {
  it("prediction was written before the measurement run", () => {
    const text = readFileSync(new URL("adyrel-measurement-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any new measurement run");
    expect(text).toContain("between kill-on and kill-off, close");
    expect(text).toContain("should **not** close the gap to the golden");
    expect(text).toContain("what the engine uses, not a proposed setting");
  });

  it("shipped default is velocity kill off", () => {
    expect(createInflateAModel().controls.damping).toEqual({ kind: "off" });
  });

  it("committed table is labeled a measurement and does not claim a pass", () => {
    const md = readFileSync(new URL("adyrel-measurement-results.md", DIAG), "utf8");
    expect(md).toContain("MEASUREMENT. Not a physics pass. Does not gate.");
    expect(md).toContain("pinned only to the OpenCourant copy");
    expect(md).toContain("Moved toward the golden overall: **no**");
    const raw: unknown = JSON.parse(
      readFileSync(new URL("adyrel-measurement-results.json", DIAG), "utf8"),
    );
    if (!isRecord(raw)) throw new Error("measurement json");
    expect(raw["measurement"]).toBe(true);
    expect(raw["physicsPass"]).toBe(false);
    expect(raw["gates"]).toBe(false);
    expect(raw["movedTowardGolden"]).toBe(false);
    expect(raw["defaultUnchanged"]).toBe("peak-kill-0.18");
    expect(raw["openCourantCommitOnly"]).toBe("6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba");
    const rows = raw["rows"];
    if (!Array.isArray(rows)) throw new Error("rows");
    const at16 = rows[8];
    if (!isRecord(at16) || !isRecord(at16["ported"]) || !isRecord(at16["killOff"]) || !isRecord(at16["golden"])) {
      throw new Error("16 ms row");
    }
    expect(num(at16["t_ms"], "t")).toBe(16);
    expect(num(at16["ported"]["lambdaMax"], "ported.lam")).toBeCloseTo(2.076, 2);
    expect(num(at16["killOff"]["lambdaMax"], "killOff.lam")).toBeCloseTo(2.105, 2);
    expect(num(at16["golden"]["lambdaMax"], "golden.lam")).toBeCloseTo(2.128, 2);
    expect(num(at16["ported"]["lambdaMax"], "ported.lam")).toBeLessThan(num(at16["killOff"]["lambdaMax"], "off"));
  });
});
