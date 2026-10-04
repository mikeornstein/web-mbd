/**
 * Score the locked energy-split share rules. Measurement only.
 * Do not add a verdict row. Do not widen any bar.
 */
import {
  ENERGY_SPLIT_DECIDING_MS,
  OUTCOME_A,
  OUTCOME_B,
  OUTCOME_C,
  OUTCOME_OTHER_PREFIX,
} from "./deckEnergySplitRules.js";

export type EnergySplitKind = "damps-too-much-early" | "mass-spread" | "strain-distributed" | "other";

export interface SharePoint {
  t_ms: number;
  dissipatedShare: number | null;
  kineticShare: number | null;
}

export interface EnergySplitScoreInput {
  toy: readonly SharePoint[];
  decksAt4: readonly SharePoint[];
  decksAt8: readonly SharePoint[];
}

export interface Range {
  min: number;
  max: number;
  n: number;
}

export interface EnergySplitScore {
  dissipRange4: Range | null;
  dissipRange8: Range | null;
  kineticRange4: Range | null;
  kineticRange8: Range | null;
  toyDissip4: number | null;
  toyDissip8: number | null;
  toyKinetic4: number | null;
  toyKinetic8: number | null;
  dissipAbove4: boolean;
  dissipAbove8: boolean;
  dissipInside4: boolean;
  dissipInside8: boolean;
  kineticOutside4: boolean;
  kineticOutside8: boolean;
  kineticInside4: boolean;
  kineticInside8: boolean;
  firesA: boolean;
  firesB: boolean;
  firesC: boolean;
  kind: EnergySplitKind;
  outcomeLine: string;
}

function atMs(rows: readonly SharePoint[], t_ms: number): SharePoint | null {
  return rows.find((r) => r.t_ms === t_ms) ?? null;
}

function rangeOf(values: readonly (number | null)[]): Range | null {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length === 0) return null;
  let min = xs[0]!;
  let max = xs[0]!;
  for (const v of xs) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max, n: xs.length };
}

function inside(x: number | null, r: Range | null): boolean {
  if (x === null || r === null) return false;
  return x >= r.min && x <= r.max;
}

function above(x: number | null, r: Range | null): boolean {
  if (x === null || r === null) return false;
  return x > r.max;
}

function outside(x: number | null, r: Range | null): boolean {
  if (x === null || r === null) return false;
  return x < r.min || x > r.max;
}

export function scoreEnergySplit(input: EnergySplitScoreInput): EnergySplitScore {
  const toy4 = atMs(input.toy, 4);
  const toy8 = atMs(input.toy, 8);
  const dissipRange4 = rangeOf(input.decksAt4.map((d) => d.dissipatedShare));
  const dissipRange8 = rangeOf(input.decksAt8.map((d) => d.dissipatedShare));
  const kineticRange4 = rangeOf(input.decksAt4.map((d) => d.kineticShare));
  const kineticRange8 = rangeOf(input.decksAt8.map((d) => d.kineticShare));
  const toyDissip4 = toy4?.dissipatedShare ?? null;
  const toyDissip8 = toy8?.dissipatedShare ?? null;
  const toyKinetic4 = toy4?.kineticShare ?? null;
  const toyKinetic8 = toy8?.kineticShare ?? null;
  const dissipAbove4 = above(toyDissip4, dissipRange4);
  const dissipAbove8 = above(toyDissip8, dissipRange8);
  const dissipInside4 = inside(toyDissip4, dissipRange4);
  const dissipInside8 = inside(toyDissip8, dissipRange8);
  const kineticOutside4 = outside(toyKinetic4, kineticRange4);
  const kineticOutside8 = outside(toyKinetic8, kineticRange8);
  const kineticInside4 = inside(toyKinetic4, kineticRange4);
  const kineticInside8 = inside(toyKinetic8, kineticRange8);
  const firesA = dissipAbove4 && dissipAbove8;
  const firesB = kineticOutside4 && kineticOutside8;
  const firesC = dissipInside4 && dissipInside8 && kineticInside4 && kineticInside8;

  let kind: EnergySplitKind = "other";
  const lines: string[] = [];
  if (firesA && !firesB && !firesC) {
    kind = "damps-too-much-early";
    lines.push(`(a) ${OUTCOME_A}`);
  } else if (firesB && !firesA && !firesC) {
    kind = "mass-spread";
    lines.push(`(b) ${OUTCOME_B}`);
  } else if (firesC && !firesA && !firesB) {
    kind = "strain-distributed";
    lines.push(`(c) ${OUTCOME_C}`);
  } else {
    kind = "other";
    lines.push(OUTCOME_OTHER_PREFIX);
    if (firesA) lines.push(`(a) also matches: ${OUTCOME_A}`);
    if (firesB) lines.push(`(b) also matches: ${OUTCOME_B}`);
    if (firesC) lines.push(`(c) also matches: ${OUTCOME_C}`);
    lines.push(
      `dissipated share above range: 4 ms ${String(dissipAbove4)} 8 ms ${String(dissipAbove8)}; kinetic share outside range: 4 ms ${String(kineticOutside4)} 8 ms ${String(kineticOutside8)}; both inside: 4 ms dissip ${String(dissipInside4)} kinetic ${String(kineticInside4)}, 8 ms dissip ${String(dissipInside8)} kinetic ${String(kineticInside8)}.`,
    );
  }

  if (ENERGY_SPLIT_DECIDING_MS[0] !== 4 || ENERGY_SPLIT_DECIDING_MS[1] !== 8) {
    throw new Error("deciding frames must stay 4 and 8 ms");
  }

  return {
    dissipRange4,
    dissipRange8,
    kineticRange4,
    kineticRange8,
    toyDissip4,
    toyDissip8,
    toyKinetic4,
    toyKinetic8,
    dissipAbove4,
    dissipAbove8,
    dissipInside4,
    dissipInside8,
    kineticOutside4,
    kineticOutside8,
    kineticInside4,
    kineticInside8,
    firesA,
    firesB,
    firesC,
    kind,
    outcomeLine: lines.join(" "),
  };
}
