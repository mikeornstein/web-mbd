import { H0, MU, NU, RHO } from "../inflate/constants.js";

/**
 * Plane-stress neo-Hookean (Ogden 1-term, α₁=2 ⇒ classical NH).
 * Incompressible condensation: λ₃ = 1/(λ₁ λ₂), I₁ = λ₁² + λ₂² + λ₃²,
 * Ψ = ½ μ (I₁ − 3) per unit rest volume. Membrane: multiply by H0 A0.
 *
 * LAW42 map: μ₁ = MU, α₁ = 2. ν is stored on the law card (Radioss shells)
 * but is not a free parameter of this condensed membrane energy.
 */
export function neoHookeanPsiI1(I1: number, mu: number = MU): number {
  return 0.5 * mu * (I1 - 3);
}

export function membranePsi(I1: number, A0: number, mu: number = MU, h0: number = H0): number {
  return neoHookeanPsiI1(I1, mu) * h0 * A0;
}

/** Dilatational-ish membrane wave speed for CFL (not a μ retune). */
export function membraneWaveSpeed(mu: number = MU, rho: number = RHO, nu: number = NU): number {
  const young = 2 * mu * (1 + nu);
  return Math.sqrt(young / rho);
}

export function restI1PlaneStress(lam1 = 1, lam2 = 1): number {
  const lam3 = 1 / (lam1 * lam2);
  return lam1 * lam1 + lam2 * lam2 + lam3 * lam3;
}
