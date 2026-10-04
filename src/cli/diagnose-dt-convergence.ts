import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { ENGINE_LISTING_FIRST_ON_DT_S } from "../inflate/adaptivePeriod.js";
import type { InflateModelIR } from "../inflate/types.js";
import {
  MEASUREMENT_TIMES_MS,
  SPHERE_LAMBDA_STAR,
  nearestFrame,
  sphereCrossing,
  type MeasurementFrame,
  type SphereCrossing,
} from "../oracle/adyrelMeasurement.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const END_S = 0.0162;
const STRETCH_BAND = 0.02;
const VOLUME_BAND = 0.05;
const PRESSURE_BAND = 0.05;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`dt-convergence: bad ${label}`);
  return v;
}

function parseKillOffA(raw: unknown): MeasurementFrame[] {
  if (!isRecord(raw)) throw new Error("kill-off-results not object");
  const runs = raw["runs"];
  if (!Array.isArray(runs) || !isRecord(runs[0])) throw new Error("kill-off run A");
  const frames = runs[0]["frames"];
  if (!Array.isArray(frames)) throw new Error("kill-off A frames");
  return frames.map((row, i) => {
    if (!isRecord(row)) throw new Error(`kill-off A[${String(i)}]`);
    return {
      t: num(row["t"], "t"),
      lambdaMax: num(row["lambdaMax"], "lambdaMax"),
      p_Pa: num(row["p_Pa"], "p_Pa"),
      V_mL: num(row["V_mL"], "V_mL"),
    };
  });
}

function parseGolden(raw: unknown): MeasurementFrame[] {
  if (!Array.isArray(raw)) throw new Error("golden tape not array");
  return raw.map((row, i) => {
    if (!isRecord(row)) throw new Error(`golden[${String(i)}]`);
    return {
      t: num(row["t"], "t"),
      lambdaMax: num(row["lam_max"], "lam_max"),
      p_Pa: num(row["p_Pa"], "p_Pa"),
      V_mL: num(row["V_mL"], "V_mL"),
    };
  });
}

function framesFromSolve(result: {
  history: { t: number }[];
  lambdaHistory: number[];
  pressureHistory: number[];
  volumeHistory: number[];
}): MeasurementFrame[] {
  return result.history.map((h, i) => ({
    t: h.t,
    lambdaMax: result.lambdaHistory[i] ?? 1,
    p_Pa: result.pressureHistory[i] ?? 0,
    V_mL: (result.volumeHistory[i] ?? 0) * 1e6,
  }));
}

function fmt(n: number | null, digits: number): string {
  if (n === null) return "—";
  return n.toFixed(digits);
}

function cell(row: MeasurementFrame | null): string {
  if (row === null) return "— / — / —";
  return `${fmt(row.lambdaMax, 3)} / ${fmt(row.V_mL, 1)} / ${fmt(row.p_Pa / 1000, 2)}`;
}

function sphereLine(label: string, cross: SphereCrossing | null): string {
  if (cross === null) return `- ${label}: max stretch never crossed 1.383 in 0–16 ms.`;
  return `- ${label}: stretch 1.383 at **${fmt(cross.t * 1e3, 2)} ms**, pressure **${fmt(cross.p_Pa / 1000, 2)} kPa**, volume ${fmt(cross.V_mL, 1)} mL. **computed.**`;
}

function rel(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);
}

function buildCappedModel(): InflateModelIR {
  const base = createInflateAModel();
  return {
    ...base,
    controls: {
      ...base.controls,
      endTime: END_S,
      damping: { kind: "off" },
      dtMax: ENGINE_LISTING_FIRST_ON_DT_S,
    },
  };
}

