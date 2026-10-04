import { ANIM_DT, H0, LOAD_FAMILY_QS_ISH_PLOAD_400MS, MU, NU, RHO } from "./constants.js";
import { ENGINE_LISTING_FIRST_ON_DT_S } from "./adaptivePeriod.js";
import { membraneWaveSpeed } from "../fe/materialNeoHookean.js";
import { lockedLawCard } from "./lawCard.js";
import { enclosedVolume, loadShipMeshA, meshFingerprint, trueEnclosedVolume } from "./meshA.js";
import type { InflateLawCard, InflateModelIR, QuadShellMesh } from "./types.js";

/** Closed-form incompressible neo-Hookean thin sphere. **read from docs.** */
export function nhSpherePressure(lambda: number, mu: number, h0: number, r0: number): number {
  return 2 * mu * (h0 / r0) * (1 / lambda - 1 / lambda ** 7);
}

export function equivalentSphereRadius(volume_m3: number): number {
  return (3 * volume_m3 / (4 * Math.PI)) ** (1 / 3);
}

export const SPHERE_LAMBDA_STAR = 7 ** (1 / 6);

/** Oriented Letter A rest volume, same sphere the 32 kPa number uses. */
export function orientedEquivalentSphere(): {
  V0_m3: number;
  R0_m: number;
  H0_m: number;
  pMax_Pa: number;
} {
  const mesh = loadShipMeshA();
  const V0_m3 = trueEnclosedVolume(mesh.coords, mesh.quads, mesh.tris);
  const R0_m = equivalentSphereRadius(V0_m3);
  const pMax_Pa = nhSpherePressure(SPHERE_LAMBDA_STAR, MU, H0, R0_m);
  return { V0_m3, R0_m, H0_m: H0, pMax_Pa };
}

export function sphereCircuitPeriodS(r0: number): number {
  return (2 * Math.PI * r0) / membraneWaveSpeed(MU, RHO, NU);
}

export function sphereBreathingPeriodS(r0: number): number {
  return 2 * Math.PI * r0 * Math.sqrt(RHO / MU);
}

/** About critical Rayleigh mass damping on the longer (breathing) period. */
export function slowSphereRayleighAlpha(r0: number): number {
  return 2 * ((2 * Math.PI) / sphereBreathingPeriodS(r0));
}

export const SLOW_SPHERE_RAMP_S = 0.4;
export const SLOW_SPHERE_END_S = 0.42;
export const SLOW_SPHERE_SUBDIV = 3;

function addVertex(coords: number[], x: number, y: number, z: number, r0: number): number {
  const n = Math.hypot(x, y, z);
  const i = coords.length / 3;
  coords.push((r0 * x) / n, (r0 * y) / n, (r0 * z) / n);
  return i;
}

function midpoint(
  coords: number[],
  cache: Map<string, number>,
  a: number,
  b: number,
  r0: number,
): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const key = `${String(lo)},${String(hi)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const i = addVertex(
    coords,
    coords[a * 3]! + coords[b * 3]!,
    coords[a * 3 + 1]! + coords[b * 3 + 1]!,
    coords[a * 3 + 2]! + coords[b * 3 + 2]!,
    r0,
  );
  cache.set(key, i);
  return i;
}

/**
 * Icosahedral sphere of rest radius R0, subdivided, triangles only.
 * Diagnosis mesh. Does not replace Letter A.
 */
export function buildSphereMesh(r0: number, subdiv: number = SLOW_SPHERE_SUBDIV): QuadShellMesh {
  const phi = (1 + Math.sqrt(5)) / 2;
  const coords: number[] = [];
  const seeds: readonly (readonly [number, number, number])[] = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ];
  for (const p of seeds) addVertex(coords, p[0], p[1], p[2], r0);
  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map<string, number>();
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(coords, cache, a, b, r0);
      const bc = midpoint(coords, cache, b, c, r0);
      const ca = midpoint(coords, cache, c, a, r0);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  let tris = faces.flat();
  const emptyQuads: number[] = [];
  // trueEnclosedVolume throws on a negative sign, so probe first, then flip.
  if (!(enclosedVolume(coords, emptyQuads, tris) > 0)) {
    const flipped: number[] = [];
    for (let i = 0; i < tris.length; i += 3) {
      flipped.push(tris[i]!, tris[i + 2]!, tris[i + 1]!);
    }
    tris = flipped;
  }
  trueEnclosedVolume(coords, emptyQuads, tris);
  return {
    coords,
    quads: emptyQuads,
    tris,
    nNodes: coords.length / 3,
    nQuads: 0,
    nTris: tris.length / 3,
    fingerprint: meshFingerprint(coords, emptyQuads, tris),
    letter: "A",
  };
}

export function createSlowSphereModel(opts: { dtMax?: number } = {}): InflateModelIR {
  const sph = orientedEquivalentSphere();
  const mesh = buildSphereMesh(sph.R0_m);
  const law: InflateLawCard = {
    ...lockedLawCard(),
    loadFamily: LOAD_FAMILY_QS_ISH_PLOAD_400MS,
    pMax: sph.pMax_Pa,
    tRamp: SLOW_SPHERE_RAMP_S,
    rayleighAlpha: slowSphereRayleighAlpha(sph.R0_m),
  };
  return {
    kind: "inflate-nh-membrane",
    meta: {
      name: "inflate-slow-sphere-check",
      version: 1,
      units: "SI",
      description:
        "Diagnosis only. Thin sphere at the oriented equivalent R0/H0. Not Letter A. Kill off. Slow ramp to closed-form p_max.",
    },
    law,
    mesh,
    controls: {
      endTime: SLOW_SPHERE_END_S,
      cfl: 0.45,
      maxSteps: 2_000_000,
      historyInterval: ANIM_DT,
      contactKind: "node-node",
      damping: { kind: "off" },
      ...(opts.dtMax !== undefined ? { dtMax: opts.dtMax } : {}),
    },
  };
}

export const LISTING_DT_CAP_S = ENGINE_LISTING_FIRST_ON_DT_S;
