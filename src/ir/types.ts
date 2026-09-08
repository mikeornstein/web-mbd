/** Minimal SI model IR for the Taylor-bar MVP. */

export type Vec3 = [number, number, number];

export interface MaterialJ2Linear {
  density: number;
  young: number;
  poisson: number;
  yieldStress: number;
  hardeningModulus: number;
}

export interface HexMesh {
  coords: number[];
  hexes: number[];
}

export interface RigidWallPlane {
  point: Vec3;
  normal: Vec3;
  /** Penalty stiffness (used when kind === "penalty"). */
  penalty: number;
  /**
   * Contact idealization.
   * - penalty: soft spring (legacy MVP)
   * - kinematic: Radioss /RWALL ITIED=0 style (default for Taylor oracle parity)
   */
  kind?: "penalty" | "kinematic";
}

export interface ModelIR {
  meta: {
    name: string;
    version: 1;
    units: "SI";
    description?: string;
  };
  material: MaterialJ2Linear;
  mesh: HexMesh;
  wall: RigidWallPlane;
  initialVelocity: Vec3;
  reference: {
    length0: number;
    radius0: number;
  };
  controls: {
    endTime: number;
    cfl: number;
    fixedDt?: number;
    maxSteps?: number;
    /** If true, never early-exit on residual KE (needed for oracle parity). */
    runToEnd?: boolean;
  };
  output: {
    historyInterval: number;
  };
}

export interface EnergySample {
  t: number;
  kinetic: number;
  internal: number;
  contact: number;
  total: number;
  errorPct: number;
}

export interface TaylorMetrics {
  finalLength: number;
  finalMaxRadius: number;
  lengthRatio: number;
  radiusRatio: number;
  /** L0 - Lf (axial shortening). */
  axialShortening: number;
  /** Max nodal |u| from the undeformed mesh. */
  maxDisplacement: number;
  /** Max equivalent plastic strain over all Gauss points. */
  maxEqPlasticStrain: number;
  energyErrorPct: number;
  nSteps: number;
  elapsedMs: number;
}

export interface SolveResult {
  coords: Float64Array;
  history: EnergySample[];
  metrics: TaylorMetrics;
}