function main(): void {
  if (createInflateAModel().controls.damping.kind !== "peak-kill") {
    throw new Error("default toy is not peak-kill");
  }
  if (createInflateAModel().controls.dtMax !== undefined) {
    throw new Error("shipped default must not set dtMax");
  }

  const current = parseKillOffA(
    JSON.parse(readFileSync(resolve(DIAG, "kill-off-results.json"), "utf8")) as unknown,
  );
  const golden = parseGolden(
    JSON.parse(readFileSync(resolve(DIAG, "oriented-ismstr2-metrics.json"), "utf8")) as unknown,
  );

  console.log("CONVERGENCE CHECK. Kill off, no relaxation, listing 2 microsecond cap. Not a fit.");
  const result = solveInflate(buildCappedModel(), { maxWallMs: 600_000, continuePastWarn: true });
  const capped = framesFromSolve(result);
  console.log(`steps ${String(result.metrics.nSteps)}, t=${String(result.metrics.t)}`);

  const rows = MEASUREMENT_TIMES_MS.map((ms) => {
    const t = ms / 1000;
    return {
      t_ms: ms,
      current: nearestFrame(current, t),
      capped: nearestFrame(capped, t),
      golden: nearestFrame(golden, t),
    };
  });

  const sphereCurrent = sphereCrossing(current, SPHERE_LAMBDA_STAR);
  const sphereCapped = sphereCrossing(capped, SPHERE_LAMBDA_STAR);
  let sphereMoved = sphereCurrent === null || sphereCapped === null;
  if (sphereCurrent !== null && sphereCapped !== null) {
    if (rel(sphereCapped.t, sphereCurrent.t) > PRESSURE_BAND) sphereMoved = true;
    if (rel(sphereCapped.p_Pa, sphereCurrent.p_Pa) > PRESSURE_BAND) sphereMoved = true;
    if (rel(sphereCapped.V_mL, sphereCurrent.V_mL) > VOLUME_BAND) sphereMoved = true;
  }

  let framesMoved = false;
  const keyTimes = [2, 8, 16];
  for (const ms of keyTimes) {
    const row = rows.find((r) => r.t_ms === ms);
    if (!row?.current || !row.capped) continue;
    if (rel(row.capped.lambdaMax, row.current.lambdaMax) > STRETCH_BAND) framesMoved = true;
    if (rel(row.capped.V_mL, row.current.V_mL) > VOLUME_BAND) framesMoved = true;
  }
  const moved = framesMoved || sphereMoved;

  const lines = [
    "# CONVERGENCE CHECK: kill-off at listing 2 microsecond step",
    "",
    "Not a damping variant. Not a fit. Default stays the 0.18 peak kill.",
    "",
    "The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.",
    "",
    `Time-step cap **${ENGINE_LISTING_FIRST_ON_DT_S.toExponential(4)} s** is **copied** from the golden listing Δt at cycle 200, via the period description. Not computed from the toy, not fitted.`,
    "",
    "## Sphere check (printed first, so a mismatch is a step-size error before the film)",
    "",
    "**read from docs:** closed-form peak is about 32 kPa at stretch 1.383. Letter A is not a sphere. Toy pressure is the prescribed ramp, so the crossing time need not carry 32 kPa.",
    sphereLine("kill off, current step", sphereCurrent),
    sphereLine("kill off, 2 μs cap", sphereCapped),
  ];
  if (sphereMoved) {
    lines.push(
      "Sphere vs current kill-off: **mismatch**. That is a **step-dependent error** on the sphere check. **computed.**",
    );
  } else {
    lines.push(
      "Sphere vs current kill-off: **match** inside 5% time, 5% pressure, 5% volume. Not a jump toward 32 kPa. **computed.**",
    );
  }
  lines.push("");
  lines.push("Each cell is max stretch / volume (mL) / pressure (kPa).");
  lines.push("");
  lines.push(
    "| t (ms) | kill off, current step (**computed** earlier) | kill off, 2 μs cap (**computed** this run) | golden (**computed** earlier) |",
  );
  lines.push("| ---: | --- | --- | --- |");
  for (const row of rows) {
    lines.push(`| ${String(row.t_ms)} | ${cell(row.current)} | ${cell(row.capped)} | ${cell(row.golden)} |`);
  }
  lines.push("");
  if (moved) {
    lines.push(
      "Verdict: **step-dependent error**. Capped-Δt sphere or 2/8/16 ms frames moved more than the comparison bands from the current kill-off. **computed.**",
    );
  } else {
    lines.push(
      "Verdict: **step-independent** at this listing Δt. Sphere and 2/8/16 ms frames stayed next to the current kill-off. Step size is cleared. **computed.**",
    );
  }
  lines.push("");
  lines.push("Stop. No further variants.");

  const md = `${lines.join("\n")}\n`;
  const payload = {
    kind: "dt-convergence",
    dtMax_s: ENGINE_LISTING_FIRST_ON_DT_S,
    nSteps: result.metrics.nSteps,
    stepDependent: moved,
    framesMoved,
    sphereMoved,
    sphereLambdaStar: SPHERE_LAMBDA_STAR,
    sphere: { current: sphereCurrent, capped: sphereCapped },
    rows,
    defaultUnchanged: "peak-kill-0.18",
    openCourantCommitOnly: "6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba",
  };
  mkdirSync(DIAG, { recursive: true });
  writeFileSync(resolve(DIAG, "dt-convergence-results.md"), md);
  writeFileSync(resolve(DIAG, "dt-convergence-results.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(md);
}

main();
