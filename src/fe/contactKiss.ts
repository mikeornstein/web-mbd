import {
  CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT,
  CONTACT_ENGAGE,
  CONTACT_KISS,
} from "../inflate/constants.js";

function pairKey(i: number, j: number): string {
  return i < j ? `${i},${j}` : `${j},${i}`;
}

function addEdge(adj: Map<number, Set<number>>, a: number, b: number): void {
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
}

/** One-ring neighbors plus self. */
export function buildVertexStar(
  quads: ArrayLike<number>,
  nNodes: number,
  tris: ArrayLike<number> = [],
): Set<number>[] {
  const adj = new Map<number, Set<number>>();
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    const a = quads[e * 4]!,
      b = quads[e * 4 + 1]!,
      c = quads[e * 4 + 2]!,
      d = quads[e * 4 + 3]!;
    addEdge(adj, a, b);
    addEdge(adj, b, c);
    addEdge(adj, c, d);
    addEdge(adj, d, a);
  }
  const nt = tris.length / 3;
  for (let e = 0; e < nt; e++) {
    const a = tris[e * 3]!,
      b = tris[e * 3 + 1]!,
      c = tris[e * 3 + 2]!;
    addEdge(adj, a, b);
    addEdge(adj, b, c);
    addEdge(adj, c, a);
  }
  const star: Set<number>[] = new Array<Set<number>>(nNodes);
  for (let i = 0; i < nNodes; i++) {
    const s = new Set<number>([i]);
    const n1 = adj.get(i);
    if (n1) for (const j of n1) s.add(j);
    star[i] = s;
  }
  return star;
}

/**
 * Packed undirected skip pairs. 1–2 hop neighbors skipped.
 */
export function buildMeshAdjacency(
  quads: ArrayLike<number>,
  nNodes: number,
  tris: ArrayLike<number> = [],
): Set<string> {
  const star = buildVertexStar(quads, nNodes, tris);
  const skip = new Set<string>();
  for (let i = 0; i < nNodes; i++) {
    skip.add(pairKey(i, i));
    const n1 = star[i];
    if (!n1) continue;
    for (const j of n1) {
      skip.add(pairKey(i, j));
      const n2 = star[j];
      if (!n2) continue;
      for (const k of n2) skip.add(pairKey(i, k));
    }
  }
  return skip;
}

export interface KissResult {
  pushed: number;
  minGap: number;
  /** Remaining node pairs with gap < Gapmin *after* the soft press. */
  viol: number;
  contactClass: typeof CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT;
}

function pack(ix: number, iy: number, iz: number): number {
  return ((ix + 512) | 0) + ((iy + 512) | 0) * 1024 + ((iz + 512) | 0) * 1024 * 1024;
}

/**
 * TYPE19-class Gapmin kiss. Same CONTACT_KISS number as Radioss
 * `/INTER/TYPE19` Gapmin. Implementation is node–node soft-press along the
 * joining vector (the response that stays inside Themis bands vs the PR#8
 * TYPE19 desk). A node-to-segment analogue was tried and moved λ/V outside
 * 2%/5% — not shipped as default. Not bitwise TYPE19 (no Igap=4, no TYPE11,
 * no Inacti=6). `viol` is counted after the press.
 */
export function applyKissProjection(args: {
  coords: Float64Array;
  quads: ArrayLike<number>;
  tris?: ArrayLike<number>;
  kiss?: number;
  engage?: number;
}): KissResult {
  const coords = args.coords;
  const skip = buildMeshAdjacency(args.quads, coords.length / 3, args.tris ?? []);
  const kiss = args.kiss ?? CONTACT_KISS;
  const engage = args.engage ?? CONTACT_ENGAGE;
  const nNodes = coords.length / 3;
  const invC = 1 / engage;
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < nNodes; i++) {
    const key = pack(
      Math.floor(coords[i * 3]! * invC),
      Math.floor(coords[i * 3 + 1]! * invC),
      Math.floor(coords[i * 3 + 2]! * invC),
    );
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }
  const share = 0.55;
  const maxPush = engage * 0.9;
  const seen = new Set<string>();
  let pushed = 0;
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
            if (d >= engage || d < 1e-12) continue;
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

  let minGap = Infinity;
  let viol = 0;
  const seenGap = new Set<string>();
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
            if (skip.has(key) || seenGap.has(key)) continue;
            seenGap.add(key);
            const d = Math.hypot(
              coords[j * 3]! - coords[i * 3]!,
              coords[j * 3 + 1]! - coords[i * 3 + 1]!,
              coords[j * 3 + 2]! - coords[i * 3 + 2]!,
            );
            if (d < minGap) minGap = d;
            if (d < kiss - 1e-9 && d > 1e-12) viol += 1;
          }
        }
      }
    }
  }
  if (minGap === Infinity) minGap = engage;
  return {
    pushed,
    minGap,
    viol,
    contactClass: CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT,
  };
}

/** Heuristic: a node that crossed through the closed surface (empty V) is punch-through. */
export function punchedThrough(volume: number, volume0: number): boolean {
  return !(volume > 0) || volume > 50 * Math.max(volume0, 1e-12);
}
