import { H0, MU, NU, RHO } from "../inflate/constants.js";

/**
 * OpenRadioss Belytschko Q4 hourglass (`chvis3.F` + `cderi3.F` + `cevec3.F` +
 * `cfint3.F` + `cupdt3.F`). QS assemble only. Translational modes; no
 * rotational HOUR(4/5) — the toy has no drilling/bending DOFs.
 *
 * Coefficients are the Ishell=1 blank-PROP defaults, not a gain table:
 * - `HELAS=HALF HVISC=HALF HVLIN=ZERO` (`radioss2.F`)
 * - `Hm=Hf=Hr=EM02` (`hm_read_prop01.F` IHBE≠3)
 * - `AREA_SHEAR=FIVE_OVER_6` (`hm_read_prop01.F` GEO(38); NIP unspecified ≠ 1)
 * - `YM = GS*(1+ν)` with `GS=μ₁α₁` (`hm_read_mat42.F` PARMAT(2))
 */

/** `radioss2.F` after INIPAR. */
export const HELAS = 0.5;
export const HVISC = 0.5;
export const HVLIN = 0;

/** `hm_read_prop01.F`: IHBE≠3 blank Hm/Hf/Hr → EM02. Ishell=1. */
export const PROP_HM = 0.01;
export const PROP_HF = 0.01;

/** `GEO(38)` default `FIVE_OVER_6` when NIP is not 1. */
export const AREA_SHEAR = 5 / 6;

const EM20 = 1e-20;

export interface HourglassState {
  hour1: number;
  hour2: number;
  hour3: number;
}

export function createHourglassState(): HourglassState {
  return { hour1: 0, hour2: 0, hour3: 0 };
}

/** LAW42 PARMAT(2) = GS*(1+ν), GS = μ₁α₁ = 2μ. */
export function law42Young(mu: number = MU, nu: number = NU): number {
  return 2 * mu * (1 + nu);
}

function cevec3(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  x3: number,
  y3: number,
  z3: number,
): {
  e1x: number;
  e1y: number;
  e1z: number;
  e2x: number;
  e2y: number;
  e2z: number;
  e3x: number;
  e3y: number;
  e3z: number;
} | null {
  const x21 = x1 - x0,
    y21 = y1 - y0,
    z21 = z1 - z0;
  const x31 = x2 - x0,
    y31 = y2 - y0,
    z31 = z2 - z0;
  const x42 = x3 - x1,
    y42 = y3 - y1,
    z42 = z3 - z1;
  let e3x = y31 * z42 - z31 * y42;
  let e3y = z31 * x42 - x31 * z42;
  let e3z = x31 * y42 - y31 * x42;
  const n = Math.hypot(e3x, e3y, e3z);
  if (!(n > EM20)) return null;
  e3x /= n;
  e3y /= n;
  e3z /= n;
  const s = x21 * e3x + y21 * e3y + z21 * e3z;
  let e1x = x21 - e3x * s,
    e1y = y21 - e3y * s,
    e1z = z21 - e3z * s;
  const t = Math.hypot(e1x, e1y, e1z);
  if (!(t > EM20)) return null;
  e1x /= t;
  e1y /= t;
  e1z /= t;
  let e2x = e3y * e1z - e3z * e1y,
    e2y = e3z * e1x - e3x * e1z,
    e2z = e3x * e1y - e3y * e1x;
  const b = Math.hypot(e2x, e2y, e2z);
  if (!(b > EM20)) return null;
  e2x /= b;
  e2y /= b;
  e2z /= b;
  return { e1x, e1y, e1z, e2x, e2y, e2z, e3x, e3y, e3z };
}

/**
 * CHVIS3 membrane (HOUR 1,2) + flexural (HOUR 3) forces on a Q4.
 * CUPDT3 sign: global F -= H, matching Newton f = −∂W/∂x on the toy.
 * Ismstr=10, IHBE=1 → GAMA from PX/PY/VHX/VHY. Ithick=1 → THK = H0 A0/AREA.
 * Returns the CHVIS3 EHOU increment (DT * force·HG).
 */
