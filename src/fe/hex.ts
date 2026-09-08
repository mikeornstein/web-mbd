import type { MaterialJ2Linear } from "../ir/types.js";
import {
  createJ2State,
  dilatationalWaveSpeed,
  j2Update,
  type J2State,
} from "./materialJ2.js";
import { mat3Det, mat3Inverse } from "./math3.js";

const G = 1 / Math.sqrt(3);
const GAUSS = [-G, G];
const W1 = 1;

const CORNERS: [number, number, number][] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];

const SHAPES: { dN: number[][] }[] = [];
for (const xi of GAUSS) {
  for (const eta of GAUSS) {
    for (const zeta of GAUSS) {
      const dN: number[][] = [];
      for (const c of CORNERS) {
        dN.push([
          0.125 * c[0] * (1 + c[1] * eta) * (1 + c[2] * zeta),
          0.125 * c[1] * (1 + c[0] * xi) * (1 + c[2] * zeta),
          0.125 * c[2] * (1 + c[0] * xi) * (1 + c[1] * eta),
        ]);
      }
      SHAPES.push({ dN });
    }
  }
}

function jacobian(dN: number[][], x: Float64Array): number[] {
  const J = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let a = 0; a < 8; a++) s += x[a * 3 + i]! * dN[a]![j]!;
      J[i * 3 + j] = s;
    }
  }
  return J;
}

function gradN(dN: number[][], Jinv: number[]): number[][] {
  const g: number[][] = [];
  for (let a = 0; a < 8; a++) {
    const dn = dN[a]!;
    g.push([
      Jinv[0]! * dn[0]! + Jinv[3]! * dn[1]! + Jinv[6]! * dn[2]!,
      Jinv[1]! * dn[0]! + Jinv[4]! * dn[1]! + Jinv[7]! * dn[2]!,
      Jinv[2]! * dn[0]! + Jinv[5]! * dn[1]! + Jinv[8]! * dn[2]!,
    ]);
  }
  return g;
}

export function gatherHex(
  coords: ArrayLike<number>,
  conn: ArrayLike<number>,
  out: Float64Array,
): void {
  for (let a = 0; a < 8; a++) {
    const o = conn[a]! * 3;
    out[a * 3] = coords[o]!;
    out[a * 3 + 1] = coords[o + 1]!;
    out[a * 3 + 2] = coords[o + 2]!;
  }
}

export function hexVolume(x: Float64Array): number {
  let vol = 0;
  for (const sh of SHAPES) vol += mat3Det(jacobian(sh.dN, x)) * W1 * W1 * W1;
  return vol;
}

export function hexLumpedNodalMass(x0: Float64Array, density: number): Float64Array {
  const share = (density * hexVolume(x0)) / 8;
  return Float64Array.from({ length: 8 }, () => share);
}

export function createHexGpStates(x0?: Float64Array): J2State[] {
  if (!x0) return Array.from({ length: 8 }, () => createJ2State());
  return Array.from({ length: 8 }, (_, gp) => {
    const detJ = mat3Det(jacobian(SHAPES[gp]!.dN, x0));
    return createJ2State(detJ * W1 * W1 * W1);
  });
}

export function characteristicLength(x0: Float64Array): number {
  // Radioss H8C DELTAX is more conservative than ∛V; min edge length tracks
  // their initial critical dt much more closely on this mesh (~0.4 mm vs ∛V~1.1 mm).
  let minEdge = Infinity;
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of edges) {
    const dx = x0[a * 3]! - x0[b * 3]!;
    const dy = x0[a * 3 + 1]! - x0[b * 3 + 1]!;
    const dz = x0[a * 3 + 2]! - x0[b * 3 + 2]!;
    minEdge = Math.min(minEdge, Math.hypot(dx, dy, dz));
  }
  return minEdge;
}

export interface HexForceOptions {
  /** Mean-dilatation / constant-pressure (Radioss Icpre=1). Default true. */
  constantPressure?: boolean;
  /** Quadratic bulk viscosity qa (Radioss). Default 0. */
  bulkViscQuad?: number;
  /** Linear bulk viscosity qb (Radioss). Default 0. */
  bulkViscLin?: number;
}

