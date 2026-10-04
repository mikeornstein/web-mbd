import { buildCstRest, cstSample, splitQuadCsts } from "../fe/membraneCst.js";
import { H0, MU } from "../inflate/constants.js";

export interface QuadStretch {
  quadIndex: number;
  elementId: number;
  nodes: [number, number, number, number];
  restCentroid: [number, number, number];
  region: string;
  lamTriA: number;
  lamTriB: number;
  lam: number;
  area0: number;
}

export interface StretchStats {
  n: number;
  max: number;
  min: number;
  mean: number;
  areaWeightedMean: number;
  p50: number;
  p95: number;
  p99: number;
  maxIndex: number;
}

export function letterRegion(x: number, y: number, z: number): string {
  const ns = y > 0.02 ? "upper" : y < -0.02 ? "lower" : "middle";
  const ew = x > 0.015 ? "right" : x < -0.015 ? "left" : "center";
  const face = z > 0.005 ? "front-face" : z < -0.005 ? "back-face" : "mid-thickness";
  return `${ns} ${ew} ${face}`;
}

export function lerpCoords(a: ArrayLike<number>, b: ArrayLike<number>, t0: number, t1: number, t: number): Float64Array {
  if (a.length !== b.length) throw new Error("lerpCoords length mismatch");
  if (t1 === t0) return Float64Array.from(a);
  const w = (t - t0) / (t1 - t0);
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i]! + w * (b[i]! - a[i]!);
  }
  return out;
}

/** Linear percentile on a copy (same rule as typical numpy default). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of empty list");
  const s = values.slice().sort((x, y) => x - y);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const a = s[lo]!;
  const b = s[hi]!;
  if (lo === hi) return a;
  return a * (hi - idx) + b * (idx - lo);
}

export function stretchStats(field: readonly QuadStretch[]): StretchStats {
  if (field.length === 0) throw new Error("empty stretch field");
  const lams = field.map((q) => q.lam);
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let areaSum = 0;
  let areaLam = 0;
  let maxIndex = 0;
  for (let i = 0; i < field.length; i++) {
    const q = field[i]!;
    sum += q.lam;
    areaSum += q.area0;
    areaLam += q.lam * q.area0;
    if (q.lam > max) {
      max = q.lam;
      maxIndex = i;
    }
    if (q.lam < min) min = q.lam;
  }
  return {
    n: field.length,
    max,
    min,
    mean: sum / field.length,
    areaWeightedMean: areaLam / areaSum,
    p50: percentile(lams, 0.5),
    p95: percentile(lams, 0.95),
    p99: percentile(lams, 0.99),
    maxIndex,
  };
}

/**
 * Per-quad membrane stretch: each four-node shell is split on diagonal 0–2
 * into two constant-strain triangles. Rest is `restCoords`. Current is
 * `coords`. Principal in-plane stretches of the 3-D deformation gradient,
 * with wrinkle clamp (compressed in-plane stretch raised to 1). The quad
 * value is the max of the two triangles' max(λ1, λ2). Same formula the toy
 * uses in inflateSolver measure().
 */
export function stretchFieldFromCoords(
  coords: ArrayLike<number>,
  restCoords: ArrayLike<number>,
  quads: ArrayLike<number>,
  elementIds?: ArrayLike<number>,
): QuadStretch[] {
  const nq = quads.length / 4;
  const out: QuadStretch[] = [];
  for (let e = 0; e < nq; e++) {
    const i0 = quads[e * 4]!;
    const i1 = quads[e * 4 + 1]!;
    const i2 = quads[e * 4 + 2]!;
    const i3 = quads[e * 4 + 3]!;
    const pair = splitQuadCsts(restCoords, i0, i1, i2, i3);
    if (!pair) continue;
    const a = cstSample(coords, pair.a, MU, H0);
    const b = cstSample(coords, pair.b, MU, H0);
    const lamA = Math.max(a.lam1, a.lam2);
    const lamB = Math.max(b.lam1, b.lam2);
    const cx = (restCoords[i0 * 3]! + restCoords[i1 * 3]! + restCoords[i2 * 3]! + restCoords[i3 * 3]!) / 4;
    const cy =
      (restCoords[i0 * 3 + 1]! + restCoords[i1 * 3 + 1]! + restCoords[i2 * 3 + 1]! + restCoords[i3 * 3 + 1]!) / 4;
    const cz =
      (restCoords[i0 * 3 + 2]! + restCoords[i1 * 3 + 2]! + restCoords[i2 * 3 + 2]! + restCoords[i3 * 3 + 2]!) / 4;
    const elementId = elementIds !== undefined ? elementIds[e]! : e;
    out.push({
      quadIndex: e,
      elementId,
      nodes: [i0, i1, i2, i3],
      restCentroid: [cx, cy, cz],
      region: letterRegion(cx, cy, cz),
      lamTriA: lamA,
      lamTriB: lamB,
      lam: Math.max(lamA, lamB),
      area0: pair.a.A0 + pair.b.A0,
    });
  }
  return out;
}

