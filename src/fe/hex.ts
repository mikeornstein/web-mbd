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

export function characteristicLength(x0: Float64Array, poisson = 0.35): number {
  // Radioss H8C / LAW2: DELTAX = min_gp(128 * VOL_gp * SMAX) (s8ederi_2);
  // FAC_NU=1 for LAW2 so sz_dt1 is overwritten. Fall back to min edge.
  // `poisson` reserved for optional sz_dt1 blend when FAC_NU<1.
  const hPxc = characteristicLengthPxc(x0, poisson);
  const h = characteristicLengthSmax(x0);
  // Prefer SMAX (LAW2 path); keep PXC available for diagnostics / future FAC_NU.
  if (h > 0 && Number.isFinite(h)) return h;
  if (hPxc > 0 && Number.isFinite(hPxc)) return hPxc;
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

/**
 * Radioss `s8ederic3` SMAX (1 / √ max median-face metric) times GP volume:
 * DELTAX = 128 * VOL_gp * SMAX  (`s8ederi_2`, WI=1 for 2×2×2).
 */
export function characteristicLengthSmax(x: Float64Array): number {
  // Raw cofactors for SMAX (before 1/64 scaling) — Radioss s8ederic3.
  const x1 = x[0]!,
    y1 = x[1]!,
    z1 = x[2]!;
  const x2 = x[3]!,
    y2 = x[4]!,
    z2 = x[5]!;
  const x3 = x[6]!,
    y3 = x[7]!,
    z3 = x[8]!;
  const x4 = x[9]!,
    y4 = x[10]!,
    z4 = x[11]!;
  const x5 = x[12]!,
    y5 = x[13]!,
    z5 = x[14]!;
  const x6 = x[15]!,
    y6 = x[16]!,
    z6 = x[17]!;
  const x7 = x[18]!,
    y7 = x[19]!,
    z7 = x[20]!;
  const x8 = x[21]!,
    y8 = x[22]!,
    z8 = x[23]!;

  const x17 = x7 - x1,
    x28 = x8 - x2,
    x35 = x5 - x3,
    x46 = x6 - x4;
  const y17 = y7 - y1,
    y28 = y8 - y2,
    y35 = y5 - y3,
    y46 = y6 - y4;
  const z17 = z7 - z1,
    z28 = z8 - z2,
    z35 = z5 - z3,
    z46 = z6 - z4;

  const aj4 = x17 + x28 - x35 - x46;
  const aj5 = y17 + y28 - y35 - y46;
  const aj6 = z17 + z28 - z35 - z46;
  const a17 = x17 + x46,
    a28 = x28 + x35;
  const b17 = y17 + y46,
    b28 = y28 + y35;
  const c17 = z17 + z46,
    c28 = z28 + z35;
  const aj7 = a17 + a28,
    aj8 = b17 + b28,
    aj9 = c17 + c28;
  const aj1 = a17 - a28,
    aj2 = b17 - b28,
    aj3 = c17 - c28;

  const jac_59_68 = aj5 * aj9 - aj6 * aj8;
  const jac_67_49 = aj6 * aj7 - aj4 * aj9;
  const jac_48_57 = aj4 * aj8 - aj5 * aj7;
  const jac_38_29 = -aj2 * aj9 + aj3 * aj8;
  const jac_19_37 = aj1 * aj9 - aj3 * aj7;
  const jac_27_18 = -aj1 * aj8 + aj2 * aj7;
  const jac_26_35 = aj2 * aj6 - aj3 * aj5;
  const jac_34_16 = -aj1 * aj6 + aj3 * aj4;
  const jac_15_24 = aj1 * aj5 - aj2 * aj4;

  let s2 =
    jac_59_68 * jac_59_68 + jac_67_49 * jac_67_49 + jac_48_57 * jac_48_57;
  s2 = Math.max(
    s2,
    jac_38_29 * jac_38_29 + jac_19_37 * jac_19_37 + jac_27_18 * jac_27_18,
  );
  s2 = Math.max(
    s2,
    jac_26_35 * jac_26_35 + jac_34_16 * jac_34_16 + jac_15_24 * jac_15_24,
  );
  if (!(s2 > 0)) return 0;
  const smax = 1 / Math.sqrt(s2);

  // Min over 2×2×2 Gauss volumes (WI=1).
  let minVol = Infinity;
  for (const sh of SHAPES) {
    const detJ = mat3Det(jacobian(sh.dN, x));
    if (detJ <= 0) return 0;
    minVol = Math.min(minVol, detJ * W1 * W1 * W1);
  }
  return 128 * minVol * smax;
}

/**
 * Radioss `sz_dt1` characteristic length from PXC/PYC/PZC (used when FAC_NU<1).
 * `gfac = (1-2ν)/(1-ν)`; when gfac≥1 the routine returns 0 (caller falls back).
 */
export function characteristicLengthPxc(x: Float64Array, poisson = 0.35): number {
  const gfac = (1 - 2 * poisson) / (1 - poisson);
  if (!(gfac < 1)) return 0;
  const { pxc, pyc, pzc } = meanDilatationOperators(x);
  const pxx = 2 * (pxc[0]! ** 2 + pxc[1]! ** 2 + pxc[2]! ** 2 + pxc[3]! ** 2);
  const pyy = 2 * (pyc[0]! ** 2 + pyc[1]! ** 2 + pyc[2]! ** 2 + pyc[3]! ** 2);
  const pzz = 2 * (pzc[0]! ** 2 + pzc[1]! ** 2 + pzc[2]! ** 2 + pzc[3]! ** 2);
  const pxy = 2 * (pxc[0]! * pyc[0]! + pxc[1]! * pyc[1]! + pxc[2]! * pyc[2]! + pxc[3]! * pyc[3]!);
  const pxz = 2 * (pxc[0]! * pzc[0]! + pxc[1]! * pzc[1]! + pxc[2]! * pzc[2]! + pxc[3]! * pzc[3]!);
  const pyz = 2 * (pyc[0]! * pzc[0]! + pyc[1]! * pzc[1]! + pyc[2]! * pzc[2]! + pyc[3]! * pzc[3]!);
  const aa = -(pxx + pyy + pzz);
  const bb = gfac * (pxx * pyy + pxx * pzz + pyy * pzz - pxy * pxy - pxz * pxz - pyz * pyz);
  const p = bb - (1 / 3) * aa * aa;
  const d = 4 * Math.sqrt((1 / 3) * Math.max(-p, 0)) - (2 / 3) * aa;
  if (!(d > 0)) return 0;
  return 1 / Math.sqrt(d);
}

/** Radioss constant.inc: ZEP3 = 3/10 used in Icpre=1 force splitting. */
const ZEP3 = 0.3;
const ONE_OVER_64 = 1 / 64;

/**
 * Mid-face mean-dilatation operators PXC/PYC/PZC (Radioss `s8ederic3` / `s8zjac_ic`).
 * Four paired-node weights for diagonals (1,7), (2,8), (3,5), (4,6) — 0-based
 * (0,6), (1,7), (2,4), (3,5). `det` is the element Jacobian determinant at the
 * natural-space origin (equals physical volume for a parallelepiped).
 */
export function meanDilatationOperators(x: Float64Array): {
  pxc: [number, number, number, number];
  pyc: [number, number, number, number];
  pzc: [number, number, number, number];
  det: number;
} {
  const x1 = x[0]!,
    y1 = x[1]!,
    z1 = x[2]!;
  const x2 = x[3]!,
    y2 = x[4]!,
    z2 = x[5]!;
  const x3 = x[6]!,
    y3 = x[7]!,
    z3 = x[8]!;
  const x4 = x[9]!,
    y4 = x[10]!,
    z4 = x[11]!;
  const x5 = x[12]!,
    y5 = x[13]!,
    z5 = x[14]!;
  const x6 = x[15]!,
    y6 = x[16]!,
    z6 = x[17]!;
  const x7 = x[18]!,
    y7 = x[19]!,
    z7 = x[20]!;
  const x8 = x[21]!,
    y8 = x[22]!,
    z8 = x[23]!;

  const x17 = x7 - x1,
    x28 = x8 - x2,
    x35 = x5 - x3,
    x46 = x6 - x4;
  const y17 = y7 - y1,
    y28 = y8 - y2,
    y35 = y5 - y3,
    y46 = y6 - y4;
  const z17 = z7 - z1,
    z28 = z8 - z2,
    z35 = z5 - z3,
    z46 = z6 - z4;

  const aj4 = x17 + x28 - x35 - x46;
  const aj5 = y17 + y28 - y35 - y46;
  const aj6 = z17 + z28 - z35 - z46;
  const a17 = x17 + x46,
    a28 = x28 + x35;
  const b17 = y17 + y46,
    b28 = y28 + y35;
  const c17 = z17 + z46,
    c28 = z28 + z35;
  const aj7 = a17 + a28,
    aj8 = b17 + b28,
    aj9 = c17 + c28;
  const aj1 = a17 - a28,
    aj2 = b17 - b28,
    aj3 = c17 - c28;

  const jac_59_68 = aj5 * aj9 - aj6 * aj8;
  const jac_67_49 = aj6 * aj7 - aj4 * aj9;
  const jac_48_57 = aj4 * aj8 - aj5 * aj7;
  const jac_38_29 = -aj2 * aj9 + aj3 * aj8;
  const jac_19_37 = aj1 * aj9 - aj3 * aj7;
  const jac_27_18 = -aj1 * aj8 + aj2 * aj7;
  const jac_26_35 = aj2 * aj6 - aj3 * aj5;
  const jac_34_16 = -aj1 * aj6 + aj3 * aj4;
  const jac_15_24 = aj1 * aj5 - aj2 * aj4;

  const det = ONE_OVER_64 * (aj1 * jac_59_68 + aj2 * jac_67_49 + aj3 * jac_48_57);
  const dett = ONE_OVER_64 / Math.max(det, 1e-30);

  const aji1 = dett * jac_59_68;
  const aji4 = dett * jac_67_49;
  const aji7 = dett * jac_48_57;
  const aji2 = dett * jac_38_29;
  const aji5 = dett * jac_19_37;
  const aji8 = dett * jac_27_18;
  const aji3 = dett * jac_26_35;
  const aji6 = dett * jac_34_16;
  const aji9 = dett * jac_15_24;

  const aj12 = aji1 - aji2;
  const aj45 = aji4 - aji5;
  const aj78 = aji7 - aji8;
  const aj12p = aji1 + aji2;
  const aj45p = aji4 + aji5;
  const aj78p = aji7 + aji8;

  return {
    pxc: [-aj12p - aji3, aj12 - aji3, aj12p - aji3, -aj12 - aji3],
    pyc: [-aj45p - aji6, aj45 - aji6, aj45p - aji6, -aj45 - aji6],
    pzc: [-aj78p - aji9, aj78 - aji9, aj78p - aji9, -aj78 - aji9],
    det,
  };
}

/** Mean dilatation rate from PXC (Radioss `s8edefoc3`). */
export function meanDilatationRate(
  pxc: [number, number, number, number],
  pyc: [number, number, number, number],
  pzc: [number, number, number, number],
  v: Float64Array,
): number {
  // Pairs (0,6), (1,7), (2,4), (3,5)
  return (
    pxc[0]! * (v[0]! - v[18]!) +
    pxc[1]! * (v[3]! - v[21]!) +
    pxc[2]! * (v[6]! - v[12]!) +
    pxc[3]! * (v[9]! - v[15]!) +
    pyc[0]! * (v[1]! - v[19]!) +
    pyc[1]! * (v[4]! - v[22]!) +
    pyc[2]! * (v[7]! - v[13]!) +
    pyc[3]! * (v[10]! - v[16]!) +
    pzc[0]! * (v[2]! - v[20]!) +
    pzc[1]! * (v[5]! - v[23]!) +
    pzc[2]! * (v[8]! - v[14]!) +
    pzc[3]! * (v[11]! - v[17]!)
  );
}

export interface HexForceOptions {
  /** Mean-dilatation / constant-pressure (Radioss Icpre=1). Default true. */
  constantPressure?: boolean;
  /**
   * Element-mean AMU for LAW2 pressure (V0_sum/V_sum − 1). Default true when
   * `constantPressure` is on. Radioss instead corrects VOLO via DSV; mean AMU is
   * a close stand-in once PXC handles the force path.
   */
  meanAmu?: boolean;
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
  const meanAmu = args.options?.meanAmu ?? constantPressure;
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

  const pxcOps = constantPressure ? meanDilatationOperators(x) : null;

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
  // Element-mean AMU mirrors Radioss constant-pressure EOS; force path uses PXC.
  const amuElem =
    meanAmu && vol0Sum > 0 ? vol0Sum / Math.max(volSum, 1e-30) - 1 : undefined;

  for (let gp = 0; gp < 8; gp++) {
    const gpCache = cache[gp]!;
    const { detJ, L, d, vol } = gpCache;

    // Radioss H8C (Icpre=1) keeps GP strain rates; mean pressure is selectively
    // re-assembled via s8efmoy3 (ZEP3) + s8zfintp3 (PXC).
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

  // Volume-weighted mean pressure (Radioss s8efmoy3 with ICP=1).
  let pp = 0;

  for (let gp = 0; gp < 8; gp++) {
    const { gN, d, vol, q } = cache[gp]!;
    const sigma = states[gp]!.stress;
    let s0 = sigma[0]! - q;
    let s1 = sigma[1]! - q;
    let s2 = sigma[2]! - q;
    const s3 = sigma[3]!;
    const s4 = sigma[4]!;
    const s5 = sigma[5]!;

    dU += (s0 * d[0]! + s1 * d[1]! + s2 * d[2]! + 2 * (s3 * d[3]! + s4 * d[4]! + s5 * d[5]!)) * vol * dt;

    if (constantPressure && pxcOps) {
      // s8efint3 ICP=1: strip ZEP3*tr(σ) at the GP, assemble with standard B;
      // mean pressure returns through PXC (s8zfintp3) below.
      const pLoc = ZEP3 * (s0 + s1 + s2);
      pp += (vol / Math.max(volSum, 1e-30)) * pLoc;
      s0 -= pLoc;
      s1 -= pLoc;
      s2 -= pLoc;
    }

    for (let a = 0; a < 8; a++) {
      const gx = gN[a]![0]!,
        gy = gN[a]![1]!,
        gz = gN[a]![2]!;
      fOut[a * 3]! += (s0 * gx + s3 * gy + s5 * gz) * vol;
      fOut[a * 3 + 1]! += (s3 * gx + s1 * gy + s4 * gz) * vol;
      fOut[a * 3 + 2]! += (s5 * gx + s4 * gy + s2 * gz) * vol;
    }
  }

  if (constantPressure && pxcOps) {
    // s8zfintp3: SP = PP * VOLG; our fOut is +f_int so signs flip vs Radioss F.
    const { pxc, pyc, pzc } = pxcOps;
    const sp = pp * volSum;
    const pairs: [number, number, number][] = [
      [0, 6, 0],
      [1, 7, 1],
      [2, 4, 2],
      [3, 5, 3],
    ];
    for (const [a, b, k] of pairs) {
      const sx = sp * pxc[k]!;
      const sy = sp * pyc[k]!;
      const sz = sp * pzc[k]!;
      fOut[a * 3]! += sx;
      fOut[a * 3 + 1]! += sy;
      fOut[a * 3 + 2]! += sz;
      fOut[b * 3]! -= sx;
      fOut[b * 3 + 1]! -= sy;
      fOut[b * 3 + 2]! -= sz;
    }
  }

  return dU;
}
