import type { MaterialJ2Linear } from "../ir/types.js";

/**
 * Per-Gauss-point state matching OpenRadioss LAW2 / M2LAW bookkeeping:
 * Cauchy stress in Voigt (xx,yy,zz,xy,yz,zx); shear components are true σ_xy
 * (not doubled). Rate vector `d` uses Radioss engineering shear
 * (D4=DXY+DYX). Equivalent plastic strain and reference Gauss volume for
 * AMU = V0/V − 1.
 */
export interface J2State {
  stress: Float64Array;
  eqPlasticStrain: number;
  /** Reference (t=0) Gauss weight volume. */
  vol0: number;
}

export function createJ2State(vol0 = 0): J2State {
  return {
    stress: new Float64Array(6),
    eqPlasticStrain: 0,
    vol0,
  };
}

/**
 * OpenRadioss `ONEP333` from `constant_mod.F`:
 * `ONEP33 + THREEEM3` = 1 + 0.3 + 0.03 + 0.003 = **1.333** (not exact 4/3).
 * M2LAW SSP uses `sqrt((ONEP333*G + BULK)/ρ₀)` — exact 4/3 shifts DT₀ by ~0.004%.
 */
export const RADIOSS_ONEP333 = 1.333;

/** OpenRadioss `THIRD = ONE/THREE` — must multiply, not divide by 3 (1 ulp). */
export const RADIOSS_THIRD = 1 / 3;

export function lame(E: number, nu: number): { lam: number; mu: number; bulk: number } {
  const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu));
  const mu = E / (2 * (1 + nu));
  // Match `hm_read_mat02_jc`: bulk = E / (3*(1-2ν)), not lam+(2/3)μ (1 ulp apart).
  const bulk = E / (3 * (1 - 2 * nu));
  return { lam, mu, bulk };
}

export function dilatationalWaveSpeed(mat: MaterialJ2Linear): number {
  const { mu, bulk } = lame(mat.young, mat.poisson);
  return Math.sqrt((RADIOSS_ONEP333 * mu + bulk) / mat.density);
}

/**
 * OpenRadioss M2LAW (LAW2 / PLAS_JOHNS) solid update for one integration point.
 *
 * - Deviatoric hypoelastic predictor with Jaumann already applied by the element
 * - Radial return with isotropic linear hardening (CN=1, CC=0)
 * - Pressure from bulk EOS: P = K·AMU with Radioss LAW2 association
 *   RHON = ρ₀·(V₀/V), AMU = RHON/ρ₀ − 1 (not the algebraically equal V₀/V − 1)
 * - P/DAV use `THIRD = 1/3` multiply (`-THIRD*sum`), not divide-by-3 (1 ulp)
 *
 * `d` matches `s8edefo3` / M2LAW: D1..D3 stretch rates, D4..D6 engineering
 * shear (D4=DXY+DYX). Diagonals use G2=2G·DT; shear uses G1=G·DT (`m2law.F`).
 */
export function j2Update(
  mat: MaterialJ2Linear,
  state: J2State,
  d: Float64Array,
  dt: number,
  vol: number,
  amuOverride?: number,
): void {
  const { mu, bulk } = lame(mat.young, mat.poisson);
  const s = state.stress;
  // m2law.F: P = -THIRD*(S1+S2+S3); DAV = -THIRD*(D1+D2+D3) — not ÷3.
  const pOld = -RADIOSS_THIRD * (s[0]! + s[1]! + s[2]!);
  const dav = -RADIOSS_THIRD * (d[0]! + d[1]! + d[2]!);
  const g1 = dt * mu;
  const g2 = 2 * g1;

  // Elastic predictor on the shifted (≈deviatoric) stress, Radioss M2LAW style.
  s[0]! += pOld + g2 * (d[0]! + dav);
  s[1]! += pOld + g2 * (d[1]! + dav);
  s[2]! += pOld + g2 * (d[2]! + dav);
  s[3]! += g1 * d[3]!;
  s[4]! += g1 * d[4]!;
  s[5]! += g1 * d[5]!;

  // AJ2 = HALF*(…); AJ2 = SQRT(THREE*AJ2)
  const j2 =
    0.5 * (s[0]! * s[0]! + s[1]! * s[1]! + s[2]! * s[2]!) +
    s[3]! * s[3]! +
    s[4]! * s[4]! +
    s[5]! * s[5]!;
  const seq = Math.sqrt(3 * j2);

  const ca = mat.yieldStress;
  const cb = mat.hardeningModulus;
  let ak = ca + cb * state.eqPlasticStrain;
  const qh = cb;

  // m2law always evaluates SCALE/DPLA (elastic → scale=1, dpla=0).
  {
    let scale = Math.min(1, ak / Math.max(seq, 1e-15));
    const dpla = (1 - scale) * seq / Math.max(3 * mu + qh, 1e-15);
    ak = ak + dpla * qh;
    scale = Math.min(1, ak / Math.max(seq, 1e-15));
    s[0]! *= scale;
    s[1]! *= scale;
    s[2]! *= scale;
    s[3]! *= scale;
    s[4]! *= scale;
    s[5]! *= scale;
    state.eqPlasticStrain += dpla;
  }

  const vol0 = state.vol0 > 0 ? state.vol0 : vol;
  // Radioss mmain / srho3 (LAW2, IRESP=0): RHON = RHO0*(VOLO/VOLN); AMU = RHON/RHO0 − 1.
  // Direct `vol0/vol − 1` differs by ~1 ulp on many volumes and accumulates under adaptive CFL.
  const amu =
    amuOverride ??
    (mat.density * (vol0 / Math.max(vol, 1e-30))) / mat.density - 1;
  const pNew = bulk * amu;
  // m2law: SIG = (SIG - PNEW)*OFF with OFF=1.
  s[0]! = s[0]! - pNew;
  s[1]! = s[1]! - pNew;
  s[2]! = s[2]! - pNew;
}

/** σ:D with Radioss engineering shear rates (no factor 2 on D4..D6). */
export function stressPower(stress: Float64Array, d: Float64Array): number {
  return (
    stress[0]! * d[0]! +
    stress[1]! * d[1]! +
    stress[2]! * d[2]! +
    stress[3]! * d[3]! +
    stress[4]! * d[4]! +
    stress[5]! * d[5]!
  );
}
