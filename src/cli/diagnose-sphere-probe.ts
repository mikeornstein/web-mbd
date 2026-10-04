import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solveInflate } from "../fe/inflateSolver.js";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { ADYREL_VELOCITY_SCALE, H0, MU, RAYLEIGH_ALPHA } from "../inflate/constants.js";
import {
  LISTING_DT_CAP_S,
  SPHERE_HOLD_END_S,
  SPHERE_HOLD_P_PA,
  SPHERE_HOLD_RAMP_S,
  SPHERE_LAMBDA_STAR,
  SPHERE_R0_STATED_M,
  SPHERE_SETTLE_KE_INTERNAL,
  SPHERE_SNAP_FAST_RAMP_S,
  SPHERE_SNAP_HOLD_AFTER_S,
  SPHERE_SNAP_LAMBDA,
  SPHERE_SNAP_P_MAX_PA,
  SPHERE_SNAP_SLOW_RAMP_S,
  createSphereProbeModel,
  invertNhSphereStretch,
  nhSpherePressure,
  orientedEquivalentSphere,
} from "../inflate/slowSphere.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const STRETCH_YARDSTICK = 0.02;
const PRESSURE_YARDSTICK = 0.05;
const MAX_WALL_MS = 1_800_000;

export interface ProbeSample {
  t: number;
  lambdaMax: number;
  lambdaEq: number;
  p_Pa: number;
  pClosed_Pa: number;
  V_mL: number;
  kinetic: number;
  internal: number;
}

function equivalentStretch(volume_m3: number, v0_m3: number): number {
  if (!(volume_m3 > 0) || !(v0_m3 > 0)) return 1;
  return (volume_m3 / v0_m3) ** (1 / 3);
}

function samplesFromSolve(
  result: {
    history: { t: number; kinetic: number; internal: number }[];
    lambdaHistory: number[];
    pressureHistory: number[];
    volumeHistory: number[];
  },
  r0: number,
  v0_m3: number,
): ProbeSample[] {
  return result.history.map((h, i) => {
    const V_m3 = result.volumeHistory[i] ?? 0;
    const lambdaEq = equivalentStretch(V_m3, v0_m3);
    return {
      t: h.t,
      lambdaMax: result.lambdaHistory[i] ?? 1,
      lambdaEq,
      p_Pa: result.pressureHistory[i] ?? 0,
      pClosed_Pa: nhSpherePressure(lambdaEq, MU, H0, r0),
      V_mL: V_m3 * 1e6,
      kinetic: h.kinetic,
      internal: h.internal,
    };
  });
}

