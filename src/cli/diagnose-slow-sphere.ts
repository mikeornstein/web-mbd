import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solveInflate } from "../fe/inflateSolver.js";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { ADYREL_VELOCITY_SCALE, H0, MU } from "../inflate/constants.js";
import {
  LISTING_DT_CAP_S,
  SLOW_SPHERE_RAMP_S,
  SPHERE_LAMBDA_STAR,
  createSlowSphereModel,
  nhSpherePressure,
  orientedEquivalentSphere,
  slowSphereRayleighAlpha,
  sphereBreathingPeriodS,
  sphereCircuitPeriodS,
} from "../inflate/slowSphere.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const STRETCH_YARDSTICK = 0.02;
const PRESSURE_YARDSTICK = 0.05;

export interface SphereSample {
  t: number;
  lambdaMax: number;
  lambdaEq: number;
  p_Pa: number;
  pClosed_Pa: number;
  V_mL: number;
}

function equivalentStretch(volume_m3: number, v0_m3: number): number {
  if (!(volume_m3 > 0) || !(v0_m3 > 0)) return 1;
  return (volume_m3 / v0_m3) ** (1 / 3);
}

function samplesFromSolve(
  result: {
    history: { t: number }[];
    lambdaHistory: number[];
    pressureHistory: number[];
    volumeHistory: number[];
  },
  r0: number,
  v0_m3: number,
): SphereSample[] {
  return result.history.map((h, i) => {
    const lambdaMax = result.lambdaHistory[i] ?? 1;
    const V_m3 = result.volumeHistory[i] ?? 0;
    const lambdaEq = equivalentStretch(V_m3, v0_m3);
    return {
      t: h.t,
      lambdaMax,
      lambdaEq,
      p_Pa: result.pressureHistory[i] ?? 0,
      pClosed_Pa: nhSpherePressure(lambdaEq, MU, H0, r0),
      V_mL: V_m3 * 1e6,
    };
  });
}

