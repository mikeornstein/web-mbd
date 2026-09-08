import type { TaylorMetrics } from "../ir/types.js";

export interface OracleShapeMetrics {
  lengthRatio: number;
  radiusRatio: number;
}

export interface OracleCompareTolerances {
  /** Relative |web-mbd - oracle| / |oracle| on Lf/L0 (default 0.08). */
  lengthRatioRel: number;
  /** Relative |web-mbd - oracle| / |oracle| on Rf/R0 (default 0.12). */
  radiusRatioRel: number;
}

export const DEFAULT_ORACLE_TOLERANCES: OracleCompareTolerances = {
  // CFL=0.9 adaptive: Lf ~0.0004%, Rf ~0.0005% (~4–5e-6 rel). Fine fixed DT
  // shrinks this to ~1e-6 (truncation floor). Object.is still needs a shared kernel.
  lengthRatioRel: 1e-5,
  radiusRatioRel: 2e-5,
};

export interface OracleCompareResult {
  ok: boolean;
  lengthRelError: number;
  radiusRelError: number;
  tolerances: OracleCompareTolerances;
  bitwiseEqual: boolean;
}

/** True only when every finite metric field is Object.is-equal (bitwise). */
export function metricsBitwiseEqual(
  a: Pick<TaylorMetrics, "lengthRatio" | "radiusRatio">,
  b: Pick<OracleShapeMetrics, "lengthRatio" | "radiusRatio">,
): boolean {
  return Object.is(a.lengthRatio, b.lengthRatio) && Object.is(a.radiusRatio, b.radiusRatio);
}

/**
 * Max / mean nearest-neighbor distance from `ours` nodes to `theirs`.
 * VTK node ordering is not guaranteed; match geometrically.
 */
export function nearestNeighborGap(
  ours: ArrayLike<number>,
  theirs: ArrayLike<number>,
): { max: number; mean: number } {
  const nOurs = ours.length / 3;
  const nTheirs = theirs.length / 3;
  if (nOurs === 0 || nTheirs === 0) return { max: Infinity, mean: Infinity };
  let max = 0;
  let sum = 0;
  for (let a = 0; a < nOurs; a++) {
    const px = ours[a * 3]!,
      py = ours[a * 3 + 1]!,
      pz = ours[a * 3 + 2]!;
    let best = Infinity;
    for (let b = 0; b < nTheirs; b++) {
      const d = Math.hypot(px - theirs[b * 3]!, py - theirs[b * 3 + 1]!, pz - theirs[b * 3 + 2]!);
      if (d < best) best = d;
    }
    max = Math.max(max, best);
    sum += best;
  }
  return { max, mean: sum / nOurs };
}

/**
 * ID-aligned max / mean gap when both arrays share the same node order
 * (web-mbd index i ↔ Radioss ITAB i+1 after `.sta` ID sort).
 */
export function alignedCoordGap(
  ours: ArrayLike<number>,
  theirs: ArrayLike<number>,
): { max: number; mean: number; bitwiseEqual: boolean } {
  if (ours.length !== theirs.length || ours.length % 3 !== 0) {
    return { max: Infinity, mean: Infinity, bitwiseEqual: false };
  }
  const n = ours.length / 3;
  if (n === 0) return { max: 0, mean: 0, bitwiseEqual: true };
  let max = 0;
  let sum = 0;
  let bitwiseEqual = true;
  for (let a = 0; a < n; a++) {
    const ox = ours[a * 3]!,
      oy = ours[a * 3 + 1]!,
      oz = ours[a * 3 + 2]!;
    const tx = theirs[a * 3]!,
      ty = theirs[a * 3 + 1]!,
      tz = theirs[a * 3 + 2]!;
    if (!Object.is(ox, tx) || !Object.is(oy, ty) || !Object.is(oz, tz)) bitwiseEqual = false;
    const d = Math.hypot(ox - tx, oy - ty, oz - tz);
    max = Math.max(max, d);
    sum += d;
  }
  return { max, mean: sum / n, bitwiseEqual };
}

export function compareToOracle(
  ours: Pick<TaylorMetrics, "lengthRatio" | "radiusRatio">,
  oracle: Pick<OracleShapeMetrics, "lengthRatio" | "radiusRatio">,
  tolerances: OracleCompareTolerances = DEFAULT_ORACLE_TOLERANCES,
): OracleCompareResult {
  const lengthRelError =
    Math.abs(ours.lengthRatio - oracle.lengthRatio) / Math.max(Math.abs(oracle.lengthRatio), 1e-12);
  const radiusRelError =
    Math.abs(ours.radiusRatio - oracle.radiusRatio) / Math.max(Math.abs(oracle.radiusRatio), 1e-12);
  return {
    ok:
      lengthRelError <= tolerances.lengthRatioRel &&
      radiusRelError <= tolerances.radiusRatioRel,
    lengthRelError,
    radiusRelError,
    tolerances,
    bitwiseEqual: metricsBitwiseEqual(ours, oracle),
  };
}