/**
 * Per-shell stretch on mixed three- and four-node connectivity.
 * Four-node shells use splitQuadCsts (diagonal 0–2). Three-node shells use
 * one cstSample. Same principal-stretch formula as the toy.
 */
export function stretchFieldFromShells(
  coords: ArrayLike<number>,
  restCoords: ArrayLike<number>,
  shells: readonly number[][],
  elementIds?: ArrayLike<number>,
): QuadStretch[] {
  const out: QuadStretch[] = [];
  for (let e = 0; e < shells.length; e++) {
    const nodes = shells[e]!;
    const elementId = elementIds !== undefined ? elementIds[e]! : e;
    if (nodes.length === 4 && nodes[2] !== nodes[3]) {
      const i0 = nodes[0]!;
      const i1 = nodes[1]!;
      const i2 = nodes[2]!;
      const i3 = nodes[3]!;
      const pair = splitQuadCsts(restCoords, i0, i1, i2, i3);
      if (!pair) continue;
      const a = cstSample(coords, pair.a, MU, H0);
      const b = cstSample(coords, pair.b, MU, H0);
      const lamA = Math.max(a.lam1, a.lam2);
      const lamB = Math.max(b.lam1, b.lam2);
      const cx = (restCoords[i0 * 3]! + restCoords[i1 * 3]! + restCoords[i2 * 3]! + restCoords[i3 * 3]!) / 4;
      const cy =
        (restCoords[i0 * 3 + 1]! + restCoords[i1 * 3 + 1]! + restCoords[i2 * 3 + 1]! + restCoords[i3 * 3 + 1]!) / 4;
      const cz =
        (restCoords[i0 * 3 + 2]! + restCoords[i1 * 3 + 2]! + restCoords[i2 * 3 + 2]! + restCoords[i3 * 3 + 2]!) / 4;
      out.push({
        quadIndex: e,
        elementId,
        nodes: [i0, i1, i2, i3],
        restCentroid: [cx, cy, cz],
        region: letterRegion(cx, cy, cz),
        lamTriA: lamA,
        lamTriB: lamB,
        lam: Math.max(lamA, lamB),
        area0: pair.a.A0 + pair.b.A0,
      });
      continue;
    }
    if (nodes.length === 3 || (nodes.length === 4 && nodes[2] === nodes[3])) {
      const i0 = nodes[0]!;
      const i1 = nodes[1]!;
      const i2 = nodes[2]!;
      const rest = buildCstRest(restCoords, i0, i1, i2);
      if (!rest) continue;
      const s = cstSample(coords, rest, MU, H0);
      const lam = Math.max(s.lam1, s.lam2);
      const cx = (restCoords[i0 * 3]! + restCoords[i1 * 3]! + restCoords[i2 * 3]!) / 3;
      const cy = (restCoords[i0 * 3 + 1]! + restCoords[i1 * 3 + 1]! + restCoords[i2 * 3 + 1]!) / 3;
      const cz = (restCoords[i0 * 3 + 2]! + restCoords[i1 * 3 + 2]! + restCoords[i2 * 3 + 2]!) / 3;
      out.push({
        quadIndex: e,
        elementId,
        nodes: [i0, i1, i2, i2],
        restCentroid: [cx, cy, cz],
        region: letterRegion(cx, cy, cz),
        lamTriA: lam,
        lamTriB: lam,
        lam,
        area0: rest.A0,
      });
    }
  }
  return out;
}

export function nearestShellIndex(
  field: readonly QuadStretch[],
  xyz: readonly [number, number, number],
): number {
  if (field.length === 0) throw new Error("nearestShellIndex of empty field");
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < field.length; i++) {
    const c = field[i]!.restCentroid;
    const d =
      (c[0] - xyz[0]) * (c[0] - xyz[0]) +
      (c[1] - xyz[1]) * (c[1] - xyz[1]) +
      (c[2] - xyz[2]) * (c[2] - xyz[2]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function quadKey(nodes: readonly [number, number, number, number]): string {
  return [nodes[0], nodes[1], nodes[2], nodes[3]].slice().sort((a, b) => a - b).join(",");
}

export function indexByNodeKey(field: readonly QuadStretch[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < field.length; i++) {
    m.set(quadKey(field[i]!.nodes), i);
  }
  return m;
}

export function relErr(ours: number, gold: number): number {
  return Math.abs(ours - gold) / Math.max(Math.abs(gold), 1e-30);
}
