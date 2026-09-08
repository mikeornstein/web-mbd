import type { MaterialJ2Linear } from "../ir/types.js";

export interface J2State {
  stress: Float64Array;
  eqPlasticStrain: number;
}

export function createJ2State(): J2State {
  return { stress: new Float64Array(6), eqPlasticStrain: 0 };
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

export function j2Update(
  mat: MaterialJ2Linear,
  state: J2State,
  d: Float64Array,
  dt: number,
): void {
  const { lam, mu } = lame(mat.young, mat.poisson);
  const s = state.stress;
  const trD = d[0]! + d[1]! + d[2]!;
  const trial = new Float64Array(6);
  trial[0] = s[0]! + (lam * trD + 2 * mu * d[0]!) * dt;
  trial[1] = s[1]! + (lam * trD + 2 * mu * d[1]!) * dt;
  trial[2] = s[2]! + (lam * trD + 2 * mu * d[2]!) * dt;
  trial[3] = s[3]! + 2 * mu * d[3]! * dt;
  trial[4] = s[4]! + 2 * mu * d[4]! * dt;
  trial[5] = s[5]! + 2 * mu * d[5]! * dt;

  const p = (trial[0]! + trial[1]! + trial[2]!) / 3;
  const dev = [
    trial[0]! - p,
    trial[1]! - p,
    trial[2]! - p,
    trial[3]!,
    trial[4]!,
    trial[5]!,
  ];
  const j2 =
    0.5 *
    (dev[0]! * dev[0]! +
      dev[1]! * dev[1]! +
      dev[2]! * dev[2]! +
      2 * (dev[3]! * dev[3]! + dev[4]! * dev[4]! + dev[5]! * dev[5]!));
  const seq = Math.sqrt(Math.max(0, 3 * j2));
  const syield = mat.yieldStress + mat.hardeningModulus * state.eqPlasticStrain;

  if (seq <= syield || seq < 1e-14) {
    s.set(trial);
    return;
  }

  const dLambda = (seq - syield) / (3 * mu + mat.hardeningModulus);
  const scale = 1 - (3 * mu * dLambda) / seq;
  s[0] = p + dev[0]! * scale;
  s[1] = p + dev[1]! * scale;
  s[2] = p + dev[2]! * scale;
  s[3] = dev[3]! * scale;
  s[4] = dev[4]! * scale;
  s[5] = dev[5]! * scale;
  state.eqPlasticStrain += dLambda;
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
