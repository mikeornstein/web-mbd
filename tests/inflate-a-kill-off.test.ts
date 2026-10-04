import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADYREL_VELOCITY_SCALE } from "../src/inflate/constants.js";
import { createInflateAModel } from "../src/fixtures/inflateA.js";
import {
  compareKillOffRun,
  firstStretchGe2,
  nearestFrame,
  stretchMovedToward,
  type KillOffFrame,
} from "../src/oracle/killOffCompare.js";
import { INFLATE_BANDS } from "../src/oracle/compareInflate.js";
import {
  buildKillOffModel,
  parseKillEnv,
  parseKillSwitch,
  parseMeshKind,
} from "../src/oracle/killOffModel.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`kill-off test: bad ${label}`);
  return v;
}

function parseToyHistory(raw: unknown): KillOffFrame[] {
  if (!isRecord(raw)) throw new Error("toy-history not object");
  const frames = raw["frames"];
  if (!Array.isArray(frames)) throw new Error("toy-history frames");
  return frames.map((row, i) => {
    if (!isRecord(row)) throw new Error(`toy-history[${String(i)}]`);
    return {
      frame: num(row["frame"], "frame"),
      t: num(row["t"], "t"),
      lambdaMax: num(row["lambdaMax"], "lambdaMax"),
      p_Pa: num(row["p_Pa"], "p_Pa"),
      V_mL: num(row["V_mL"], "V_mL"),
    };
  });
}

function parseRadioss(raw: unknown): KillOffFrame[] {
  if (!Array.isArray(raw)) throw new Error("radioss tape not array");
  return raw.map((row, i) => {
    if (!isRecord(row)) throw new Error(`radioss[${String(i)}]`);
    return {
      frame: num(row["frame"], "frame"),
      t: num(row["t"], "t"),
      lambdaMax: num(row["lam_max"], "lam_max"),
      p_Pa: num(row["p_Pa"], "p_Pa"),
      V_mL: num(row["V_mL"], "V_mL"),
    };
  });
}

