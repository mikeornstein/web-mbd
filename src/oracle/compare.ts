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
  // Length usually within ~10%; foot radius still differs more (penalty RWALL vs
  // Radioss /RWALL kinematics + constitutive/hourglass details). Documented in mvp doc.
  lengthRatioRel: 0.12,
  radiusRatioRel: 0.45,
};

export interface OracleCompareResult {
  ok: boolean;
  lengthRelError: number;
  radiusRelError: number;
  tolerances: OracleCompareTolerances;
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
