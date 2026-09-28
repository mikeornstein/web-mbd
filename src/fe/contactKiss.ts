import { CONTACT_ENGAGE, CONTACT_KISS } from "../inflate/constants.js";

/** Packed undirected skip pairs: (min<<32)|max is too big for 32-bit; use string keys. */
export function buildMeshAdjacency(quads: ArrayLike<number>, nNodes: number): Set<string> {
  const adj = new Map<number, Set<number>>();
  const add = (a: number, b: number): void => {
    if (a === b) return;
    let sa = adj.get(a);
    if (!sa) {
      sa = new Set();
      adj.set(a, sa);
    }
    sa.add(b);
    let sb = adj.get(b);
    if (!sb) {
      sb = new Set();
      adj.set(b, sb);
    }
    sb.add(a);
  };
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    const a = quads[e * 4]!,
      b = quads[e * 4 + 1]!,
      c = quads[e * 4 + 2]!,
      d = quads[e * 4 + 3]!;
    add(a, b);
    add(b, c);
    add(c, d);
    add(d, a);
  }
  const skip = new Set<string>();
  for (let i = 0; i < nNodes; i++) {
    skip.add(pairKey(i, i));
    const n1 = adj.get(i);
    if (!n1) continue;
    for (const j of n1) {
      skip.add(pairKey(i, j));
      const n2 = adj.get(j);
      if (!n2) continue;
      for (const k of n2) skip.add(pairKey(i, k));
    }
  }
  return skip;
}

function pairKey(i: number, j: number): string {
  return i < j ? `${i},${j}` : `${j},${i}`;
}

export interface KissResult {
  pushed: number;
  minGap: number;
  viol: number;
}

/**
 * Soft-press kiss: if d < CONTACT_KISS, separate to kiss along the joining
 * vector. Proximity search uses CONTACT_ENGAGE. Mesh 1–2 hop neighbors skipped.
 * Wrinkle is not a substitute for this projection.
 */
export function applyKissProjection(args: {
  coords: Float64Array;
  skip: Set<string>;
  kiss?: number;
  engage?: number;
}): KissResult {
  const coords = args.coords;
  const skip = args.skip;
  const kiss = args.kiss ?? CONTACT_KISS;
  const engage = args.engage ?? CONTACT_ENGAGE;
  const nNodes = coords.length / 3;
  const invC = 1 / engage;
  const buckets = new Map<number, number[]>();
  const pack = (ix: number, iy: number, iz: number): number =>
    ((ix + 512) | 0) + ((iy + 512) | 0) * 1024 + ((iz + 512) | 0) * 1024 * 1024;
  for (let i = 0; i < nNodes; i++) {
    const ix = Math.floor(coords[i * 3]! * invC);
    const iy = Math.floor(coords[i * 3 + 1]! * invC);
    const iz = Math.floor(coords[i * 3 + 2]! * invC);
    const key = pack(ix, iy, iz);
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }
  let pushed = 0;
  let minGap = Infinity;
  let viol = 0;
  const share = 0.55;
  const maxPush = engage * 0.9;
  const seen = new Set<string>();
  for (let i = 0; i < nNodes; i++) {
    const ix = Math.floor(coords[i * 3]! * invC);
    const iy = Math.floor(coords[i * 3 + 1]! * invC);
    const iz = Math.floor(coords[i * 3 + 2]! * invC);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(pack(ix + dx, iy + dy, iz + dz));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const key = pairKey(i, j);
            if (skip.has(key) || seen.has(key)) continue;
            seen.add(key);
            const ddx = coords[j * 3]! - coords[i * 3]!;
            const ddy = coords[j * 3 + 1]! - coords[i * 3 + 1]!;
            const ddz = coords[j * 3 + 2]! - coords[i * 3 + 2]!;
            const d = Math.hypot(ddx, ddy, ddz);
            if (d < minGap) minGap = d;
            if (d >= engage || d < 1e-12) continue;
            if (d < kiss) viol += 1;
            const amt = Math.min(maxPush, (kiss - d) * share);
            if (amt > 0) {
              const inv = 1 / d;
              const ox = ddx * inv * amt;
              const oy = ddy * inv * amt;
              const oz = ddz * inv * amt;
              coords[i * 3]! -= ox;
              coords[i * 3 + 1]! -= oy;
              coords[i * 3 + 2]! -= oz;
              coords[j * 3]! += ox;
              coords[j * 3 + 1]! += oy;
              coords[j * 3 + 2]! += oz;
              pushed += 1;
            }
          }
        }
      }
    }
  }
  if (minGap === Infinity) minGap = engage;
  return { pushed, minGap, viol };
}

/** Heuristic: a node that crossed through the closed surface (empty V) is punch-through. */
export function punchedThrough(volume: number, volume0: number): boolean {
  return !(volume > 0) || volume > 50 * Math.max(volume0, 1e-12);
}
