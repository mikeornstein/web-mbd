import { percentile } from "./stretchField.js";

/**
 * Quad-centre membrane stretch: isoparametric gradient at ξ=η=0 from all
 * four corners, same in-plane principals and wrinkle clamp as the toy CST.
 * Blind to which diagonal is drawn and to one-triangle sawtooth.
 */

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

function centerEdges(
  coords: ArrayLike<number>,
  i0: number,
  i1: number,
  i2: number,
  i3: number,
): { e1x: number; e1y: number; e1z: number; e2x: number; e2y: number; e2z: number } | null {
  const x0x = coords[i0 * 3]!,
    x0y = coords[i0 * 3 + 1]!,
    x0z = coords[i0 * 3 + 2]!;
  const x1x = coords[i1 * 3]!,
    x1y = coords[i1 * 3 + 1]!,
    x1z = coords[i1 * 3 + 2]!;
  const x2x = coords[i2 * 3]!,
    x2y = coords[i2 * 3 + 1]!,
    x2z = coords[i2 * 3 + 2]!;
  const x3x = coords[i3 * 3]!,
    x3y = coords[i3 * 3 + 1]!,
    x3z = coords[i3 * 3 + 2]!;
  const e1x = 0.25 * (-x0x + x1x + x2x - x3x);
  const e1y = 0.25 * (-x0y + x1y + x2y - x3y);
  const e1z = 0.25 * (-x0z + x1z + x2z - x3z);
  const e2x = 0.25 * (-x0x - x1x + x2x + x3x);
  const e2y = 0.25 * (-x0y - x1y + x2y + x3y);
  const e2z = 0.25 * (-x0z - x1z + x2z + x3z);
  const cx = e1y * e2z - e1z * e2y;
  const cy = e1z * e2x - e1x * e2z;
  const cz = e1x * e2y - e1y * e2x;
  if (Math.hypot(cx, cy, cz) <= 1e-14) return null;
  return { e1x, e1y, e1z, e2x, e2y, e2z };
}

function restInv(e1x: number, e1y: number, e1z: number, e2x: number, e2y: number, e2z: number): readonly [number, number, number, number] | null {
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
  return [r2y / detR, -r2x / detR, -r1y / detR, r1x / detR];
}

function principals(e1x: number, e1y: number, e1z: number, e2x: number, e2y: number, e2z: number, inv: readonly [number, number, number, number]): number {
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
  const tr = C00 + C11;
  const detC = C00 * C11 - C01 * C01;
  const disc = Math.sqrt(Math.max(0, 0.25 * tr * tr - detC));
  let l1sq = Math.max(1e-12, 0.5 * tr + disc);
  let l2sq = Math.max(1e-12, 0.5 * tr - disc);
  if (l1sq < 1) l1sq = 1;
  if (l2sq < 1) l2sq = 1;
  return Math.max(Math.sqrt(l1sq), Math.sqrt(l2sq));
}

export interface QuadAvgRest {
  i0: number;
  i1: number;
  i2: number;
  i3: number;
  inv: readonly [number, number, number, number];
}

export function buildQuadAvgRest(
  restCoords: ArrayLike<number>,
  i0: number,
  i1: number,
  i2: number,
  i3: number,
): QuadAvgRest | null {
  const e = centerEdges(restCoords, i0, i1, i2, i3);
  if (e === null) return null;
  const inv = restInv(e.e1x, e.e1y, e.e1z, e.e2x, e.e2y, e.e2z);
  if (inv === null) return null;
  return { i0, i1, i2, i3, inv };
}

export function quadCenterStretch(coords: ArrayLike<number>, rest: QuadAvgRest): number | null {
  const e = centerEdges(coords, rest.i0, rest.i1, rest.i2, rest.i3);
  if (e === null) return null;
  return principals(e.e1x, e.e1y, e.e1z, e.e2x, e.e2y, e.e2z, rest.inv);
}

export interface QuadAvgStats {
  n: number;
  median: number;
  p95: number;
  max: number;
}

export function quadAvgStatsFromPacked(
  coords: ArrayLike<number>,
  restCoords: ArrayLike<number>,
  quads: ArrayLike<number>,
): QuadAvgStats | null {
  const nq = quads.length / 4;
  const lams: number[] = [];
  let max = -Infinity;
  for (let e = 0; e < nq; e++) {
    const rest = buildQuadAvgRest(restCoords, quads[e * 4]!, quads[e * 4 + 1]!, quads[e * 4 + 2]!, quads[e * 4 + 3]!);
    if (rest === null) continue;
    const lam = quadCenterStretch(coords, rest);
    if (lam === null) continue;
    lams.push(lam);
    if (lam > max) max = lam;
  }
  if (lams.length === 0) return null;
  return { n: lams.length, median: percentile(lams, 0.5), p95: percentile(lams, 0.95), max };
}

export function restsFromPackedQuads(restCoords: ArrayLike<number>, quads: ArrayLike<number>): QuadAvgRest[] {
  const nq = quads.length / 4;
  const out: QuadAvgRest[] = [];
  for (let e = 0; e < nq; e++) {
    const rest = buildQuadAvgRest(restCoords, quads[e * 4]!, quads[e * 4 + 1]!, quads[e * 4 + 2]!, quads[e * 4 + 3]!);
    if (rest) out.push(rest);
  }
  return out;
}

export function quadAvgStatsFromRests(coords: ArrayLike<number>, rests: readonly QuadAvgRest[]): QuadAvgStats | null {
  const lams: number[] = [];
  let max = -Infinity;
  for (const rest of rests) {
    const lam = quadCenterStretch(coords, rest);
    if (lam === null) continue;
    lams.push(lam);
    if (lam > max) max = lam;
  }
  if (lams.length === 0) return null;
  return { n: lams.length, median: percentile(lams, 0.5), p95: percentile(lams, 0.95), max };
}

