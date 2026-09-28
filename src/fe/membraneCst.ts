import { H0, MU } from "../inflate/constants.js";

export interface CstRest {
  i: number;
  j: number;
  k: number;
  A0: number;
  /** Inverse of rest 2×2 [r1 r2] in the local tangent basis. */
  inv: readonly [number, number, number, number];
}

export interface MembraneSample {
  lam1: number;
  lam2: number;
  lam3: number;
  I1: number;
  W: number;
  incompressResidual: number;
}

function orthonormal(nx: number, ny: number, nz: number): { t: [number, number, number]; b: [number, number, number] } {
  const ax = Math.abs(nx),
    ay = Math.abs(ny),
    az = Math.abs(nz);
  let ux: number, uy: number, uz: number;
  if (ax <= ay && ax <= az) {
    ux = 0;
    uy = -nz;
    uz = ny;
  } else if (ay <= az) {
    ux = -nz;
    uy = 0;
    uz = nx;
  } else {
    ux = -ny;
    uy = nx;
    uz = 0;
  }
  const ul = Math.hypot(ux, uy, uz);
  const t: [number, number, number] = [ux / ul, uy / ul, uz / ul];
  const b: [number, number, number] = [
    ny * t[2] - nz * t[1],
    nz * t[0] - nx * t[2],
    nx * t[1] - ny * t[0],
  ];
  const bl = Math.hypot(b[0], b[1], b[2]);
  b[0] /= bl;
  b[1] /= bl;
  b[2] /= bl;
  return { t, b };
}

/** Rest CST for a triangle in the undeformed midplane. */
export function buildCstRest(
  coords0: ArrayLike<number>,
  i: number,
  j: number,
  k: number,
): CstRest | null {
  const p0x = coords0[i * 3]!,
    p0y = coords0[i * 3 + 1]!,
    p0z = coords0[i * 3 + 2]!;
  const p1x = coords0[j * 3]!,
    p1y = coords0[j * 3 + 1]!,
    p1z = coords0[j * 3 + 2]!;
  const p2x = coords0[k * 3]!,
    p2y = coords0[k * 3 + 1]!,
    p2z = coords0[k * 3 + 2]!;
  const e1x = p1x - p0x,
    e1y = p1y - p0y,
    e1z = p1z - p0z;
  const e2x = p2x - p0x,
    e2y = p2y - p0y,
    e2z = p2z - p0z;
  const cx = e1y * e2z - e1z * e2y;
  const cy = e1z * e2x - e1x * e2z;
  const cz = e1x * e2y - e1y * e2x;
  const cl = Math.hypot(cx, cy, cz);
  if (cl <= 1e-14) return null;
  const { t, b } = orthonormal(cx / cl, cy / cl, cz / cl);
  const r1x = e1x * t[0] + e1y * t[1] + e1z * t[2];
  const r1y = e1x * b[0] + e1y * b[1] + e1z * b[2];
  const r2x = e2x * t[0] + e2y * t[1] + e2z * t[2];
  const r2y = e2x * b[0] + e2y * b[1] + e2z * b[2];
  const detR = r1x * r2y - r1y * r2x;
  if (!Number.isFinite(detR) || Math.abs(detR) < 1e-18) return null;
  return {
    i,
    j,
    k,
    A0: 0.5 * Math.abs(detR),
    inv: [r2y / detR, -r2x / detR, -r1y / detR, r1x / detR],
  };
}

/**
 * Plane-stress neo-Hookean on a CST: λ3 = 1/(λ1 λ2), Ψ = ½ μ (I1−3) H0 A0.
 * Wrinkle clamp: in-plane compression (λ² < 1) is killed, not a contact substitute.
 */
export function cstSample(
  coords: ArrayLike<number>,
  rest: CstRest,
  mu: number = MU,
  h0: number = H0,
): MembraneSample {
  const { i, j, k, A0, inv } = rest;
  const x0x = coords[i * 3]!,
    x0y = coords[i * 3 + 1]!,
    x0z = coords[i * 3 + 2]!;
  const x1x = coords[j * 3]!,
    x1y = coords[j * 3 + 1]!,
    x1z = coords[j * 3 + 2]!;
  const x2x = coords[k * 3]!,
    x2y = coords[k * 3 + 1]!,
    x2z = coords[k * 3 + 2]!;
  const e1x = x1x - x0x,
    e1y = x1y - x0y,
    e1z = x1z - x0z;
  const e2x = x2x - x0x,
    e2y = x2y - x0y,
    e2z = x2z - x0z;
  const F = deformGradient(e1x, e1y, e1z, e2x, e2y, e2z, inv);
  const { lam1, lam2 } = principalStretches(F, true);
  const lam3 = 1 / (lam1 * lam2);
  const I1 = lam1 * lam1 + lam2 * lam2 + lam3 * lam3;
  const W = 0.5 * mu * (I1 - 3) * h0 * A0;
  return {
    lam1,
    lam2,
    lam3,
    I1,
    W,
    incompressResidual: Math.abs(lam1 * lam2 * lam3 - 1),
  };
}

