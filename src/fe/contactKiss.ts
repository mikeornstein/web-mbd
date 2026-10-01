import { CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE, CONTACT_ENGAGE, CONTACT_KISS } from "../inflate/constants.js";
import type { InflateContactClass, InflateKissKind } from "../inflate/types.js";

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

/** 1–2 hop neighbors plus self (TYPE19-class neighbor skip). */
export function buildVertexStar2(
  quads: ArrayLike<number>,
  nNodes: number,
  tris: ArrayLike<number> = [],
): Set<number>[] {
  const star1 = buildVertexStar(quads, nNodes, tris);
  const star2: Set<number>[] = new Array<Set<number>>(nNodes);
  for (let i = 0; i < nNodes; i++) {
    const s = new Set<number>(star1[i]);
    for (const j of star1[i]!) {
      const n2 = star1[j];
      if (!n2) continue;
      for (const k of n2) s.add(k);
    }
    star2[i] = s;
  }
  return star2;
}

/**
 * Packed undirected skip pairs. 1–2 hop neighbors skipped.
 */
export function buildMeshAdjacency(
  quads: ArrayLike<number>,
  nNodes: number,
  tris: ArrayLike<number> = [],
): Set<string> {
  const star2 = buildVertexStar2(quads, nNodes, tris);
  const skip = new Set<string>();
  for (let i = 0; i < nNodes; i++) {
    for (const j of star2[i]!) skip.add(pairKey(i, j));
  }
  return skip;
}

export interface KissResult {
  pushed: number;
  minGap: number;
  /** Remaining contacts with gap < Gapmin *after* the soft press. */
  viol: number;
  contactClass: InflateContactClass;
}

function pack(ix: number, iy: number, iz: number): number {
  return ((ix + 512) | 0) + ((iy + 512) | 0) * 1024 + ((iz + 512) | 0) * 1024 * 1024;
}

const SHARE = 0.55;

function contactClassFor(kind: InflateKissKind): InflateContactClass {
  switch (kind) {
    case "node-node":
      return CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unhandled kiss kind ${String(_exhaustive)}`);
    }
  }
}

/**
 * TYPE19-class Gapmin kiss. Same CONTACT_KISS number as Radioss
 * `/INTER/TYPE19` Gapmin. Fast-load (dynamic) path is node-node with 2-hop
 * skip. Gapmin is not weakened. Not bitwise TYPE19. `viol` is counted after
 * the press.
 */
export function applyKissProjection(args: {
  coords: Float64Array;
  quads: ArrayLike<number>;
  tris?: ArrayLike<number>;
  kiss?: number;
  engage?: number;
  kind?: InflateKissKind;
  /** Post-press minGap/viol. Default true. */
  measureGap?: boolean;
}): KissResult {
  const kind = args.kind ?? "node-node";
  switch (kind) {
    case "node-node":
      return applyKissNodeNode(args);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unhandled kiss kind ${String(_exhaustive)}`);
    }
  }
}

function applyKissNodeNode(args: {
  coords: Float64Array;
  quads: ArrayLike<number>;
  tris?: ArrayLike<number>;
  kiss?: number;
  engage?: number;
  measureGap?: boolean;
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
            const amt = Math.min(maxPush, (kiss - d) * SHARE);
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

  let minGap = engage;
  let viol = 0;
  if (args.measureGap !== false) {
    minGap = Infinity;
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
  }
  return {
    pushed,
    minGap,
    viol,
    contactClass: contactClassFor("node-node"),
  };
}

/** Heuristic: a node that crossed through the closed surface (empty V) is punch-through. */
export function punchedThrough(volume: number, volume0: number): boolean {
  return !(volume > 0) || volume > 50 * Math.max(volume0, 1e-12);
}
