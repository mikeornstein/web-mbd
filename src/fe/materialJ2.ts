import type { MaterialJ2Linear } from "../ir/types.js";

/**
 * Per-Gauss-point state matching OpenRadioss LAW2 / M2LAW bookkeeping:
 * Cauchy stress in Voigt (xx,yy,zz,xy,yz,zx) with tensorial shear,
 * equivalent plastic strain, and reference Gauss volume for AMU = V0/V − 1.
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

export function lame(E: number, nu: number): { lam: number; mu: number; bulk: number } {
  const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu));
  const mu = E / (2 * (1 + nu));
  return { lam, mu, bulk: lam + (2 / 3) * mu };
}

export function dilatationalWaveSpeed(mat: MaterialJ2Linear): number {
  const { lam, mu } = lame(mat.young, mat.poisson);
  return Math.sqrt((lam + 2 * mu) / mat.density);
}

/**
 * OpenRadioss M2LAW (LAW2 / PLAS_JOHNS) solid update for one integration point.
 *
 * - Deviatoric hypoelastic predictor with Jaumann already applied by the element
 * - Radial return with isotropic linear hardening (CN=1, CC=0)
 * - Pressure from bulk EOS: P = K * (ρ/ρ0 − 1) = K * (V0/V − 1)
 *
 * Shear components are tensorial (ε_xy); Radioss stores engineering rates D4=2ε_xy
 * and uses G*DT*D4 ≡ 2G*DT*ε_xy — same update.
 */
export function j2Update(
  mat: MaterialJ2Linear,
  state: J2State,
  d: Float64Array,
  dt: number,
  vol: number,
): void {
  const { mu, bulk } = lame(mat.young, mat.poisson);
  const s = state.stress;
  const pOld = -(s[0]! + s[1]! + s[2]!) / 3;
  const dav = -(d[0]! + d[1]! + d[2]!) / 3;
  const g1 = dt * mu;
  const g2 = 2 * g1;

  // Elastic predictor on the shifted (≈deviatoric) stress, Radioss M2LAW style.
  s[0]! += pOld + g2 * (d[0]! + dav);
  s[1]! += pOld + g2 * (d[1]! + dav);
  s[2]! += pOld + g2 * (d[2]! + dav);
  s[3]! += g2 * d[3]!;
  s[4]! += g2 * d[4]!;
  s[5]! += g2 * d[5]!;

  const j2 =
    0.5 * (s[0]! * s[0]! + s[1]! * s[1]! + s[2]! * s[2]!) +
    s[3]! * s[3]! +
    s[4]! * s[4]! +
    s[5]! * s[5]!;
  let seq = Math.sqrt(Math.max(0, 3 * j2));

  const ca = mat.yieldStress;
  const cb = mat.hardeningModulus;
  let ak = ca + cb * state.eqPlasticStrain;
  const qh = cb;

  if (seq > ak && seq > 1e-15) {
    let scale = Math.min(1, ak / seq);
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
  const amu = vol0 / Math.max(vol, 1e-30) - 1;
  const pNew = bulk * amu;
  s[0]! -= pNew;
  s[1]! -= pNew;
  s[2]! -= pNew;
}

export function stressPower(stress: Float64Array, d: Float64Array): number {
  return (
    stress[0]! * d[0]! +
    stress[1]! * d[1]! +
    stress[2]! * d[2]! +
    2 * stress[3]! * d[3]! +
    2 * stress[4]! * d[4]! +
    2 * stress[5]! * d[5]!
  );
}