interface DeformF {
  F00: number;
  F01: number;
  F10: number;
  F11: number;
  F20: number;
  F21: number;
  C00: number;
  C01: number;
  C11: number;
}

function deformGradient(
  e1x: number,
  e1y: number,
  e1z: number,
  e2x: number,
  e2y: number,
  e2z: number,
  inv: readonly [number, number, number, number],
): DeformF {
  const i00 = inv[0],
    i01 = inv[1],
    i10 = inv[2],
    i11 = inv[3];
  const F00 = e1x * i00 + e2x * i10;
  const F01 = e1x * i01 + e2x * i11;
  const F10 = e1y * i00 + e2y * i10;
  const F11 = e1y * i01 + e2y * i11;
  const F20 = e1z * i00 + e2z * i10;
  const F21 = e1z * i01 + e2z * i11;
  const C00 = F00 * F00 + F10 * F10 + F20 * F20;
  const C01 = F00 * F01 + F10 * F11 + F20 * F21;
  const C11 = F01 * F01 + F11 * F11 + F21 * F21;
  return { F00, F01, F10, F11, F20, F21, C00, C01, C11 };
}

function principalStretches(F: DeformF, wrinkleClamp: boolean): { lam1: number; lam2: number; wr1: boolean; wr2: boolean } {
  const { C00, C01, C11 } = F;
  const tr = C00 + C11;
  const detC = C00 * C11 - C01 * C01;
  const disc = Math.sqrt(Math.max(0, 0.25 * tr * tr - detC));
  let l1sq = Math.max(1e-12, 0.5 * tr + disc);
  let l2sq = Math.max(1e-12, 0.5 * tr - disc);
  const wr1 = l1sq < 1;
  const wr2 = l2sq < 1;
  if (wrinkleClamp) {
    if (wr1) l1sq = 1;
    if (wr2) l2sq = 1;
  }
  return { lam1: Math.sqrt(l1sq), lam2: Math.sqrt(l2sq), wr1, wr2 };
}

/**
 * Analytic −∂Ψ/∂x for one CST (forces into `f` with +f = −∂Ψ/∂x).
 * dW/dλ = μ H0 A0 (λ − λ3²/λ) from W = ½ μ (I1−3) H0 A0.
 */
