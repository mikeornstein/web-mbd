import type { InflateLawCard, InflateSolveMetrics, RadiossInflateGolden } from "../inflate/types.js";
import {
  deckSpreadAt,
  EVERY_FRAME_MS,
  INFLATE_GATING_BAR,
  INFLATE_OLD_STRETCH_BAR,
  TRIANGLE_DECK_NAME,
} from "./survivingDecks.js";

export { INFLATE_GATING_BAR, INFLATE_OLD_STRETCH_BAR } from "./survivingDecks.js";

export const INFLATE_BANDS = {
  lambdaRel: 0.02,
  volumeRel: 0.05,
  pressureRel: 0.05,
} as const;

function relErr(ours: number, gold: number): number {
  return Math.abs(ours - gold) / Math.max(Math.abs(gold), 1e-30);
}

function sameNumber(a: number, b: number): boolean {
  return Object.is(a, b) || Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b), 1);
}

export function lawCardsEqual(
  a: InflateLawCard,
  b: InflateLawCard,
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const keys: (keyof InflateLawCard)[] = [
    "mu1",
    "alpha1",
    "muOthers",
    "nu",
    "pronyM",
    "iform",
    "h0",
    "rho",
    "gapMin",
    "warnLam",
    "ishell",
    "ismstr",
    "ithick",
    "loadFamily",
    "pMax",
    "tRamp",
    "rayleighAlpha",
  ];
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") {
      if (!sameNumber(av, bv)) mismatches.push(`${key}: ${String(av)} ≠ ${String(bv)}`);
    } else if (av !== bv) {
      mismatches.push(`${key}: ${String(av)} ≠ ${String(bv)}`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export interface InflateToySample {
  t: number;
  lambdaMax: number;
  volume_mL: number;
  p: number;
}

/** Half an animation stride plus slack; samples sit near 2 ms. */
const MATCH_WINDOW_S = 0.0015;

export function nearestToySample(
  samples: readonly InflateToySample[],
  t: number,
): InflateToySample | null {
  if (samples.length === 0) return null;
  let best = samples[0]!;
  let bestDt = Math.abs(best.t - t);
  for (let i = 1; i < samples.length; i++) {
    const row = samples[i]!;
    const dt = Math.abs(row.t - t);
    if (dt < bestDt) {
      best = row;
      bestDt = dt;
    }
  }
  if (bestDt > MATCH_WINDOW_S) return null;
  return best;
}

export function toySamplesFromSolve(result: {
  history: { t: number }[];
  lambdaHistory: number[];
  volumeHistory: number[];
  pressureHistory: number[];
}): InflateToySample[] {
  const n = result.history.length;
  if (
    result.lambdaHistory.length !== n ||
    result.volumeHistory.length !== n ||
    result.pressureHistory.length !== n
  ) {
    throw new Error("inflate history lengths do not match");
  }
  const out: InflateToySample[] = [];
  for (let i = 0; i < n; i++) {
    const lam = result.lambdaHistory[i];
    const vol = result.volumeHistory[i];
    const p = result.pressureHistory[i];
    const h = result.history[i];
    if (lam === undefined || vol === undefined || p === undefined || h === undefined) {
      throw new Error(`inflate history hole at ${String(i)}`);
    }
    out.push({ t: h.t, lambdaMax: lam, volume_mL: vol * 1e6, p });
  }
  return out;
}

export interface InflateFrameCompare {
  t_ms: number;
  toyLambda: number | null;
  goldenLambda: number;
  deckMin: number;
  deckMax: number;
  triangleLambda: number | null;
  triangleNote: string | null;
  lambdaRelGolden: number | null;
  oldBarInside: boolean | null;
  themisInside: boolean | null;
  volumeRelGolden: number | null;
  pressureRelGolden: number | null;
  volumeInside: boolean | null;
  pressureInside: boolean | null;
  deckInterpolated: boolean;
  belowFloorRel: number | null;
  floorName: string | null;
}

export interface InflateCompareResult {
  ok: boolean;
  reasons: string[];
  lawEqual: boolean;
  loadFamilyEqual: boolean;
  meshEqual: boolean;
  psiNonNegative: boolean;
  lambdaRelError: number | null;
  volumeRelError: number | null;
  pressureRelError: number | null;
  bands: typeof INFLATE_BANDS;
  gatingBar: typeof INFLATE_GATING_BAR;
  frames: InflateFrameCompare[];
  themisOk: boolean;
  oldBarOk: boolean;
}

export interface InflateCompareToy {
  warn: InflateSolveMetrics["warn"];
  loadFamily: InflateSolveMetrics["loadFamily"];
  meshFingerprint: InflateSolveMetrics["meshFingerprint"];
  punchedThrough: InflateSolveMetrics["punchedThrough"];
  psi_J: InflateSolveMetrics["psi_J"];
  law: InflateLawCard;
  samples: readonly InflateToySample[];
}

function compareFrame(
  t_ms: number,
  samples: readonly InflateToySample[],
  loadFamilyEqual: boolean,
): InflateFrameCompare {
  const spread = deckSpreadAt(t_ms);
  const toy = nearestToySample(samples, t_ms / 1000);
  if (toy === null) {
    return {
      t_ms,
      toyLambda: null,
      goldenLambda: spread.golden.lambdaMax,
      deckMin: spread.min,
      deckMax: spread.max,
      triangleLambda: spread.triangle?.lambdaMax ?? null,
      triangleNote: spread.triangleNote,
      lambdaRelGolden: null,
      oldBarInside: null,
      themisInside: null,
      volumeRelGolden: null,
      pressureRelGolden: null,
      volumeInside: null,
      pressureInside: null,
      deckInterpolated: spread.interpolated,
      belowFloorRel: null,
      floorName: null,
    };
  }
  const lambdaRelGolden = relErr(toy.lambdaMax, spread.golden.lambdaMax);
  const volumeRelGolden = relErr(toy.volume_mL, spread.golden.volume_mL);
  const pressureRelGolden = relErr(toy.p, spread.golden.p_Pa);
  const themisInside = toy.lambdaMax >= spread.min && toy.lambdaMax <= spread.max;
  const oldBarInside = lambdaRelGolden <= INFLATE_BANDS.lambdaRel;
  const volumeInside = volumeRelGolden <= INFLATE_BANDS.volumeRel;
  const pressureInside = !loadFamilyEqual || pressureRelGolden <= INFLATE_BANDS.pressureRel;
  const belowFloorRel =
    toy.lambdaMax < spread.min ? (spread.min - toy.lambdaMax) / spread.min : null;
  let floorName: string | null = null;
  for (const member of spread.members) {
    if (member.lambdaMax === spread.min) {
      floorName = member.name;
      break;
    }
  }
  return {
    t_ms,
    toyLambda: toy.lambdaMax,
    goldenLambda: spread.golden.lambdaMax,
    deckMin: spread.min,
    deckMax: spread.max,
    triangleLambda: spread.triangle?.lambdaMax ?? null,
    triangleNote: spread.triangleNote,
    lambdaRelGolden,
    oldBarInside,
    themisInside,
    volumeRelGolden,
    pressureRelGolden,
    volumeInside,
    pressureInside,
    deckInterpolated: spread.interpolated,
    belowFloorRel,
    floorName,
  };
}

/**
 * Themis tooling gate: PASS iff toy stretch at every 2 ms from 0 to 16 ms sits
 * inside the surviving-deck min–max (golden four-node + Ishell 24 ismstr 2 +
 * fine re-oriented + triangle `/SH3N` up to ~11.5 ms), and volume / pressure
 * stay within 5% of the golden tape. The old 2% of golden-max stretch bar is
 * printed, not the gate.
 */
export function compareInflateToGolden(
  toy: InflateCompareToy,
  golden: RadiossInflateGolden,
): InflateCompareResult {
  const reasons: string[] = [];
  const law = lawCardsEqual(toy.law, golden.law);
  if (!law.ok) {
    reasons.push(`law-card mismatch: ${law.mismatches.join("; ")}`);
  }
  const loadFamilyEqual = toy.loadFamily === golden.loadFamily && toy.law.loadFamily === golden.loadFamily;
  if (!loadFamilyEqual) {
    reasons.push(
      `load family ${toy.loadFamily} ≠ golden ${golden.loadFamily} (unlabeled swap is a FAIL; do not retune μ)`,
    );
  }
  const meshEqual =
    toy.meshFingerprint === golden.mesh.fingerprint &&
    golden.mesh.nShellQuads === golden.mesh.NUMELC &&
    golden.mesh.NUMELTG === 0;
  if (toy.meshFingerprint !== golden.mesh.fingerprint) {
    reasons.push(`mesh fingerprint ${toy.meshFingerprint} ≠ ${golden.mesh.fingerprint}`);
  }
  if (golden.mesh.NUMELTG !== 0 || golden.mesh.NUMELC !== golden.mesh.nShellQuads) {
    reasons.push("golden mesh is not the quad-only NUMELC ship family");
  }
  if (toy.punchedThrough) reasons.push("punch-through / empty or exploded V");
  const psiToy = toy.warn?.psi_J ?? toy.psi_J;
  const psiNonNegative = psiToy >= 0 && golden.warn.psi_J >= 0;
  if (!psiNonNegative) reasons.push(`Ψ sign fail (toy ${psiToy}, golden ${golden.warn.psi_J})`);
  if (toy.warn === null) {
    reasons.push("λ never crossed WARN_LAM=2");
  }

  const frames: InflateFrameCompare[] = [];
  for (const t_ms of EVERY_FRAME_MS) {
    frames.push(compareFrame(t_ms, toy.samples, loadFamilyEqual));
  }

  let themisOk = true;
  let oldBarOk = true;
  for (const row of frames) {
    if (row.toyLambda === null || row.themisInside === null) {
      themisOk = false;
      reasons.push(
        `t=${String(row.t_ms)} ms: missing toy sample (Themis ${INFLATE_GATING_BAR} needs every 2 ms from 0 to 16 ms)`,
      );
      oldBarOk = false;
      continue;
    }
    if (!row.themisInside) {
      themisOk = false;
      reasons.push(
        `t=${String(row.t_ms)} ms: toy stretch ${row.toyLambda.toFixed(4)} outside Themis deck spread [${row.deckMin.toFixed(4)}, ${row.deckMax.toFixed(4)}]${row.deckInterpolated ? " (deck min/max interpolated)" : ""}`,
      );
    }
    if (row.oldBarInside !== true) oldBarOk = false;
    if (row.volumeInside !== true) {
      themisOk = false;
      oldBarOk = false;
      const pct = row.volumeRelGolden === null ? "n/a" : `${(100 * row.volumeRelGolden).toFixed(2)}%`;
      reasons.push(`t=${String(row.t_ms)} ms: V rel ${pct} > ${100 * INFLATE_BANDS.volumeRel}%`);
    }
    if (row.pressureInside !== true) {
      themisOk = false;
      oldBarOk = false;
      const pct = row.pressureRelGolden === null ? "n/a" : `${(100 * row.pressureRelGolden).toFixed(2)}%`;
      reasons.push(`t=${String(row.t_ms)} ms: p rel ${pct} > ${100 * INFLATE_BANDS.pressureRel}%`);
    }
  }

  let lambdaRelError: number | null = null;
  let volumeRelError: number | null = null;
  let pressureRelError: number | null = null;
  if (toy.warn !== null) {
    lambdaRelError = relErr(toy.warn.lambdaMax, golden.warn.lambdaMax);
    volumeRelError = relErr(toy.warn.volume_mL, golden.warn.volume_mL);
    pressureRelError = relErr(toy.warn.p, golden.warn.p);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    lawEqual: law.ok,
    loadFamilyEqual,
    meshEqual,
    psiNonNegative,
    lambdaRelError,
    volumeRelError,
    pressureRelError,
    bands: INFLATE_BANDS,
    gatingBar: INFLATE_GATING_BAR,
    frames,
    themisOk,
    oldBarOk,
  };
}

/**
 * Locked shipped freeze on kill-off Letter A (oriented mesh). Not a physics
 * pass. Digits from the committed kill-off tape; live factory must match.
 */
export const SHIPPED_KILL_OFF_FREEZE = {
  frame: 8,
  lambdaMax: 2.105201010510652,
  volume_mL: 866.0832041483628,
} as const;

export function diagnosisMissMatchesLock(
  cmp: InflateCompareResult,
  golden: RadiossInflateGolden,
  warn: InflateSolveMetrics["warn"],
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (golden.bands.lambdaRel !== 0.02 || cmp.bands.lambdaRel !== 0.02) {
    reasons.push("λ band is not the locked 2% (do not widen)");
  }
  if (golden.bands.volumeRel !== 0.05 || cmp.bands.volumeRel !== 0.05) {
    reasons.push("V band is not the locked 5% (do not widen)");
  }
  if (golden.bands.pressureRel !== 0.05 || cmp.bands.pressureRel !== 0.05) {
    reasons.push("p band is not the locked 5% (do not widen)");
  }
  if (cmp.gatingBar !== INFLATE_GATING_BAR) {
    reasons.push(`gating bar is ${cmp.gatingBar}, not ${INFLATE_GATING_BAR}`);
  }
  if (!cmp.lawEqual) reasons.push("law-card drifted; μ/load law must stay locked");
  if (cmp.ok) {
    reasons.push("compare became a PASS; that is not a diagnosis lock (do not widen bands)");
  }
  if (cmp.themisOk) {
    reasons.push("Themis deck-spread bar became a PASS; that is not the locked miss");
  }
  if (warn === null) {
    reasons.push("toy never crossed WARN_LAM");
  } else {
    if (warn.frame !== SHIPPED_KILL_OFF_FREEZE.frame) {
      reasons.push(`toy warn frame ${warn.frame} ≠ locked freeze frame ${SHIPPED_KILL_OFF_FREEZE.frame}`);
    }
    if (!Object.is(warn.lambdaMax, SHIPPED_KILL_OFF_FREEZE.lambdaMax)) {
      reasons.push(`toy warn λ ${warn.lambdaMax} ≠ locked freeze ${SHIPPED_KILL_OFF_FREEZE.lambdaMax}`);
    }
    if (!Object.is(warn.volume_mL, SHIPPED_KILL_OFF_FREEZE.volume_mL)) {
      reasons.push(`toy warn V ${warn.volume_mL} ≠ locked freeze ${SHIPPED_KILL_OFF_FREEZE.volume_mL}`);
    }
  }
  const themisMiss = cmp.reasons.some((r) => r.includes("Themis deck spread"));
  if (!themisMiss) {
    reasons.push("compare reasons do not name the Themis deck-spread miss");
  }
  return { ok: reasons.length === 0, reasons };
}

function pct(v: number | null): string {
  return v === null ? "n/a" : `${(100 * v).toFixed(3)}%`;
}

function mark(inside: boolean | null): string {
  if (inside === null) return "missing";
  return inside ? "inside" : "outside";
}

/** Exact 16 ms table sentence. Do not paraphrase. */
export const SIXTEEN_MS_SPREAD_NOTE =
  "a miss of the edge of the spread, within the old 2% bar and well inside the roughly 5% disagreement between decks; not waved through";

/** Themis’s reading of the re-score. Printed for comparison; the code’s tally is the score. */
export const THEMIS_TALLY_READING =
  "2, 6 and 8 ms inside, 4 ms about 4.5% below the triangle deck, 10 to 16 ms outside";

function floorLabel(row: InflateFrameCompare): string {
  if (row.floorName === TRIANGLE_DECK_NAME) return "the triangle deck";
  if (row.floorName !== null) return row.floorName;
  return "the spread floor";
}

export function formatThemisTally(result: InflateCompareResult): string {
  const lines: string[] = ["tally per frame:"];
  const insideMs: number[] = [];
  const outsideMs: number[] = [];
  for (const row of result.frames) {
    if (row.themisInside === true) {
      insideMs.push(row.t_ms);
      const interp = row.deckInterpolated ? " (deck min/max interpolated)" : "";
      lines.push(`  ${String(row.t_ms)} ms: inside${interp}`);
      continue;
    }
    outsideMs.push(row.t_ms);
    const bits: string[] = [];
    if (row.belowFloorRel !== null) {
      bits.push(`${(100 * row.belowFloorRel).toFixed(2)}% below ${floorLabel(row)}`);
    }
    if (row.deckInterpolated) bits.push("deck min/max interpolated");
    if (row.t_ms === 16) bits.push(SIXTEEN_MS_SPREAD_NOTE);
    const extra = bits.length > 0 ? ` (${bits.join("; ")})` : "";
    lines.push(`  ${String(row.t_ms)} ms: outside${extra}`);
  }
  lines.push(
    `tally total: ${String(insideMs.length)} inside, ${String(outsideMs.length)} outside of ${String(result.frames.length)} frames`,
  );
  lines.push(`Themis reading (not the score): ${THEMIS_TALLY_READING}`);
  const wantInside = [2, 6, 8];
  const wantOutside = [4, 10, 12, 14, 16];
  const insideMatch = wantInside.every((t) => insideMs.includes(t));
  const outsideMatch = wantOutside.every((t) => outsideMs.includes(t));
  const at4 = result.frames.find((row) => row.t_ms === 4);
  const at4Pct =
    at4?.belowFloorRel === null || at4?.belowFloorRel === undefined
      ? "n/a"
      : `${(100 * at4.belowFloorRel).toFixed(2)}%`;
  const at4Floor = at4 === undefined ? "n/a" : floorLabel(at4);
  if (insideMatch && outsideMatch) {
    lines.push(
      `Difference from Themis reading: inside/outside match at 2–16 ms. 4 ms is ${at4Pct} below ${at4Floor} (she said about 4.5%). 0 ms is inside (she did not mention 0).`,
    );
  } else {
    lines.push(
      `Difference from Themis reading: code inside [${insideMs.join(", ")}] ms; code outside [${outsideMs.join(", ")}] ms; 4 ms is ${at4Pct} below ${at4Floor}.`,
    );
  }
  return lines.join("\n");
}

export function formatEveryFrameTable(result: InflateCompareResult): string {
  const lines = [
    `gating bar: ${result.gatingBar}`,
    `old stretch bar: ${INFLATE_OLD_STRETCH_BAR} (printed, not the gate)`,
    "triangle `/SH3N` in the gating spread up to ~11.5 ms (last snapshot 8 ms; 6 ms interpolated)",
    "t_ms | toy λ | golden λ | deck min–max | Δλ golden | old 2% | Themis | ΔV | Δp | triangle λ",
  ];
  for (const row of result.frames) {
    const toy = row.toyLambda === null ? "missing" : row.toyLambda.toFixed(4);
    const tri = row.triangleLambda === null ? "—" : row.triangleLambda.toFixed(4);
    const interp = row.deckInterpolated ? " interp" : "";
    lines.push(
      `${String(row.t_ms)} | ${toy} | ${row.goldenLambda.toFixed(4)} | ${row.deckMin.toFixed(4)}–${row.deckMax.toFixed(4)}${interp} | ${pct(row.lambdaRelGolden)} | ${mark(row.oldBarInside)} | ${mark(row.themisInside)} | ${pct(row.volumeRelGolden)} | ${pct(row.pressureRelGolden)} | ${tri}`,
    );
    if (row.t_ms === 16) {
      lines.push(`    16 ms: ${SIXTEEN_MS_SPREAD_NOTE}`);
    }
    if (row.triangleNote !== null) {
      lines.push(`    triangle: ${row.triangleNote}`);
    }
  }
  lines.push(formatThemisTally(result));
  return lines.join("\n");
}

export function formatInflateCompare(result: InflateCompareResult): string {
  const lines = [
    result.ok ? "INFLATE ORACLE: PASS" : "INFLATE ORACLE: FAIL",
    `gating bar: ${result.gatingBar}`,
    `Themis deck-spread: ${result.themisOk ? "PASS" : "FAIL"}`,
    `old 2% of golden max: ${result.oldBarOk ? "PASS" : "FAIL"} (printed, not the gate)`,
    `law-card equal: ${result.lawEqual}`,
    `load family equal: ${result.loadFamilyEqual}`,
    `mesh fingerprint equal: ${result.meshEqual}`,
    `Ψ ≥ 0: ${result.psiNonNegative}`,
    `λ rel at freeze: ${result.lambdaRelError === null ? "n/a" : (100 * result.lambdaRelError).toFixed(3) + "%"} (old bar ${100 * result.bands.lambdaRel}%)`,
    `V rel at freeze: ${result.volumeRelError === null ? "n/a" : (100 * result.volumeRelError).toFixed(3) + "%"} (band ${100 * result.bands.volumeRel}%)`,
    `p rel at freeze: ${result.pressureRelError === null ? "n/a" : (100 * result.pressureRelError).toFixed(3) + "%"} (band ${100 * result.bands.pressureRel}%, same-law only)`,
    formatEveryFrameTable(result),
  ];
  if (result.reasons.length > 0) {
    lines.push("reasons:");
    for (const r of result.reasons) lines.push(`  - ${r}`);
  }
  return lines.join("\n");
}