export function accumulateChvis3Forces(
  coords: ArrayLike<number>,
  velocities: ArrayLike<number>,
  i0: number,
  i1: number,
  i2: number,
  i3: number,
  a0: number,
  state: HourglassState,
  dt: number,
  f: Float64Array,
  mu: number = MU,
  rho: number = RHO,
  nu: number = NU,
  h0: number = H0,
): number {
  if (!(dt > 0) || i2 === i3) return 0;
  const a = i0 * 3,
    b = i1 * 3,
    c = i2 * 3,
    d = i3 * 3;
  const x0 = coords[a]!,
    y0 = coords[a + 1]!,
    z0 = coords[a + 2]!;
  const x1 = coords[b]!,
    y1 = coords[b + 1]!,
    z1 = coords[b + 2]!;
  const x2 = coords[c]!,
    y2 = coords[c + 1]!,
    z2 = coords[c + 2]!;
  const x3 = coords[d]!,
    y3 = coords[d + 1]!,
    z3 = coords[d + 2]!;
  const basis = cevec3(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3);
  if (!basis) return 0;
  const { e1x, e1y, e1z, e2x, e2y, e2z, e3x, e3y, e3z } = basis;

  const p2x = x1 - x0,
    p2y = y1 - y0,
    p2z = z1 - z0;
  const p3x = x2 - x0,
    p3y = y2 - y0,
    p3z = z2 - z0;
  const p4x = x3 - x0,
    p4y = y3 - y0,
    p4z = z3 - z0;
  const X2 = e1x * p2x + e1y * p2y + e1z * p2z;
  const Y2 = e2x * p2x + e2y * p2y + e2z * p2z;
  const X3 = e1x * p3x + e1y * p3y + e1z * p3z;
  const Y3 = e2x * p3x + e2y * p3y + e2z * p3z;
  const X4 = e1x * p4x + e1y * p4y + e1z * p4z;
  const Y4 = e2x * p4x + e2y * p4y + e2z * p4z;

  const px1 = 0.5 * (Y2 - Y4);
  const py1 = 0.5 * (X4 - X2);
  const px2 = 0.5 * Y3;
  const py2 = -0.5 * X3;
  const area = Math.max(2 * (py2 * px1 - py1 * px2), EM20);
  const vhx = (-X2 + X3 - X4) / area;
  const vhy = (-Y2 + Y3 - Y4) / area;

  const vx0 = velocities[a]!,
    vy0 = velocities[a + 1]!,
    vz0 = velocities[a + 2]!;
  const vx1 = velocities[b]!,
    vy1 = velocities[b + 1]!,
    vz1 = velocities[b + 2]!;
  const vx2 = velocities[c]!,
    vy2 = velocities[c + 1]!,
    vz2 = velocities[c + 2]!;
  const vx3 = velocities[d]!,
    vy3 = velocities[d + 1]!,
    vz3 = velocities[d + 2]!;
  const VX1 = e1x * vx0 + e1y * vy0 + e1z * vz0;
  const VY1 = e2x * vx0 + e2y * vy0 + e2z * vz0;
  const VZ1 = e3x * vx0 + e3y * vy0 + e3z * vz0;
  const VX2 = e1x * vx1 + e1y * vy1 + e1z * vz1;
  const VY2 = e2x * vx1 + e2y * vy1 + e2z * vz1;
  const VZ2 = e3x * vx1 + e3y * vy1 + e3z * vz1;
  const VX3 = e1x * vx2 + e1y * vy2 + e1z * vz2;
  const VY3 = e2x * vx2 + e2y * vy2 + e2z * vz2;
  const VZ3 = e3x * vx2 + e3y * vy2 + e3z * vz2;
  const VX4 = e1x * vx3 + e1y * vy3 + e1z * vz3;
  const VY4 = e2x * vx3 + e2y * vy3 + e2z * vz3;
  const VZ4 = e3x * vx3 + e3y * vy3 + e3z * vz3;

  const px1v = px1 * vhx;
  const px2v = px2 * vhx;
  const py1v = py1 * vhy;
  const py2v = py2 * vhy;
  const gama1 = 1 - px1v - py1v;
  const gama3 = 1 + px1v + py1v;
  const gama2 = -1 - px2v - py2v;
  const gama4 = -1 + px2v + py2v;

  const thk = h0 * a0 / area;
  const thk02 = thk * thk;
  const ym = law42Young(mu, nu);
  const shfpr3 = AREA_SHEAR / (3 * (1 + nu));
  const r1 = 0.25 * rho * 100;
  const a1 = r1 * HVISC * PROP_HM;
  const a3 = r1 * HVISC * PROP_HF * Math.sqrt(Math.max(shfpr3, 0));
  const r0ym = 0.25 * ym * HELAS;
  const a7 = PROP_HM * r0ym;
  const a8 = PROP_HF * r0ym * shfpr3;
  const tsa = Math.sqrt(Math.max(thk02 * area, 0));
  const h1q = a1 * tsa;
  const h1l = 0;
  const h2q = a3 * thk02;
  const h2l = 0;
  const hh1 = a7 * thk * dt;
  const b1 = px1 * px1 + py1 * py1;
  const b2 = px2 * px2 + py2 * py2;
  const hh2 = (a8 * thk02 * thk * dt) / Math.max(b1 + b2, EM20);

  const hg1m = VX1 * gama1 + VX2 * gama2 + VX3 * gama3 + VX4 * gama4;
  const hg2m = VY1 * gama1 + VY2 * gama2 + VY3 * gama3 + VY4 * gama4;
  state.hour1 += hg1m * hh1;
  state.hour2 += hg2m * hh1;
  const hour1a = state.hour1 + hg1m * (h1l + h1q * Math.abs(hg1m));
  const hour2a = state.hour2 + hg2m * (h1l + h1q * Math.abs(hg2m));
  const h11 = hour1a * gama1;
  const h12 = hour1a * gama2;
  const h13 = hour1a * gama3;
  const h14 = hour1a * gama4;
  const h21 = hour2a * gama1;
  const h22 = hour2a * gama2;
  const h23 = hour2a * gama3;
  const h24 = hour2a * gama4;

  const hg1b = VZ1 * gama1 + VZ2 * gama2 + VZ3 * gama3 + VZ4 * gama4;
  state.hour3 += hg1b * hh2;
  const hour3a = state.hour3 + hg1b * (h2l + h2q * Math.abs(hg1b));
  const h31 = hour3a * gama1;
  const h32 = hour3a * gama2;
  const h33 = hour3a * gama3;
  const h34 = hour3a * gama4;

  const f1x = e1x * h11 + e2x * h21 + e3x * h31;
  const f1y = e1y * h11 + e2y * h21 + e3y * h31;
  const f1z = e1z * h11 + e2z * h21 + e3z * h31;
  const f2x = e1x * h12 + e2x * h22 + e3x * h32;
  const f2y = e1y * h12 + e2y * h22 + e3y * h32;
  const f2z = e1z * h12 + e2z * h22 + e3z * h32;
  const f3x = e1x * h13 + e2x * h23 + e3x * h33;
  const f3y = e1y * h13 + e2y * h23 + e3y * h33;
  const f3z = e1z * h13 + e2z * h23 + e3z * h33;
  const f4x = e1x * h14 + e2x * h24 + e3x * h34;
  const f4y = e1y * h14 + e2y * h24 + e3y * h34;
  const f4z = e1z * h14 + e2z * h24 + e3z * h34;

  f[a]! -= f1x;
  f[a + 1]! -= f1y;
  f[a + 2]! -= f1z;
  f[b]! -= f2x;
  f[b + 1]! -= f2y;
  f[b + 2]! -= f2z;
  f[c]! -= f3x;
  f[c + 1]! -= f3y;
  f[c + 2]! -= f3z;
  f[d]! -= f4x;
  f[d + 1]! -= f4y;
  f[d + 2]! -= f4z;

  return dt * (hour1a * hg1m + hour2a * hg2m + hour3a * hg1b);
}

