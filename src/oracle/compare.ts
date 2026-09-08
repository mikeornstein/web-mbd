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
  // After H8C/LAW2 alignment: Lf within ~0.05%, Rf within ~1.2% on the default mesh.
  // Bitwise Object.is on nodal coords is the remaining parity target.
  lengthRatioRel: 0.005,
  radiusRatioRel: 0.02,
};

export interface OracleCompareResult {
  ok: boolean;
  lengthRelError: number;
  radiusRelError: number;
  tolerances: OracleCompareTolerances;
}

/** True only when every finite metric field is Object.is-equal (bitwise). */
export function metricsBitwiseEqual(
  a: Pick<TaylorMetrics, "lengthRatio" | "radiusRatio">,
  b: Pick<OracleShapeMetrics, "lengthRatio" | "radiusRatio">,
): boolean {
  return Object.is(a.lengthRatio, b.lengthRatio) && Object.is(a.radiusRatio, b.radiusRatio);
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
  };
}