export function accumulateCstForces(
  coords: ArrayLike<number>,
  rest: CstRest,
  f: Float64Array,
  mu: number = MU,
  h0: number = H0,
): { lam1: number; lam2: number } {
  const { i, j, k, A0, inv } = rest;
  const x0x = coords[i * 3]!,
    x0y = coords[i * 3 + 1]!,
    x0z = coords[i * 3 + 2]!;
  const x1x = coords[j * 3]!,
    x1y = coords[j * 3 + 1]!,
    x1z = coords[j * 3 + 2]!;
  const x2x = coords[k * 3]!,
    x2y = coords[k * 3 + 1]!,
    x2z = coords[k * 3 + 2]!;
  const e1x = x1x - x0x,
    e1y = x1y - x0y,
    e1z = x1z - x0z;
  const e2x = x2x - x0x,
    e2y = x2y - x0y,
    e2z = x2z - x0z;
  const F = deformGradient(e1x, e1y, e1z, e2x, e2y, e2z, inv);
  const { lam1, lam2, wr1, wr2 } = principalStretches(F, true);
  const scaleW = mu * h0;
  const lam3 = 1 / (lam1 * lam2);
  const dWd1 = scaleW * A0 * (lam1 - (lam3 * lam3) / lam1);
  const dWd2 = scaleW * A0 * (lam2 - (lam3 * lam3) / lam2);
  const dlam1_dlsq = wr1 ? 0 : 1 / (2 * lam1);
  const dlam2_dlsq = wr2 ? 0 : 1 / (2 * lam2);
  const dW_dl1sq = dWd1 * dlam1_dlsq;
  const dW_dl2sq = dWd2 * dlam2_dlsq;
  const { C00, C01, C11 } = F;
  const tr = C00 + C11;
  const detC = C00 * C11 - C01 * C01;
  const disc = Math.sqrt(Math.max(0, 0.25 * tr * tr - detC));
  let dDisc_dC00 = 0,
    dDisc_dC11 = 0,
    dDisc_dC01 = 0;
  if (disc > 1e-14) {
    const inv2d = 1 / (2 * disc);
    dDisc_dC00 = inv2d * (0.5 * tr - C11);
    dDisc_dC11 = inv2d * (0.5 * tr - C00);
    dDisc_dC01 = inv2d * (2 * C01);
  }
  const S00 = dW_dl1sq * (0.5 + dDisc_dC00) + dW_dl2sq * (0.5 - dDisc_dC00);
  const S11 = dW_dl1sq * (0.5 + dDisc_dC11) + dW_dl2sq * (0.5 - dDisc_dC11);
  const S01 = dW_dl1sq * dDisc_dC01 + dW_dl2sq * -dDisc_dC01;
  const { F00, F01, F10, F11, F20, F21 } = F;
  const P00 = 2 * F00 * S00 + F01 * S01;
  const P01 = F00 * S01 + 2 * F01 * S11;
  const P10 = 2 * F10 * S00 + F11 * S01;
  const P11 = F10 * S01 + 2 * F11 * S11;
  const P20 = 2 * F20 * S00 + F21 * S01;
  const P21 = F20 * S01 + 2 * F21 * S11;
  const i00 = inv[0],
    i01 = inv[1],
    i10 = inv[2],
    i11 = inv[3];
  const g1x = P00 * i00 + P01 * i01,
    g1y = P10 * i00 + P11 * i01,
    g1z = P20 * i00 + P21 * i01;
  const g2x = P00 * i10 + P01 * i11,
    g2y = P10 * i10 + P11 * i11,
    g2z = P20 * i10 + P21 * i11;
  // +f = −∂W/∂x. node i gets −(−g1−g2) wait:
  // W depends on e1=x_j-x_i, e2=x_k-x_i.
  // ∂W/∂x_j = g1, ∂W/∂x_k = g2, ∂W/∂x_i = −g1−g2.
  // force = −∂W/∂x.
  f[i * 3]! += g1x + g2x;
  f[i * 3 + 1]! += g1y + g2y;
  f[i * 3 + 2]! += g1z + g2z;
  f[j * 3]! -= g1x;
  f[j * 3 + 1]! -= g1y;
  f[j * 3 + 2]! -= g1z;
  f[k * 3]! -= g2x;
  f[k * 3 + 1]! -= g2y;
  f[k * 3 + 2]! -= g2z;
  return { lam1, lam2 };
}

/** Follower pressure consistent with V = Σ a·(b×c)/6: f = p ∂V/∂x. */
export function accumulatePressureTri(
  coords: ArrayLike<number>,
  i: number,
  j: number,
  k: number,
  p: number,
  f: Float64Array,
): void {
  const s = p / 6;
  const xi = coords[i * 3]!,
    yi = coords[i * 3 + 1]!,
    zi = coords[i * 3 + 2]!;
  const xj = coords[j * 3]!,
    yj = coords[j * 3 + 1]!,
    zj = coords[j * 3 + 2]!;
  const xk = coords[k * 3]!,
    yk = coords[k * 3 + 1]!,
    zk = coords[k * 3 + 2]!;
  f[i * 3]! += s * (yj * zk - zj * yk);
  f[i * 3 + 1]! += s * (zj * xk - xj * zk);
  f[i * 3 + 2]! += s * (xj * yk - yj * xk);
  f[j * 3]! += s * (yk * zi - zk * yi);
  f[j * 3 + 1]! += s * (zk * xi - xk * zi);
  f[j * 3 + 2]! += s * (xk * yi - yk * xi);
  f[k * 3]! += s * (yi * zj - zi * yj);
  f[k * 3 + 1]! += s * (zi * xj - xi * zj);
  f[k * 3 + 2]! += s * (xi * yj - yi * xj);
}

export function splitQuadCsts(
  coords0: ArrayLike<number>,
  i0: number,
  i1: number,
  i2: number,
  i3: number,
): { a: CstRest; b: CstRest } | null {
  const a = buildCstRest(coords0, i0, i1, i2);
  const b = buildCstRest(coords0, i0, i2, i3);
  if (!a || !b) return null;
  return { a, b };
}
