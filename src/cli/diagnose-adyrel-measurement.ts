import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import {
  ENGINE_LISTING_FIRST_ON_RATE_PER_S,
  ENGINE_LISTING_FIRST_ON_TIME_S,
} from "../inflate/adaptivePeriod.js";
import type { InflateModelIR } from "../inflate/types.js";
import {
  MEASUREMENT_TIMES_MS,
  SPHERE_LAMBDA_STAR,
  insideBands,
  movedTowardGolden,
  nearestFrame,
  sphereCrossing,
  type MeasurementFrame,
} from "../oracle/adyrelMeasurement.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const END_S = 0.0162;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`measurement: bad ${label}`);
  return v;
}

function parseToyHistory(raw: unknown): MeasurementFrame[] {
  if (!isRecord(raw)) throw new Error("toy-history not object");
  const frames = raw["frames"];
  if (!Array.isArray(frames)) throw new Error("toy-history frames");
  return frames.map((row, i) => {
    if (!isRecord(row)) throw new Error(`toy-history[${String(i)}]`);
    return {
      t: num(row["t"], "t"),
      lambdaMax: num(row["lambdaMax"], "lambdaMax"),
      p_Pa: num(row["p_Pa"], "p_Pa"),
      V_mL: num(row["V_mL"], "V_mL"),
    };
  });
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

function sphereLine(label: string, cross: ReturnType<typeof sphereCrossing>): string {
  if (cross === null) return `- ${label}: max stretch never crossed 1.383 in 0–16 ms.`;
  return `- ${label}: stretch 1.383 at **${fmt(cross.t * 1e3, 2)} ms**, pressure **${fmt(cross.p_Pa / 1000, 2)} kPa**, volume ${fmt(cross.V_mL, 1)} mL. **computed.**`;
}

function buildModel(damping: InflateModelIR["controls"]["damping"]): InflateModelIR {
  const base = createInflateAModel();
  return {
    ...base,
    controls: {
      ...base.controls,
      endTime: END_S,
      damping,
    },
  };
}

function main(): void {
  if (createInflateAModel().controls.damping.kind !== "peak-kill") {
    throw new Error("default toy is not peak-kill; measurement must not change the default");
  }

  const killOn = parseToyHistory(
    JSON.parse(readFileSync(resolve(DIAG, "toy-history.json"), "utf8")) as unknown,
  );
  const killOff = parseKillOffA(
    JSON.parse(readFileSync(resolve(DIAG, "kill-off-results.json"), "utf8")) as unknown,
  );
  const golden = parseGolden(
    JSON.parse(readFileSync(resolve(DIAG, "oriented-ismstr2-metrics.json"), "utf8")) as unknown,
  );

  console.log("MEASUREMENT. Not a physics pass. Does not gate.");
  console.log(
    "Golden engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba is pinned only to the OpenCourant copy, not the original OpenRadioss tree.",
  );
  console.log("Solving ported per-second relaxation (as implemented, ~11.9 /s)...");
  const portedResult = solveInflate(buildModel({ kind: "adaptive-period", port: "per-second" }), {
    maxWallMs: 600_000,
    continuePastWarn: true,
  });
  const ported = framesFromSolve(portedResult);
  console.log(`  steps ${String(portedResult.metrics.nSteps)}, applied rate ${String(portedResult.adaptiveOnset.applied?.firstOnRatePerSecond)}`);

  console.log("Solving listing 50.7 /s extra column (what the engine uses, not a proposed setting)...");
  const listingResult = solveInflate(
    buildModel({
      kind: "listing-rate-measurement",
      ratePerSecond: ENGINE_LISTING_FIRST_ON_RATE_PER_S,
    }),
    { maxWallMs: 600_000, continuePastWarn: true },
  );
  const listing = framesFromSolve(listingResult);
  console.log(`  steps ${String(listingResult.metrics.nSteps)}`);

  const rows = MEASUREMENT_TIMES_MS.map((ms) => {
    const t = ms / 1000;
    return {
      t_ms: ms,
      killOn: nearestFrame(killOn, t),
      killOff: nearestFrame(killOff, t),
      ported: nearestFrame(ported, t),
      listing: nearestFrame(listing, t),
      golden: nearestFrame(golden, t),
    };
  });

  let stretchToward = 0;
  let volumeToward = 0;
  let compared = 0;
  for (const row of rows) {
    if (row.ported === null || row.killOff === null || row.golden === null) continue;
    if (row.t_ms === 0) continue;
    const move = movedTowardGolden(row.ported, row.killOff, row.golden);
    compared += 1;
    if (move.stretch) stretchToward += 1;
    if (move.volume) volumeToward += 1;
  }
  const movedToward = stretchToward > compared / 2 || volumeToward > compared / 2;

  const sphere = {
    killOn: sphereCrossing(killOn, SPHERE_LAMBDA_STAR),
    killOff: sphereCrossing(killOff, SPHERE_LAMBDA_STAR),
    ported: sphereCrossing(ported, SPHERE_LAMBDA_STAR),
  };

  const lines: string[] = [
    "# MEASUREMENT: ported 11.9 /s relaxation, 0–16 ms",
    "",
    "MEASUREMENT. Not a physics pass. Does not gate. Default is still the 0.18 peak kill.",
    "",
    "The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.",
    "",
    `Prediction file was committed first at the parent of this measurement. Listing extra column uses ${ENGINE_LISTING_FIRST_ON_RATE_PER_S.toFixed(1)} /s after the copied ${String(ENGINE_LISTING_FIRST_ON_TIME_S * 1e3)} ms onset. That column is **what the engine uses, not a proposed setting**.`,
    "",
    "Each cell is max stretch / volume (mL) / pressure (kPa).",
    "",
    "| t (ms) | kill on (shipped) | kill off | ported ~11.9 /s | listing 50.7 /s (engine uses, not proposed) | golden |",
    "| ---: | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(
      `| ${String(row.t_ms)} | ${cell(row.killOn)} | ${cell(row.killOff)} | ${cell(row.ported)} | ${cell(row.listing)} | ${cell(row.golden)} |`,
    );
  }
  lines.push("");
  lines.push("## Sphere check (analytic 32 kPa at stretch 1.383)");
  lines.push("");
  lines.push(
    "**read from docs:** closed-form peak is about 32 kPa at stretch 1.383. Letter A is not a sphere. Toy pressure is the prescribed ramp, so the crossing time need not carry 32 kPa.",
  );
  lines.push(sphereLine("kill on", sphere.killOn));
  lines.push(sphereLine("kill off", sphere.killOff));
  lines.push(sphereLine("ported 11.9 /s", sphere.ported));
  lines.push("");
  lines.push("## Toward the golden?");
  lines.push("");
  lines.push(
    `Ported vs kill-off, stretch closer to golden on **${String(stretchToward)}/${String(compared)}** loaded frames; volume closer on **${String(volumeToward)}/${String(compared)}**. Moved toward the golden overall: **${movedToward ? "yes" : "no"}**. **computed.**`,
  );
  if (!movedToward) {
    lines.push("");
    lines.push(
      "Stop: weak damping did not move the frames toward the golden. No more damping variants. Next fork is one time-step convergence check (kill off, no relaxation, listing 2 microsecond cap).",
    );
  }
  lines.push("");
  lines.push("Bands were not widened. Default was not changed.");

  const md = `${lines.join("\n")}\n`;
  const payload = {
    kind: "adyrel-measurement",
    measurement: true,
    physicsPass: false,
    gates: false,
    openCourantCommitOnly: "6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba",
    listingOnsetS: ENGINE_LISTING_FIRST_ON_TIME_S,
    listingRatePerSecond: ENGINE_LISTING_FIRST_ON_RATE_PER_S,
    portedAppliedRatePerSecond: portedResult.adaptiveOnset.applied?.firstOnRatePerSecond ?? null,
    movedTowardGolden: movedToward,
    stretchTowardCount: stretchToward,
    volumeTowardCount: volumeToward,
    comparedFrames: compared,
    sphereLambdaStar: SPHERE_LAMBDA_STAR,
    sphere,
    rows,
    defaultUnchanged: "peak-kill-0.18",
  };

  mkdirSync(DIAG, { recursive: true });
  writeFileSync(resolve(DIAG, "adyrel-measurement-results.md"), md);
  writeFileSync(resolve(DIAG, "adyrel-measurement-results.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(md);
  const at16 = rows.find((row) => row.t_ms === 16);
  if (at16?.ported && at16.golden) {
    console.log(`inside 16 ms bands ported vs golden: ${String(insideBands(at16.ported, at16.golden))}`);
  }
}

main();