function csvText(rows: ProbeSample[], label: string): string {
  const lines = [`# ${label}`, "t_s,lambda_eq,lambda_max,p_Pa,p_closed_Pa,V_mL,kinetic_J,internal_J"];
  for (const row of rows) {
    lines.push(
      `${row.t.toExponential(12)},${row.lambdaEq.toExponential(12)},${row.lambdaMax.toExponential(12)},${row.p_Pa.toExponential(12)},${row.pClosed_Pa.toExponential(12)},${row.V_mL.toExponential(12)},${row.kinetic.toExponential(12)},${row.internal.toExponential(12)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function chartSvg(
  title: string,
  closed: { lam: number; p: number }[],
  rows: ProbeSample[],
  x1: number,
): string {
  const w = 840;
  const h = 520;
  const padL = 70;
  const padR = 24;
  const padT = 28;
  const padB = 52;
  const x0 = 1;
  const y0 = 0;
  const y1 = 40;
  const sx = (lam: number): number => padL + ((lam - x0) / (x1 - x0)) * (w - padL - padR);
  const sy = (kPa: number): number => padT + (1 - (kPa - y0) / (y1 - y0)) * (h - padT - padB);
  const poly = (pts: { lam: number; p: number }[]): string =>
    pts.map((r) => `${sx(r.lam).toFixed(1)},${sy(r.p).toFixed(1)}`).join(" ");
  const runPts = rows
    .filter((r) => r.lambdaEq >= x0 && r.lambdaEq <= x1)
    .map((r) => ({ lam: r.lambdaEq, p: r.p_Pa / 1000 }));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${w / 2}" y="18" text-anchor="middle" font-size="14" font-family="sans-serif">${title}</text>
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="#333"/>
  <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#333"/>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="12" font-family="sans-serif">equivalent stretch (V/V0)^(1/3)</text>
  <text x="16" y="${h / 2}" text-anchor="middle" font-size="12" font-family="sans-serif" transform="rotate(-90 16 ${h / 2})">pressure (kPa)</text>
  <polyline fill="none" stroke="#1d4ed8" stroke-width="2" points="${poly(closed)}"/>
  <polyline fill="none" stroke="#b45309" stroke-width="2" stroke-dasharray="6 3" points="${poly(runPts)}"/>
  <text x="${padL + 8}" y="${padT + 16}" font-size="11" font-family="sans-serif" fill="#1d4ed8">closed form</text>
  <text x="${padL + 8}" y="${padT + 32}" font-size="11" font-family="sans-serif" fill="#b45309">run</text>
</svg>
`;
}

function stretchCrossing(
  rows: ProbeSample[],
  target: number,
): { t: number; lambdaEq: number; p_Pa: number } | null {
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    const loa = a.lambdaEq <= target;
    const lob = b.lambdaEq <= target;
    if (loa === lob) continue;
    const span = b.lambdaEq - a.lambdaEq;
    const w = Math.abs(span) < 1e-18 ? 0 : (target - a.lambdaEq) / span;
    return {
      t: a.t + w * (b.t - a.t),
      lambdaEq: target,
      p_Pa: a.p_Pa + w * (b.p_Pa - a.p_Pa),
    };
  }
  return null;
}

function settledSample(rows: ProbeSample[], tRamp: number): ProbeSample | null {
  for (const row of rows) {
    if (row.t + 1e-12 < tRamp) continue;
    const denom = Math.max(row.internal, 1e-12);
    if (row.kinetic / denom < SPHERE_SETTLE_KE_INTERNAL) return row;
  }
  return null;
}

interface ProbeSpec {
  id: string;
  title: string;
  kind: "snap" | "hold";
  tRamp: number;
  pMax: number;
  endTime: number;
  dtMax?: number;
  x1: number;
}

function runProbe(spec: ProbeSpec, r0: number): {
  rows: ProbeSample[];
  nSteps: number;
  punchedThrough: boolean;
  last: ProbeSample;
  snap: { t: number; lambdaEq: number; p_Pa: number } | null;
  settled: ProbeSample | null;
} {
  const model = createSphereProbeModel({
    pMax: spec.pMax,
    tRamp: spec.tRamp,
    endTime: spec.endTime,
    rayleighAlpha: RAYLEIGH_ALPHA,
    ...(spec.dtMax !== undefined ? { dtMax: spec.dtMax } : {}),
  });
  console.log(`RUN ${spec.id} ramp ${spec.tRamp} s to ${(spec.pMax / 1000).toFixed(2)} kPa dtMax=${spec.dtMax === undefined ? "CFL" : spec.dtMax.toExponential(3)}`);
  const result = solveInflate(model, {
    maxWallMs: MAX_WALL_MS,
    continuePastWarn: true,
    onProgress: ({ t, step, lambdaMax }) => {
      if (step > 0 && step % 4000 === 0) {
        console.log(`  ${spec.id} t=${(t * 1e3).toFixed(1)} ms step ${String(step)} max-stretch ${lambdaMax.toFixed(4)}`);
      }
    },
  });
  const v0 = result.volumeHistory[0] ?? 0;
  const rows = samplesFromSolve(result, r0, v0);
  const last = rows[rows.length - 1];
  if (last === undefined) throw new Error(`${spec.id}: no history`);
  console.log(
    `  steps ${String(result.metrics.nSteps)} last λ_eq ${last.lambdaEq.toFixed(4)} p ${(last.p_Pa / 1000).toFixed(2)} kPa punched=${String(result.metrics.punchedThrough)}`,
  );
  return {
    rows,
    nSteps: result.metrics.nSteps,
    punchedThrough: result.metrics.punchedThrough,
    last,
    snap: spec.kind === "snap" ? stretchCrossing(rows, SPHERE_SNAP_LAMBDA) : null,
    settled: spec.kind === "hold" ? settledSample(rows, spec.tRamp) : null,
  };
}

function main(): void {
  const shipped = createInflateAModel().controls.damping;
  if (shipped.kind !== "peak-kill" || shipped.scale !== ADYREL_VELOCITY_SCALE) {
    throw new Error("shipped default is not 0.18 peak-kill; this probe must not change it");
  }

  const sph = orientedEquivalentSphere();
  const pStarStated = nhSpherePressure(SPHERE_LAMBDA_STAR, MU, H0, SPHERE_R0_STATED_M);
  const lam28 = invertNhSphereStretch(SPHERE_HOLD_P_PA, MU, H0, SPHERE_R0_STATED_M);
  const p1318 = nhSpherePressure(1.318, MU, H0, SPHERE_R0_STATED_M);
  const p1340 = nhSpherePressure(1.34, MU, H0, SPHERE_R0_STATED_M);
  console.log(
    `CLOSED FORM. R0=46.48 mm p_max=${(pStarStated / 1000).toFixed(3)} kPa λ(28 kPa)=${lam28.toFixed(5)} p(1.318)/p_max=${(100 * p1318 / pStarStated).toFixed(2)}% p(1.340)/p_max=${(100 * p1340 / pStarStated).toFixed(2)}%`,
  );
  console.log(
    `PROBE. mesh R0=${(sph.R0_m * 1000).toFixed(2)} mm Rayleigh ${RAYLEIGH_ALPHA} /s kill off. Snap = ramp p at equivalent stretch ${SPHERE_SNAP_LAMBDA.toFixed(2)}.`,
  );

  const closedSnap: { lam: number; p: number }[] = [];
  const closedHold: { lam: number; p: number }[] = [];
  for (let k = 0; k <= 200; k++) {
    const lamSnap = 1 + (1.8 - 1) * (k / 200);
    closedSnap.push({ lam: lamSnap, p: nhSpherePressure(lamSnap, MU, H0, SPHERE_R0_STATED_M) / 1000 });
    const lamHold = 1 + (1.4 - 1) * (k / 200);
    closedHold.push({ lam: lamHold, p: nhSpherePressure(lamHold, MU, H0, SPHERE_R0_STATED_M) / 1000 });
  }

  const specs: ProbeSpec[] = [
    {
      id: "snap-fast",
      title: "Snap-through, faster ramp (400 ms to 36 kPa)",
      kind: "snap",
      tRamp: SPHERE_SNAP_FAST_RAMP_S,
      pMax: SPHERE_SNAP_P_MAX_PA,
      endTime: SPHERE_SNAP_FAST_RAMP_S + SPHERE_SNAP_HOLD_AFTER_S,
      x1: 1.8,
    },
    {
      id: "snap-slow",
      title: "Snap-through, slower ramp (800 ms to 36 kPa)",
      kind: "snap",
      tRamp: SPHERE_SNAP_SLOW_RAMP_S,
      pMax: SPHERE_SNAP_P_MAX_PA,
      endTime: SPHERE_SNAP_SLOW_RAMP_S + SPHERE_SNAP_HOLD_AFTER_S,
      x1: 1.8,
    },
    {
      id: "hold-28",
      title: "Hold at 28 kPa",
      kind: "hold",
      tRamp: SPHERE_HOLD_RAMP_S,
      pMax: SPHERE_HOLD_P_PA,
      endTime: SPHERE_HOLD_END_S,
      x1: 1.4,
    },
    {
      id: "snap-fast-dtcap",
      title: "Snap-through, faster ramp, 2 μs cap",
      kind: "snap",
      tRamp: SPHERE_SNAP_FAST_RAMP_S,
      pMax: SPHERE_SNAP_P_MAX_PA,
      endTime: SPHERE_SNAP_FAST_RAMP_S + SPHERE_SNAP_HOLD_AFTER_S,
      dtMax: LISTING_DT_CAP_S,
      x1: 1.8,
    },
    {
      id: "snap-slow-dtcap",
      title: "Snap-through, slower ramp, 2 μs cap",
      kind: "snap",
      tRamp: SPHERE_SNAP_SLOW_RAMP_S,
      pMax: SPHERE_SNAP_P_MAX_PA,
      endTime: SPHERE_SNAP_SLOW_RAMP_S + SPHERE_SNAP_HOLD_AFTER_S,
      dtMax: LISTING_DT_CAP_S,
      x1: 1.8,
    },
    {
      id: "hold-28-dtcap",
      title: "Hold at 28 kPa, 2 μs cap",
      kind: "hold",
      tRamp: SPHERE_HOLD_RAMP_S,
      pMax: SPHERE_HOLD_P_PA,
      endTime: SPHERE_HOLD_END_S,
      dtMax: LISTING_DT_CAP_S,
      x1: 1.4,
    },
  ];

  mkdirSync(DIAG, { recursive: true });
  const out: Record<string, ReturnType<typeof runProbe>> = {};
  for (const spec of specs) {
    const got = runProbe(spec, sph.R0_m);
    out[spec.id] = got;
    const closed = spec.kind === "snap" ? closedSnap : closedHold;
    writeFileSync(resolve(DIAG, `sphere-probe-${spec.id}.csv`), csvText(got.rows, spec.title));
    writeFileSync(
      resolve(DIAG, `sphere-probe-${spec.id}.svg`),
      chartSvg(spec.title, closed, got.rows, spec.x1),
    );
  }

  const fast = out["snap-fast"];
  const slow = out["snap-slow"];
  const hold = out["hold-28"];
  const fastCap = out["snap-fast-dtcap"];
  const slowCap = out["snap-slow-dtcap"];
  const holdCap = out["hold-28-dtcap"];
  if (!fast || !slow || !hold || !fastCap || !slowCap || !holdCap) {
    throw new Error("missing probe run");
  }

  const pLimit = 32.02e3;
  const slowSnapP = slow.snap?.p_Pa ?? null;
  const fastSnapP = fast.snap?.p_Pa ?? null;
  const slowRel = slowSnapP === null ? null : Math.abs(slowSnapP - pLimit) / pLimit;
  const slowPass = slowRel !== null && slowRel <= PRESSURE_YARDSTICK;
  const fellToward =
    fastSnapP !== null && slowSnapP !== null && slowSnapP < fastSnapP && slowSnapP > pLimit;
  const holdLam = hold.settled?.lambdaEq ?? null;
  const holdRel = holdLam === null ? null : Math.abs(holdLam - lam28) / lam28;
  const holdPass = holdRel !== null && holdRel <= STRETCH_YARDSTICK;
  const slowCapRel = slowCap.snap === null ? null : Math.abs(slowCap.snap.p_Pa - pLimit) / pLimit;
  const slowCapPass = slowCapRel !== null && slowCapRel <= PRESSURE_YARDSTICK;
  const holdCapLam = holdCap.settled?.lambdaEq ?? null;
  const holdCapRel = holdCapLam === null ? null : Math.abs(holdCapLam - lam28) / lam28;
  const holdCapPass = holdCapRel !== null && holdCapRel <= STRETCH_YARDSTICK;

  const anyMiss = !slowPass || !holdPass || !slowCapPass || !holdCapPass;

  function kPa(p: number | null): string {
    return p === null ? "no snap crossing" : `${(p / 1000).toFixed(2)} kPa`;
  }
  function pct(rel: number | null): string {
    return rel === null ? "—" : `${(100 * rel).toFixed(1)}%`;
  }

  const md = [
    "# Sphere snap-through and 28 kPa hold",
    "",
    anyMiss
      ? "MISS on at least one bar. Default was not changed. Stop."
      : "PASS on the slower-ramp snap bar and the 28 kPa stretch bar, including the 2 μs repeats. Default was not changed.",
    "",
    "Part 1 stays as recorded: rising branch PASS (0.9%), limit-point stretch MISS (4.7%). Those files were not edited.",
    "",
    "The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.",
    "",
    "## Closed form (**computed** before the run, restated)",
    "",
    `- λ(28 kPa) = **${lam28.toFixed(5)}**. Chiron ~1.19 was not copied.`,
    `- p(1.318)/p_max = **${(100 * p1318 / pStarStated).toFixed(2)}%**. p(1.340)/p_max = **${(100 * p1340 / pStarStated).toFixed(2)}%**. Agree with 99.0% and 99.6%.`,
    `- Damping: kill off, Rayleigh **${RAYLEIGH_ALPHA} per second**. **read from docs.**`,
    `- Snap event: prescribed pressure when equivalent stretch first crosses **${SPHERE_SNAP_LAMBDA.toFixed(2)}**.`,
    "",
    "## 1. Snap-through pressure",
    "",
    `- Faster ramp (400 ms): **${kPa(fastSnapP)}** at t=${fast.snap === null ? "—" : `${(fast.snap.t * 1e3).toFixed(2)} ms`}. **computed.**`,
    `- Slower ramp (800 ms): **${kPa(slowSnapP)}** at t=${slow.snap === null ? "—" : `${(slow.snap.t * 1e3).toFixed(2)} ms`}. **computed.**`,
    `- Slower vs 32.02 kPa: **${pct(slowRel)}** (bar 5%, slower ramp only). **${slowPass ? "PASS" : "MISS"}.**`,
    `- Direction: ${
      fastSnapP === null || slowSnapP === null
        ? "cannot say (a snap crossing is missing)."
        : slowSnapP < fastSnapP
          ? `fell toward 32 kPa as the ramp slowed (${(fastSnapP / 1000).toFixed(2)} → ${(slowSnapP / 1000).toFixed(2)} kPa).`
          : `did not fall (${(fastSnapP / 1000).toFixed(2)} → ${(slowSnapP / 1000).toFixed(2)} kPa).`
    } ${fellToward ? "Matches Chiron’s expected direction." : ""}`.trim(),
    "",
    "## 2. Settled stretch at 28 kPa",
    "",
    hold.settled === null
      ? "- Did **not** settle (kinetic/internal never below 0.001 after the ramp). **MISS.**"
      : `- Settled equivalent stretch **${hold.settled.lambdaEq.toFixed(5)}** at t=${(hold.settled.t * 1e3).toFixed(1)} ms, p=${(hold.settled.p_Pa / 1000).toFixed(2)} kPa, ke/internal=${(hold.settled.kinetic / Math.max(hold.settled.internal, 1e-12)).toExponential(2)}. **computed.**`,
    `- Closed-form stable stretch **${lam28.toFixed(5)}**. Rel err **${pct(holdRel)}** (bar 2%). **${holdPass ? "PASS" : "MISS"}.**`,
    "",
    "## 5. 2 μs cap repeats",
    "",
    `- Faster snap: **${kPa(fastCap.snap?.p_Pa ?? null)}**.`,
    `- Slower snap vs 32.02 kPa: **${pct(slowCapRel)}**. **${slowCapPass ? "PASS" : "MISS"}.**`,
    holdCap.settled === null
      ? "- 28 kPa hold did **not** settle. **MISS.**"
      : `- 28 kPa settled stretch **${holdCap.settled.lambdaEq.toFixed(5)}**, rel err **${pct(holdCapRel)}**. **${holdCapPass ? "PASS" : "MISS"}.**`,
    "",
    "Charts and CSVs: `sphere-probe-*.svg` / `sphere-probe-*.csv`.",
    "",
    "Do not make kill-off the default. Do not write the every-frame test.",
    "",
  ].join("\n");

  writeFileSync(resolve(DIAG, "sphere-probe-results.md"), `${md}\n`);
  writeFileSync(
    resolve(DIAG, "sphere-probe-results.json"),
    `${JSON.stringify(
      {
        kind: "sphere-probe",
        lam28,
        pStarStated_Pa: pStarStated,
        p1318_frac: p1318 / pStarStated,
        p1340_frac: p1340 / pStarStated,
        rayleighAlpha: RAYLEIGH_ALPHA,
        snapLambda: SPHERE_SNAP_LAMBDA,
        fastSnapP_Pa: fastSnapP,
        slowSnapP_Pa: slowSnapP,
        slowRel,
        slowPass,
        fellToward,
        holdLam,
        holdRel,
        holdPass,
        slowCapSnapP_Pa: slowCap.snap?.p_Pa ?? null,
        slowCapRel,
        slowCapPass,
        holdCapLam,
        holdCapRel,
        holdCapPass,
        anyMiss,
        defaultUnchanged: "peak-kill-0.18",
        openCourantCommitOnly: "6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba",
        csvSha256: createHash("sha256").update(csvText(slow.rows, "snap-slow")).digest("hex"),
      },
      null,
      2,
    )}\n`,
  );
  console.log(md);
  if (anyMiss) process.exitCode = 1;
}

main();
