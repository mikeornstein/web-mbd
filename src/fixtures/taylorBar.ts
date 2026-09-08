import type { ModelIR } from "../ir/types.js";
import { createCylinderHexMesh } from "../mesh/cylinderHex.js";

/**
 * Classic copper Taylor impact specimen (OFHC-like linear hardening idealization).
 *
 * Geometry / IC (SI):
 * - L0 = 32.4 mm, R0 = 3.2 mm
 * - V0 = 227 m/s into a rigid wall at z = 0
 *
 * Default mesh is refined (nSide=6, nZ=16) with CFL 0.25 for stable full-integration hexes.
 * Acceptance bands are tightened against the OpenRadioss same-mesh oracle (see
 * `src/oracle/` and `docs/mvp-taylor-bar.md`).
 */
export interface TaylorFixtureOptions {
  /** Cross-section subdivisions (default 6). */
  nSide?: number;
  /** Axial subdivisions (default 16). */
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
    nSide: options.nSide ?? 6,
    nZ: options.nZ ?? 16,
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
      cfl: 0.2,
      maxSteps: 2_000_000,
    },
    output: {
      historyInterval: 2e-6,
    },
  };
}

/**
 * Tightened Layer-1 bands for the refined default mesh (6×6×16 hexes, CFL 0.2).
 * Absolute bands are centered on the web-mbd solution; OpenRadioss same-mesh
 * compare lives in `src/oracle/` (foot flare still differs by contact/formulation).
 */
export const TAYLOR_ACCEPTANCE = {
  lengthRatio: { min: 0.59, max: 0.64 },
  radiusRatio: { min: 1.35, max: 1.55 },
  energyErrorPctAbsMax: 5,
  maxEqPlasticStrain: { min: 0.5, max: 8 },
} as const;
