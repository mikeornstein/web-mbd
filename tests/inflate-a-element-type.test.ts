import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`element-type: bad ${label}`);
  return v;
}

function snapAt(run: Record<string, unknown>, tMs: number): Record<string, unknown> {
  const snaps = run["snapshots"];
  if (!Array.isArray(snaps)) throw new Error("snapshots missing");
  const hit = snaps.find((s) => isRecord(s) && s["t_ms"] === tMs);
  if (!isRecord(hit)) throw new Error(`no snapshot ${tMs}`);
  return hit;
}

function maxAt(run: Record<string, unknown>, tMs: number): number {
  const s = snapAt(run, tMs);
  if (s["available"] !== true) throw new Error(`${tMs} ms missing`);
  const st = s["stats"];
  if (!isRecord(st)) throw new Error("stats");
  return num(st["max"], "max");
}

function near90(run: Record<string, unknown>, tMs: number): number {
  const s = snapAt(run, tMs);
  const n = s["nearElement90"];
  if (!isRecord(n)) throw new Error("near 90");
  return num(n["lam"], "near90");
}

describe("element-type diagnosis (Radioss only, no toy physics change)", () => {
  const raw: unknown = JSON.parse(readFileSync(new URL("element-type.json", DIAG), "utf8"));
  if (!isRecord(raw)) throw new Error("element-type.json");
  const runs = raw["runs"];
  if (!isRecord(runs)) throw new Error("runs");

  it("locks the committed 2 ms maxima and the element-90 neighborhood", () => {
    const sh3n = runs["sh3n"];
    const qeph = runs["qeph"];
    const qeph2 = runs["qephIsmstr2"];
    const fine = runs["fine"];
    if (!isRecord(sh3n) || !isRecord(qeph) || !isRecord(qeph2) || !isRecord(fine)) {
      throw new Error("missing run");
    }

    expect(maxAt(sh3n, 2)).toBeGreaterThan(1.09);
    expect(maxAt(sh3n, 2)).toBeLessThan(1.13);
    expect(near90(sh3n, 2)).toBeLessThan(1.08);
    expect(snapAt(sh3n, 16)["available"]).toBe(false);

    expect(snapAt(qeph, 2)["available"]).toBe(false);
    const qDeath = qeph["death"];
    if (!isRecord(qDeath)) throw new Error("qeph death");
    expect(qDeath["cycles"]).toBe(6);

    expect(maxAt(qeph2, 2)).toBeGreaterThan(1.15);
    expect(maxAt(qeph2, 2)).toBeLessThan(1.25);
    expect(near90(qeph2, 2)).toBeLessThan(1.08);

    expect(maxAt(fine, 2)).toBeGreaterThan(1.18);
    expect(maxAt(fine, 2)).toBeLessThan(1.30);
    expect(near90(fine, 2)).toBeLessThan(1.25);
    expect(near90(fine, 2)).toBeGreaterThan(1.1);
  });

  it("says the 1.7 hot spot does not survive on triangles or QEPH", () => {
    const md = readFileSync(new URL("element-type.md", DIAG), "utf8");
    expect(md).toContain("Belytschko four-node (Ishell 1) artifact");
    expect(md).toContain("Hot spot near element 90 survives (≥ 1.4): **no**");
    expect(md).toContain("Diagnosis only");
    expect(md).toContain("were not changed");
  });
});