describe("kill-off diagnosis (default toy unchanged)", () => {
  it("default letter A still has the 0.18 kill on, even if the diagnosis env is off", () => {
    const prev = process.env["WEB_MBD_TOY_KINETIC_DAMPING"];
    process.env["WEB_MBD_TOY_KINETIC_DAMPING"] = "off";
    try {
      expect(parseKillEnv(process.env)).toBe("off");
      const model = createInflateAModel();
      expect(model.controls.kineticDamping).toBe(true);
      expect(model.controls.kineticDampingScale).toBe(ADYREL_VELOCITY_SCALE);
      expect(model.controls.kineticDampingScale).toBe(0.18);
      expect(model.mesh.fingerprint).toBe("f9635c7f");
    } finally {
      if (prev === undefined) {
        delete process.env["WEB_MBD_TOY_KINETIC_DAMPING"];
      } else {
        process.env["WEB_MBD_TOY_KINETIC_DAMPING"] = prev;
      }
    }
  });

  it("diagnosis builder can switch kill and mesh without touching the default factory", () => {
    const offOriented = buildKillOffModel({ mesh: "oriented", kill: "off" });
    expect(offOriented.controls.kineticDamping).toBe(false);
    expect(offOriented.controls.kineticDampingScale).toBe(0.18);
    expect(offOriented.mesh.fingerprint).toBe("f9635c7f");
    expect(offOriented.law.mu1).toBe(createInflateAModel().law.mu1);
    expect(offOriented.law.pMax).toBe(createInflateAModel().law.pMax);
    expect(offOriented.law.tRamp).toBe(createInflateAModel().law.tRamp);

    const onUnoriented = buildKillOffModel({ mesh: "unoriented", kill: "on" });
    expect(onUnoriented.controls.kineticDamping).toBe(true);
    expect(onUnoriented.mesh.fingerprint).toBe("d9c56487");

    expect(createInflateAModel().controls.kineticDamping).toBe(true);
    expect(createInflateAModel().mesh.fingerprint).toBe("f9635c7f");
  });

  it("parses flag values as on/off only", () => {
    expect(parseKillSwitch("off")).toBe("off");
    expect(parseKillSwitch("on")).toBe("on");
    expect(parseMeshKind("unoriented")).toBe("unoriented");
    expect(parseKillEnv({})).toBeNull();
    expect(() => parseKillSwitch("maybe")).toThrow(/on or off/);
  });

  it("locked oriented kill-on tape misses 2 ms stretch and the whole-run bands", () => {
    const toy: KillOffFrame[] = parseToyHistory(
      JSON.parse(readFileSync(new URL("toy-history.json", DIAG), "utf8")) as unknown,
    );
    const radioss: KillOffFrame[] = parseRadioss(
      JSON.parse(readFileSync(new URL("oriented-ismstr2-metrics.json", DIAG), "utf8")) as unknown,
    );
    const at2 = nearestFrame(toy, 0.002);
    const rad2 = nearestFrame(radioss, 0.002);
    expect(at2).not.toBeNull();
    expect(rad2).not.toBeNull();
    if (at2 === null || rad2 === null) return;
    expect(at2.lambdaMax).toBeCloseTo(1.118, 2);
    expect(rad2.lambdaMax).toBeCloseTo(1.709, 2);
    expect(stretchMovedToward(at2.lambdaMax, at2.lambdaMax, rad2.lambdaMax)).toBe(false);
    expect(stretchMovedToward(1.12, 1.71, 1.71)).toBe(true);
    expect(stretchMovedToward(1.12, 1.05, 1.71)).toBe(false);

    const cmp = compareKillOffRun(toy, radioss);
    expect(cmp.wholeRunInsideBands).toBe(false);
    expect(cmp.maxLambdaRel).not.toBeNull();
    if (cmp.maxLambdaRel === null) return;
    expect(cmp.maxLambdaRel).toBeGreaterThan(INFLATE_BANDS.lambdaRel);

    const toyWarn = firstStretchGe2(toy);
    expect(toyWarn?.frame).toBe(12);
    expect(toyWarn?.lambdaMax).toBeCloseTo(4.33, 2);
    expect(cmp.firstStretchGe2.insideBands).toBe(false);
  });

  it("prediction file states the refute rule before any kill-off run", () => {
    const text = readFileSync(new URL("kill-off-prediction.md", DIAG), "utf8");
    expect(text).toContain("Written **before** any kill-off run");
    expect(text).toContain("Matching a **single frame**");
    expect(text).toContain("What result would refute it");
    expect(text).toContain("This **does not** weaken the 0.18 explanation on time-window grounds");
  });

  it("committed kill-off results refute the prediction and keep the unoriented baseline", () => {
    const raw: unknown = JSON.parse(readFileSync(new URL("kill-off-results.json", DIAG), "utf8"));
    if (!isRecord(raw)) throw new Error("kill-off-results.json not object");
    const verdictRaw = raw["verdict"];
    if (!isRecord(verdictRaw)) throw new Error("verdict missing");
    expect(verdictRaw["predictionRefuted"]).toBe(true);
    expect(verdictRaw["twoMsMovedTowardRadioss"]).toBe(false);
    expect(verdictRaw["twoMsStretchKillOffEqualsKillOn"]).toBe(true);
    expect(verdictRaw["runA_wholeRunInsideBands"]).toBe(false);
    expect(verdictRaw["runC_firstStretchGe2InsideBands"]).toBe(true);
    expect(verdictRaw["noScaleFitted"]).toBe(true);
    expect(num(verdictRaw["orientedKillOffTwoMsStretch"], "off2")).toBe(
      num(verdictRaw["orientedKillOnTwoMsStretch"], "on2"),
    );
    expect(num(verdictRaw["runC_firstStretchGe2_lambdaRel"], "cLam")).toBeCloseTo(0.00307, 5);

    const runs = raw["runs"];
    if (!Array.isArray(runs) || runs.length !== 3) throw new Error("expected three runs");
    const runA = runs[0];
    const runC = runs[2];
    if (!isRecord(runA) || !isRecord(runC)) throw new Error("run A/C");
    expect(runA["kill"]).toBe("off");
    expect(runA["mesh"]).toBe("oriented");
    expect(runC["kill"]).toBe("on");
    expect(runC["mesh"]).toBe("unoriented");
    const aFrames = runA["frames"];
    if (!Array.isArray(aFrames) || !isRecord(aFrames[1])) throw new Error("run A frames");
    expect(num(aFrames[1]["lambdaMax"], "A 2ms")).toBe(1.1183172586557617);

    const md = readFileSync(new URL("kill-off-results.md", DIAG), "utf8");
    expect(md).toContain("The prediction is refuted");
    expect(md).toContain("No scale number was picked afterward");
    expect(md).toContain("still matches the old tape");
  });
});
