import type { MaterialJ2Linear } from "../ir/types.js";
import { createJ2State, j2Update, stressPower, type J2State } from "./materialJ2.js";
import { mat3Det, mat3Inverse, mat3Mul, mat3Transpose } from "./math3.js";

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

export function createHexGpStates(): J2State[] {
  return Array.from({ length: 8 }, () => createJ2State());
}

export function characteristicLength(x0: Float64Array): number {
  return Math.cbrt(Math.abs(hexVolume(x0)));
}

/** Returns ∫σ:D dV dt. `fOut` accumulates +∫Bᵀσ dV. */
export function hexInternalForces(args: {
  x: Float64Array;
  v: Float64Array;
  states: J2State[];
  mat: MaterialJ2Linear;
  dt: number;
  fOut: Float64Array;
}): number {
  const { x, v, states, mat, dt, fOut } = args;
  fOut.fill(0);
  let dU = 0;

  for (let gp = 0; gp < 8; gp++) {
    const { dN } = SHAPES[gp]!;
    const J = jacobian(dN, x);
    const detJ = mat3Det(J);
    if (detJ <= 0) throw new Error("hex inversion");
    const Jinv = mat3Inverse(J);
    const gN = gradN(dN, Jinv);

    const L = new Array<number>(9).fill(0);
    for (let a = 0; a < 8; a++) {
      const gx = gN[a]![0]!,
        gy = gN[a]![1]!,
        gz = gN[a]![2]!;
      const vx = v[a * 3]!,
        vy = v[a * 3 + 1]!,
        vz = v[a * 3 + 2]!;
      L[0] += vx * gx;
      L[1] += vx * gy;
      L[2] += vx * gz;
      L[3] += vy * gx;
      L[4] += vy * gy;
      L[5] += vy * gz;
      L[6] += vz * gx;
      L[7] += vz * gy;
      L[8] += vz * gz;
    }

    const d = new Float64Array(6);
    d[0] = L[0]!;
    d[1] = L[4]!;
    d[2] = L[8]!;
    d[3] = 0.5 * (L[1]! + L[3]!);
    d[4] = 0.5 * (L[5]! + L[7]!);
    d[5] = 0.5 * (L[2]! + L[6]!);

    const W = [
      0,
      0.5 * (L[1]! - L[3]!),
      0.5 * (L[2]! - L[6]!),
      0.5 * (L[3]! - L[1]!),
      0,
      0.5 * (L[5]! - L[7]!),
      0.5 * (L[6]! - L[2]!),
      0.5 * (L[7]! - L[5]!),
      0,
    ];

    const state = states[gp]!;
    const sigma = state.stress;
    const sm = [
      sigma[0]!,
      sigma[3]!,
      sigma[5]!,
      sigma[3]!,
      sigma[1]!,
      sigma[4]!,
      sigma[5]!,
      sigma[4]!,
      sigma[2]!,
    ];
    const Ws = mat3Mul(W, sm);
    const sWt = mat3Mul(sm, mat3Transpose(W));
    sigma[0] += dt * (Ws[0]! + sWt[0]!);
    sigma[1] += dt * (Ws[4]! + sWt[4]!);
    sigma[2] += dt * (Ws[8]! + sWt[8]!);
    sigma[3] += dt * (Ws[1]! + sWt[1]!);
    sigma[4] += dt * (Ws[5]! + sWt[5]!);
    sigma[5] += dt * (Ws[2]! + sWt[2]!);

    j2Update(mat, state, d, dt);

    const vol = detJ * W1 * W1 * W1;
    dU += stressPower(sigma, d) * vol * dt;

    for (let a = 0; a < 8; a++) {
      const gx = gN[a]![0]!,
        gy = gN[a]![1]!,
        gz = gN[a]![2]!;
      fOut[a * 3]! += (sigma[0]! * gx + sigma[3]! * gy + sigma[5]! * gz) * vol;
      fOut[a * 3 + 1]! += (sigma[3]! * gx + sigma[1]! * gy + sigma[4]! * gz) * vol;
      fOut[a * 3 + 2]! += (sigma[5]! * gx + sigma[4]! * gy + sigma[2]! * gz) * vol;
    }
  }
  return dU;
}
