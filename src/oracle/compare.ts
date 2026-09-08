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
  // After PXC + DSV + SMAX /DT + variable-dt DT12: Lf ~0.006%, Rf ~0.017%.
  // Bitwise Object.is on nodal coords remains the parity target (JS vs Fortran floor).
  lengthRatioRel: 0.001,
  radiusRatioRel: 0.002,
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
 * VTK / Radioss node IDs are not comparable; match geometrically.
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
