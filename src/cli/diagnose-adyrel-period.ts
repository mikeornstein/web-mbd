import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { RAYLEIGH_ALPHA } from "../inflate/constants.js";
import {
  ENGINE_LISTING_FIRST_ON_RATE_PER_S,
  ENGINE_LISTING_FIRST_ON_TIME_S,
  type OnsetSnapshot,
} from "../inflate/adaptivePeriod.js";
import type { InflateModelIR } from "../inflate/types.js";

const REPORT_END_S = 0.0162;

function relDiff(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);
}

function fmt(n: number, digits: number): string {
  return n.toFixed(digits);
}

function fmtOnset(label: string, snap: OnsetSnapshot | null): string {
  if (snap === null) return `${label}: missing`;
  return [
    `${label}:`,
    `  step ${String(snap.step)}`,
    `  physical time ${fmt(snap.t * 1e3, 3)} ms`,
    `  time step ${snap.dt.toExponential(4)} s`,
    `  first-on rate ${fmt(snap.firstOnRatePerSecond, 2)} /s`,
    `  omega per step ${snap.omegaPerStep.toExponential(4)}`,
  ].join("\n");
}

function ratesDifferFromEngine(rate: number): boolean {
  return relDiff(rate, ENGINE_LISTING_FIRST_ON_RATE_PER_S) > 0.1;
}

function buildModel(): InflateModelIR {
  const base = createInflateAModel();
  return {
    ...base,
    controls: {
      ...base.controls,
      endTime: REPORT_END_S,
      damping: { kind: "adaptive-period", port: "per-second" },
    },
  };
}

function main(): void {
  if (createInflateAModel().controls.damping.kind !== "peak-kill") {
    throw new Error("default toy is not peak-kill; this diagnosis must not change the shipped default");
  }

  console.log("Port in this run: per-second with real-time onset (physically faithful).");
  console.log("Per-step 200 toy steps is printed beside it, not applied as the shipped option.");
  console.log(
    `Period is the longest energy-rising time of internal energy or kinetic energy. Clocks and max periods update every step. The rate changes only at first-on, an energy peak, or the 1.1 cutback.`,
  );
  console.log(
    `Copied listing first-on: ${fmt(ENGINE_LISTING_FIRST_ON_TIME_S * 1e3, 2)} ms at about ${fmt(ENGINE_LISTING_FIRST_ON_RATE_PER_S, 1)} /s. That time is copied from the golden listing, not computed from the toy.`,
  );
  console.log(`Deck Rayleigh mass damping: ${String(RAYLEIGH_ALPHA)} /s.`);

  const model = buildModel();
  const result = solveInflate(model, { maxWallMs: 600_000, continuePastWarn: true });
  const onset = result.adaptiveOnset;

  console.log("");
  console.log("Onset clocks (both versions, rates in per second):");
  console.log(fmtOnset("Engine listing (copied)", {
    step: 200,
    t: ENGINE_LISTING_FIRST_ON_TIME_S,
    dt: 1.971e-6,
    firstOnRatePerSecond: ENGINE_LISTING_FIRST_ON_RATE_PER_S,
    omegaPerStep: ENGINE_LISTING_FIRST_ON_RATE_PER_S * 1.971e-6,
  }));
  console.log(fmtOnset("Per-second port (applied)", onset.applied));
  console.log(fmtOnset("Per-step version (200 toy steps, print only)", onset.perStep));
  console.log(fmtOnset("Per-second clock (toy Δt when t first exceeds 2.79 ms)", onset.perSecond));
  console.log(`Rayleigh 80 /s sits next to these. Period source after the run: ${onset.periodFrom}.`);

  console.log("");
  console.log("Samples (chosen per-second port): step, time, Δt, rate /s, omega/step");
  console.log("t_ms\tstep\tdt_s\trate_per_s\tomega\tperiod_from\tvs_rayleigh_80\tvs_engine_51");
  for (const row of result.relaxationHistory) {
    const tms = row.t * 1e3;
    console.log(
      [
        fmt(tms, 3),
        String(row.step),
        row.dt.toExponential(4),
        fmt(row.ratePerSecond, 3),
        row.omegaPerStep.toExponential(4),
        row.periodFrom,
        fmt(row.ratePerSecond / RAYLEIGH_ALPHA, 3) + "×80",
        fmt(row.ratePerSecond / ENGINE_LISTING_FIRST_ON_RATE_PER_S, 3) + "×51",
      ].join("\t"),
    );
  }

  const appliedRate = onset.applied?.firstOnRatePerSecond ?? 0;
  const perStepRate = onset.perStep?.firstOnRatePerSecond ?? 0;
  const perSecondRate = onset.perSecond?.firstOnRatePerSecond ?? 0;
  const vsEngine = ratesDifferFromEngine(appliedRate) || ratesDifferFromEngine(perStepRate) || ratesDifferFromEngine(perSecondRate);
  const vsEachOther = relDiff(perStepRate, perSecondRate) > 0.1 || relDiff(appliedRate, ENGINE_LISTING_FIRST_ON_RATE_PER_S) > 0.1;

  console.log("");
  if (vsEngine || vsEachOther) {
    console.log("STOP. The two versions' rates in per second differ from each other or from the description table (about 51 /s from about 2.8 ms), because of the toy's step size. Not rescaled. Sphere check and default change are not done.");
    console.log(
      JSON.stringify(
        {
          stop: true,
          reason: "onset rate or time differs from the listing table because of the toy step size",
          engineListingRatePerSecond: ENGINE_LISTING_FIRST_ON_RATE_PER_S,
          engineListingOnsetMs: ENGINE_LISTING_FIRST_ON_TIME_S * 1e3,
          rayleighPerSecond: RAYLEIGH_ALPHA,
          applied: onset.applied,
          perStep: onset.perStep,
          perSecond: onset.perSecond,
          periodFrom: onset.periodFrom,
          nSteps: result.metrics.nSteps,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("Rates match the listing table within 10%. Sphere check may proceed.");
  console.log(
    JSON.stringify(
      {
        stop: false,
        applied: onset.applied,
        perStep: onset.perStep,
        perSecond: onset.perSecond,
        periodFrom: onset.periodFrom,
      },
      null,
      2,
    ),
  );
}

main();