/** Returns ∫σ:D dV dt. `fOut` accumulates +∫Bᵀσ dV. */
export function hexInternalForces(args: {
  x: Float64Array;
  v: Float64Array;
  states: J2State[];
  mat: MaterialJ2Linear;
  dt: number;
  fOut: Float64Array;
  options?: HexForceOptions;
}): number {
  const { x, v, states, mat, dt, fOut } = args;
  const constantPressure = args.options?.constantPressure !== false;
  const qa = args.options?.bulkViscQuad ?? 0;
  const qb = args.options?.bulkViscLin ?? 0;
  fOut.fill(0);
  let dU = 0;

  type GpCache = {
    detJ: number;
    gN: number[][];
    L: number[];
    d: Float64Array;
    vol: number;
    q: number;
  };
  const cache: GpCache[] = [];
  let volSum = 0;

  for (let gp = 0; gp < 8; gp++) {
    const { dN } = SHAPES[gp]!;
    const J = jacobian(dN, x);
    const detJ = mat3Det(J);
    if (detJ <= 0) throw new Error("hex inversion");
    const gN = gradN(dN, mat3Inverse(J));

    const L: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let a = 0; a < 8; a++) {
      const gx = gN[a]![0]!;
      const gy = gN[a]![1]!;
      const gz = gN[a]![2]!;
      const vx = v[a * 3]!;
      const vy = v[a * 3 + 1]!;
      const vz = v[a * 3 + 2]!;
      L[0]! += vx * gx;
      L[1]! += vx * gy;
      L[2]! += vx * gz;
      L[3]! += vy * gx;
      L[4]! += vy * gy;
      L[5]! += vy * gz;
      L[6]! += vz * gx;
      L[7]! += vz * gy;
      L[8]! += vz * gz;
    }

    const d = new Float64Array(6);
    d[0] = L[0]!;
    d[1] = L[4]!;
    d[2] = L[8]!;
    d[3] = 0.5 * (L[1]! + L[3]!);
    d[4] = 0.5 * (L[5]! + L[7]!);
    d[5] = 0.5 * (L[2]! + L[6]!);

    const vol = detJ * W1 * W1 * W1;
    volSum += vol;
    cache.push({ detJ, gN, L, d, vol, q: 0 });
  }

  const cd = dilatationalWaveSpeed(mat);
  let vol0Sum = 0;
  for (let gp = 0; gp < 8; gp++) vol0Sum += states[gp]!.vol0;
  const amuElem =
    constantPressure && vol0Sum > 0 ? vol0Sum / Math.max(volSum, 1e-30) - 1 : undefined;

  for (let gp = 0; gp < 8; gp++) {
    const gpCache = cache[gp]!;
    const { detJ, L, d, vol } = gpCache;

    // Radioss H8C (Icpre=1) does NOT replace GP strain rates with mean dilatation;
    // constant pressure is applied in the force assembly (s8efmoy3 + s8zfintp3).
    const trD = d[0]! + d[1]! + d[2]!;
    const h = Math.cbrt(Math.abs(detJ));
    gpCache.q =
      trD < 0 ? mat.density * ((qa * h * trD) ** 2 + qb * cd * h * -trD) : 0;

    // Radioss SROTA3 Jaumann (Iframe=1 / JCVT=0): Wα = (dt/2)*(∂vβ/∂xγ − ∂vγ/∂xβ)
    // matches ω_α * dt, applied to Voigt stress with engineering shear convention.
    const wzz = 0.5 * dt * (L[3]! - L[1]!); // DT1D2*(DYX-DXY)
    const wyy = 0.5 * dt * (L[2]! - L[6]!); // DT1D2*(DXZ-DZX)
    const wxx = 0.5 * dt * (L[7]! - L[5]!); // DT1D2*(DZY-DYZ)
    const state = states[gp]!;
    const sigma = state.stress;
    const s1 = sigma[0]!,
      s2 = sigma[1]!,
      s3 = sigma[2]!,
      s4 = sigma[3]!,
      s5 = sigma[4]!,
      s6 = sigma[5]!;
    const q1 = 2 * s4 * wzz;
    const q2 = 2 * s6 * wyy;
    const q3 = 2 * s5 * wxx;
    sigma[0] = s1 - q1 + q2;
    sigma[1] = s2 + q1 - q3;
    sigma[2] = s3 - q2 + q3;
    sigma[3] = s4 + wzz * (s1 - s2) + wyy * s5 - wxx * s6;
    sigma[4] = s5 + wxx * (s2 - s3) + wzz * s6 - wyy * s4;
    sigma[5] = s6 + wyy * (s3 - s1) + wxx * s4 - wzz * s5;

    j2Update(mat, state, d, dt, vol, amuElem);
  }

  for (let gp = 0; gp < 8; gp++) {
    const { gN, d, vol, q } = cache[gp]!;
    const sigma = states[gp]!.stress;
    const s0 = sigma[0]! - q;
    const s1 = sigma[1]! - q;
    const s2 = sigma[2]! - q;
    const s3 = sigma[3]!;
    const s4 = sigma[4]!;
    const s5 = sigma[5]!;

    dU += (s0 * d[0]! + s1 * d[1]! + s2 * d[2]! + 2 * (s3 * d[3]! + s4 * d[4]! + s5 * d[5]!)) * vol * dt;

    for (let a = 0; a < 8; a++) {
      const gx = gN[a]![0]!,
        gy = gN[a]![1]!,
        gz = gN[a]![2]!;
      fOut[a * 3]! += (s0 * gx + s3 * gy + s5 * gz) * vol;
      fOut[a * 3 + 1]! += (s3 * gx + s1 * gy + s4 * gz) * vol;
      fOut[a * 3 + 2]! += (s5 * gx + s4 * gy + s2 * gz) * vol;
    }
  }

  return dU;
}
