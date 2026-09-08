import type { ModelIR } from "../ir/types.js";
import { createCylinderHexMesh } from "../mesh/cylinderHex.js";

/**
 * Classic copper Taylor impact specimen (OFHC-like linear hardening idealization).
 *
 * Geometry / IC (SI):
 * - L0 = 32.4 mm, R0 = 3.2 mm
 * - V0 = 227 m/s into a rigid wall at z = 0
 *
 * Published final-shape bands for this class of copper Taylor tests (and common FE
 * verification tables) are typically:
 * - Lf / L0 ≈ 0.55–0.75
 * - Rf / R0 ≈ 1.2–1.8
 * Exact targets depend on hardening law; we use these bands as the MVP gate.
 */
export interface TaylorFixtureOptions {
  /** Cross-section subdivisions (default 3). */
  nSide?: number;
  /** Axial subdivisions (default 8). */
  nZ?: number;
  /** Impact speed magnitude (default 227 m/s). */
  speed?: number;
}

export function createTaylorBarModel(options: TaylorFixtureOptions = {}): ModelIR {
  const length0 = 32.4e-3;
  const radius0 = 3.2e-3;
  const speed = options.speed ?? 227;
  const mesh = createCylinderHexMesh({
    radius: radius0,
    length: length0,
    nSide: options.nSide ?? 3,
    nZ: options.nZ ?? 8,
  });

  return {
    meta: {
      name: "taylor-bar-copper",
      version: 1,
      units: "SI",
      description:
        "OFHC-copper-like Taylor impact into a frictionless rigid wall (J2 linear hardening).",
    },
    material: {
      density: 8930,
      young: 117e9,
      poisson: 0.35,
      yieldStress: 400e6,
      hardeningModulus: 100e6,
    },
    mesh: {
      coords: mesh.coords,
      hexes: mesh.hexes,
    },
    wall: {
      point: [0, 0, 0],
      normal: [0, 0, 1],
      penalty: 0, // solver default from bulk modulus
    },
    initialVelocity: [0, 0, -speed],
    reference: { length0, radius0 },
    controls: {
      endTime: 80e-6,
      cfl: 0.4,
      maxSteps: 2_000_000,
    },
    output: {
      historyInterval: 2e-6,
    },
  };
}

/** Acceptance bands for the MVP golden test. */
export const TAYLOR_ACCEPTANCE = {
  lengthRatio: { min: 0.55, max: 0.78 },
  // Mesh-sensitive foot flare; tighten after hourglass/viscosity / finer-mesh study.
  radiusRatio: { min: 1.15, max: 2.6 },
  energyErrorPctAbsMax: 8,
} as const;