function csvText(rows: SphereSample[], label: string): string {
  const lines = [`# ${label}`, "t_s,lambda_eq,lambda_max,p_Pa,p_closed_Pa,V_mL"];
  for (const row of rows) {
    lines.push(
      `${row.t.toExponential(12)},${row.lambdaEq.toExponential(12)},${row.lambdaMax.toExponential(12)},${row.p_Pa.toExponential(12)},${row.pClosed_Pa.toExponential(12)},${row.V_mL.toExponential(12)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function chartSvg(closed: { lam: number; p: number }[], uncapped: SphereSample[], capped: SphereSample[] | null): string {
  const w = 840;
  const h = 520;
  const padL = 70;
  const padR = 24;
  const padT = 28;
  const padB = 52;
  const x0 = 1;
  const x1 = 1.55;
  const y0 = 0;
  const y1 = 40;
  const sx = (lam: number): number => padL + ((lam - x0) / (x1 - x0)) * (w - padL - padR);
  const sy = (kPa: number): number => padT + (1 - (kPa - y0) / (y1 - y0)) * (h - padT - padB);
  const poly = (rows: { lam: number; p: number }[]): string =>
    rows.map((r) => `${sx(r.lam).toFixed(1)},${sy(r.p).toFixed(1)}`).join(" ");
  const closedPts = poly(closed);
  const uncappedPts = poly(uncapped.map((r) => ({ lam: r.lambdaEq, p: r.p_Pa / 1000 })));
  const cappedPts =
    capped === null ? "" : poly(capped.map((r) => ({ lam: r.lambdaEq, p: r.p_Pa / 1000 })));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${w / 2}" y="18" text-anchor="middle" font-size="14" font-family="sans-serif">Slow sphere: pressure against stretch (not a single peak)</text>
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="#333"/>
  <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#333"/>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="12" font-family="sans-serif">equivalent stretch (V/V0)^(1/3)</text>
  <text x="16" y="${h / 2}" text-anchor="middle" font-size="12" font-family="sans-serif" transform="rotate(-90 16 ${h / 2})">pressure (kPa)</text>
  <polyline fill="none" stroke="#1d4ed8" stroke-width="2" points="${closedPts}"/>
  <polyline fill="none" stroke="#b45309" stroke-width="2" stroke-dasharray="6 3" points="${uncappedPts}"/>
  ${cappedPts === "" ? "" : `<polyline fill="none" stroke="#15803d" stroke-width="1.5" stroke-dasharray="2 2" points="${cappedPts}"/>`}
  <text x="${padL + 8}" y="${padT + 16}" font-size="11" font-family="sans-serif" fill="#1d4ed8">closed form</text>
  <text x="${padL + 8}" y="${padT + 32}" font-size="11" font-family="sans-serif" fill="#b45309">slow run (CFL step)</text>
  ${cappedPts === "" ? "" : `<text x="${padL + 8}" y="${padT + 48}" font-size="11" font-family="sans-serif" fill="#15803d">2 μs cap (spot check)</text>`}
</svg>
`;
}

function risingBranchErrors(rows: SphereSample[]): { maxAbsRel: number; maxSignedRel: number; atLambda: number } {
  let maxAbsRel = 0;
  let maxSignedRel = 0;
  let atLambda = 1;
  for (const row of rows) {
    if (row.lambdaEq < 1.02 || row.lambdaEq > SPHERE_LAMBDA_STAR) continue;
    if (row.pClosed_Pa < 1) continue;
    const signed = (row.p_Pa - row.pClosed_Pa) / row.pClosed_Pa;
    const rel = Math.abs(signed);
    if (rel > maxAbsRel) {
      maxAbsRel = rel;
      maxSignedRel = signed;
      atLambda = row.lambdaEq;
    }
  }
  return { maxAbsRel, maxSignedRel, atLambda };
}

function sampleAtOrAfter(rows: SphereSample[], t: number): SphereSample {
  for (const row of rows) {
    if (row.t + 1e-12 >= t) return row;
  }
  const last = rows[rows.length - 1];
  if (last === undefined) throw new Error("no history");
  return last;
}

function main(): void {
  const shipped = createInflateAModel().controls.damping;
  if (shipped.kind !== "peak-kill" || shipped.scale !== ADYREL_VELOCITY_SCALE) {
    throw new Error("shipped default is not 0.18 peak-kill; Part 1 must not change it");
  }

  const sph = orientedEquivalentSphere();
  const Tcirc = sphereCircuitPeriodS(sph.R0_m);
  const Tbreathe = sphereBreathingPeriodS(sph.R0_m);
  const alpha = slowSphereRayleighAlpha(sph.R0_m);
  console.log(
    `SPHERE CHECK. R0=${(sph.R0_m * 1000).toFixed(2)} mm H0=${(sph.H0_m * 1000).toFixed(3)} mm p_max=${(sph.pMax_Pa / 1000).toFixed(2)} kPa at stretch ${SPHERE_LAMBDA_STAR.toFixed(3)}`,
  );
  console.log(
    `period circuit ${ (Tcirc * 1e3).toFixed(2) } ms, breathing ${ (Tbreathe * 1e3).toFixed(2) } ms, ramp 400 ms, Rayleigh ${alpha.toFixed(0)} /s, kill off`,
  );

  const model = createSlowSphereModel();
  const result = solveInflate(model, {
    maxWallMs: 600_000,
    continuePastWarn: true,
    onProgress: ({ t, step, lambdaMax }) => {
      if (step > 0 && step % 2000 === 0) {
        console.log(`  t=${(t * 1e3).toFixed(1)} ms step ${String(step)} max-stretch ${lambdaMax.toFixed(4)}`);
      }
    },
  });
  const v0 = result.volumeHistory[0] ?? sph.V0_m3;
  const rows = samplesFromSolve(result, sph.R0_m, v0);
  const last = rows[rows.length - 1];
  if (last === undefined) throw new Error("no history");
  const top = sampleAtOrAfter(rows, SLOW_SPHERE_RAMP_S);
  const branch = risingBranchErrors(rows);
  const topLamRel = Math.abs(top.lambdaEq - SPHERE_LAMBDA_STAR) / SPHERE_LAMBDA_STAR;
  const topPRel = Math.abs(top.p_Pa - sph.pMax_Pa) / sph.pMax_Pa;
  const follows =
    branch.maxAbsRel <= PRESSURE_YARDSTICK &&
    topLamRel <= STRETCH_YARDSTICK &&
    topPRel <= PRESSURE_YARDSTICK &&
    result.metrics.punchedThrough === false;

  console.log(
    `steps ${String(result.metrics.nSteps)} last λ_eq ${last.lambdaEq.toFixed(4)} λ_max ${last.lambdaMax.toFixed(4)} p ${(last.p_Pa / 1000).toFixed(2)} kPa punched=${String(result.metrics.punchedThrough)}`,
  );
  console.log(
    `rising-branch max |p-p_closed|/p_closed ${(100 * branch.maxAbsRel).toFixed(1)}% (signed ${(100 * branch.maxSignedRel).toFixed(1)}%) at stretch ${branch.atLambda.toFixed(3)}; ramp-end stretch err ${(100 * topLamRel).toFixed(1)}% p err ${(100 * topPRel).toFixed(1)}%`,
  );
  console.log(follows ? "PASS: follows the closed-form curve." : "FAIL: does not land on the closed-form curve. Stop.");

  let cappedRows: SphereSample[] | null = null;
  if (follows) {
    console.log("Spot check at listing 2 microsecond cap.");
    const capModel = createSlowSphereModel({ dtMax: LISTING_DT_CAP_S });
    const capResult = solveInflate(capModel, { maxWallMs: 600_000, continuePastWarn: true });
    const capV0 = capResult.volumeHistory[0] ?? v0;
    cappedRows = samplesFromSolve(capResult, sph.R0_m, capV0);
    const capLast = cappedRows[cappedRows.length - 1];
    if (capLast === undefined) throw new Error("capped: no history");
    console.log(
      `capped steps ${String(capResult.metrics.nSteps)} last λ_eq ${capLast.lambdaEq.toFixed(4)} p ${(capLast.p_Pa / 1000).toFixed(2)} kPa`,
    );
  }

  const closed: { lam: number; p: number }[] = [];
  for (let k = 0; k <= 200; k++) {
    const lam = 1 + (1.55 - 1) * (k / 200);
    closed.push({ lam, p: nhSpherePressure(lam, model.law.mu1, H0, sph.R0_m) / 1000 });
  }

  mkdirSync(DIAG, { recursive: true });
  writeFileSync(resolve(DIAG, "slow-sphere-p-vs-lambda.csv"), csvText(rows, "slow sphere, CFL step, kill off"));
  if (cappedRows !== null) {
    writeFileSync(
      resolve(DIAG, "slow-sphere-dtcap-p-vs-lambda.csv"),
      csvText(cappedRows, "slow sphere, 2 microsecond cap, kill off"),
    );
  }
  writeFileSync(resolve(DIAG, "slow-sphere-p-vs-lambda.svg"), chartSvg(closed, rows, cappedRows));

  const md = [
    "# Slow-load sphere vs closed-form curve",
    "",
    follows
      ? "PASS. The slow run follows the closed-form curve and tops out near the limit."
      : "FAIL. The slow run does not land on the closed-form curve. Solver problem. Stop. Default was not changed.",
    "",
    "The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.",
    "",
    "## Sphere (same one as the 32 kPa number)",
    "",
    `- Wall thickness H₀ = **${(sph.H0_m * 1000).toFixed(3)} mm**. **read from docs.**`,
    `- Rest radius R₀ = **${(sph.R0_m * 1000).toFixed(2)} mm**. **computed** from oriented Letter A rest volume ${(sph.V0_m3 * 1e6).toFixed(1)} mL.`,
    `- Closed-form p(λ\\*) = **${(sph.pMax_Pa / 1000).toFixed(2)} kPa** at stretch **${SPHERE_LAMBDA_STAR.toFixed(3)}**. **computed.** Same as the documented ~32 kPa to the reported digits.`,
    "",
    "## Slow-load device",
    "",
    `- Circuit period 2π R₀ / c = **${(Tcirc * 1e3).toFixed(2)} ms**. **computed.**`,
    `- Breathing-style period 2π R₀ √(ρ/μ) = **${(Tbreathe * 1e3).toFixed(2)} ms**. **computed.**`,
    `- Ramp **400 ms** (72× the longer period), 0 → ${(sph.pMax_Pa / 1000).toFixed(2)} kPa. **guess** in the prediction; used as stated.`,
    `- Velocity kill **off**. Rayleigh mass α = **${alpha.toFixed(0)} per second** on this sphere model only. **computed** as about critical on the longer period. Shipped Letter A stays 80 /s.`,
    "",
    "## Result",
    "",
    `- Last equivalent stretch **${last.lambdaEq.toFixed(4)}**, max-element stretch **${last.lambdaMax.toFixed(4)}**, last pressure **${(last.p_Pa / 1000).toFixed(2)} kPa**, volume **${last.V_mL.toFixed(1)} mL**. **computed.**`,
    `- At ramp end (400 ms): equivalent stretch **${top.lambdaEq.toFixed(4)}**, pressure **${(top.p_Pa / 1000).toFixed(2)} kPa**. **computed.**`,
    `- Rising-branch max |p − p_closed|/p_closed = **${(100 * branch.maxAbsRel).toFixed(1)}%** (signed ${(100 * branch.maxSignedRel).toFixed(1)}%, inertia sits above the static curve when positive) at stretch ${branch.atLambda.toFixed(3)}. **computed.**`,
    `- Ramp-end stretch vs 1.383: **${(100 * topLamRel).toFixed(1)}%**. Ramp-end pressure vs 32.02 kPa: **${(100 * topPRel).toFixed(1)}%**. **computed.**`,
    `- Punched through: **${String(result.metrics.punchedThrough)}**. Steps ${String(result.metrics.nSteps)}.`,
    `- Chart: \`slow-sphere-p-vs-lambda.svg\`. CSV: \`slow-sphere-p-vs-lambda.csv\`.`,
    cappedRows === null
      ? "- 2 μs spot check: **not run** (slow run failed)."
      : "- 2 μs spot check CSV: `slow-sphere-dtcap-p-vs-lambda.csv`.",
    "",
    follows ? "Part 1 passed. Next is Part 2 only if this file still says PASS." : "Stop. Do not go on to Part 2.",
    "",
  ].join("\n");
  writeFileSync(resolve(DIAG, "slow-sphere-results.md"), `${md}\n`);
  writeFileSync(
    resolve(DIAG, "slow-sphere-results.json"),
    `${JSON.stringify(
      {
        kind: "slow-sphere-check",
        follows,
        R0_m: sph.R0_m,
        H0_m: sph.H0_m,
        pMax_Pa: sph.pMax_Pa,
        lambdaStar: SPHERE_LAMBDA_STAR,
        Tcirc_s: Tcirc,
        Tbreathe_s: Tbreathe,
        rayleighAlpha: alpha,
        last,
        top,
        risingBranchMaxAbsRel: branch.maxAbsRel,
        risingBranchMaxSignedRel: branch.maxSignedRel,
        topLamRel,
        topPRel,
        punchedThrough: result.metrics.punchedThrough,
        nSteps: result.metrics.nSteps,
        dtCapRun: cappedRows !== null,
        meshFingerprint: result.metrics.meshFingerprint,
        csvSha256: createHash("sha256").update(csvText(rows, "slow sphere, CFL step, kill off")).digest("hex"),
        defaultUnchanged: "peak-kill-0.18",
        openCourantCommitOnly: "6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba",
      },
      null,
      2,
    )}\n`,
  );
  console.log(md);
  if (!follows) process.exitCode = 1;
}

main();