/** CHVIS3 coefficient snapshot for a rectangular Q4 (VHX=VHY=0). Test lock. */
export function chvis3RectCoeffs(
  side: number,
  dt: number,
  mu: number = MU,
  rho: number = RHO,
  nu: number = NU,
  h0: number = H0,
): { hh1: number; h1q: number; hh2: number; h2q: number; area: number } {
  const area = side * side;
  const thk = h0;
  const thk02 = thk * thk;
  const ym = law42Young(mu, nu);
  const shfpr3 = AREA_SHEAR / (3 * (1 + nu));
  const r1 = 0.25 * rho * 100;
  const a1 = r1 * HVISC * PROP_HM;
  const a3 = r1 * HVISC * PROP_HF * Math.sqrt(Math.max(shfpr3, 0));
  const r0ym = 0.25 * ym * HELAS;
  const a7 = PROP_HM * r0ym;
  const a8 = PROP_HF * r0ym * shfpr3;
  const tsa = Math.sqrt(thk02 * area);
  const px1 = -0.5 * side;
  const py1 = -0.5 * side;
  const px2 = 0.5 * side;
  const py2 = -0.5 * side;
  const b1 = px1 * px1 + py1 * py1;
  const b2 = px2 * px2 + py2 * py2;
  return {
    hh1: a7 * thk * dt,
    h1q: a1 * tsa,
    hh2: (a8 * thk02 * thk * dt) / (b1 + b2),
    h2q: a3 * thk02,
    area,
  };
}
