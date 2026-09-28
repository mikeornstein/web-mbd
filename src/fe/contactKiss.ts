import {
  CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE,
  CONTACT_CLASS_TYPE19_GAPMIN_NODE_SEGMENT,
  CONTACT_ENGAGE,
  CONTACT_KISS,
} from "../inflate/constants.js";
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

export interface KissSegmentCache {
  ia: Int32Array;
  ib: Int32Array;
  ic: Int32Array;
  stamp: Uint32Array;
  mark: number;
}

function pack(ix: number, iy: number, iz: number): number {
  return ((ix + 512) | 0) + ((iy + 512) | 0) * 1024 + ((iz + 512) | 0) * 1024 * 1024;
}

const SHARE = 0.55;

function contactClassFor(kind: InflateKissKind): InflateContactClass {
  switch (kind) {
    case "node-node":
      return CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE;
    case "node-segment":
      return CONTACT_CLASS_TYPE19_GAPMIN_NODE_SEGMENT;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unhandled kiss kind ${String(_exhaustive)}`);
    }
  }
}

/**
 * TYPE19-class Gapmin kiss. Same CONTACT_KISS number as Radioss
 * `/INTER/TYPE19` Gapmin. `node-node` is the dynamic PR#8 desk path
 * (2-hop skip). `node-segment` is the QS TYPE7 analogue: skip only
 * segments that share a node (1-ring), so staggered / A-hole faces
 * cannot pass through. Gapmin is not weakened. Not bitwise TYPE19.
 * `viol` is counted after the press.
 */
export function applyKissProjection(args: {
  coords: Float64Array;
  quads: ArrayLike<number>;
  tris?: ArrayLike<number>;
  kiss?: number;
  engage?: number;
  kind?: InflateKissKind;
  star2?: Set<number>[];
  segments?: KissSegmentCache;
  /** Post-press minGap/viol. Default true. QS skips this except at ANIM samples. */
  measureGap?: boolean;
}): KissResult {
  const kind = args.kind ?? "node-node";
  switch (kind) {
    case "node-node":
      return applyKissNodeNode(args);
    case "node-segment":
      return applyKissNodeSegment(args);
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

interface ClosestTri {
  qx: number;
  qy: number;
  qz: number;
  wa: number;
  wb: number;
  wc: number;
}

/** Ericson closest-point-on-triangle with barycentric weights at q. */
function closestPointOnTriangle(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): ClosestTri {
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return { qx: ax, qy: ay, qz: az, wa: 1, wb: 0, wc: 0 };

  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return { qx: bx, qy: by, qz: bz, wa: 0, wb: 1, wc: 0 };

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return {
      qx: ax + v * abx,
      qy: ay + v * aby,
      qz: az + v * abz,
      wa: 1 - v,
      wb: v,
      wc: 0,
    };
  }

  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return { qx: cx, qy: cy, qz: cz, wa: 0, wb: 0, wc: 1 };

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return {
      qx: ax + w * acx,
      qy: ay + w * acy,
      qz: az + w * acz,
      wa: 1 - w,
      wb: 0,
      wc: w,
    };
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return {
      qx: bx + w * (cx - bx),
      qy: by + w * (cy - by),
      qz: bz + w * (cz - bz),
      wa: 0,
      wb: 1 - w,
      wc: w,
    };
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const u = 1 - v - w;
  return {
    qx: ax + abx * v + acx * w,
    qy: ay + aby * v + acy * w,
    qz: az + abz * v + acz * w,
    wa: u,
    wb: v,
    wc: w,
  };
}

function forEachCst(
  quads: ArrayLike<number>,
  tris: ArrayLike<number>,
  visit: (a: number, b: number, c: number) => void,
): void {
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    const i0 = quads[e * 4]!,
      i1 = quads[e * 4 + 1]!,
      i2 = quads[e * 4 + 2]!,
      i3 = quads[e * 4 + 3]!;
    visit(i0, i1, i2);
    visit(i0, i2, i3);
  }
  const nt = tris.length / 3;
  for (let e = 0; e < nt; e++) {
    visit(tris[e * 3]!, tris[e * 3 + 1]!, tris[e * 3 + 2]!);
  }
}

export function buildKissSegmentCache(
  quads: ArrayLike<number>,
  tris: ArrayLike<number> = [],
): KissSegmentCache {
  const ia: number[] = [];
  const ib: number[] = [];
  const ic: number[] = [];
  forEachCst(quads, tris, (a, b, c) => {
    ia.push(a);
    ib.push(b);
    ic.push(c);
  });
  const n = ia.length;
  return {
    ia: Int32Array.from(ia),
    ib: Int32Array.from(ib),
    ic: Int32Array.from(ic),
    stamp: new Uint32Array(n),
    mark: 1,
  };
}

function nextMark(cache: KissSegmentCache): number {
  let mark = cache.mark + 1;
  if (mark === 0xffffffff) {
    cache.stamp.fill(0);
    mark = 1;
  }
  cache.mark = mark;
  return mark;
}

function applyKissNodeSegment(args: {
  coords: Float64Array;
  quads: ArrayLike<number>;
  tris?: ArrayLike<number>;
  kiss?: number;
  engage?: number;
  star2?: Set<number>[];
  segments?: KissSegmentCache;
  measureGap?: boolean;
}): KissResult {
  const coords = args.coords;
  const tris = args.tris ?? [];
  const nNodes = coords.length / 3;
  const star2 = args.star2 ?? buildVertexStar(args.quads, nNodes, tris);
  const cache = args.segments ?? buildKissSegmentCache(args.quads, tris);
  const kiss = args.kiss ?? CONTACT_KISS;
  const engage = args.engage ?? CONTACT_ENGAGE;
  const cell = engage;
  const invC = 1 / cell;
  const maxPush = engage * 0.9;
  const { ia, ib, ic, stamp } = cache;
  const nSeg = ia.length;

  const buckets = new Map<number, number[]>();
  for (let s = 0; s < nSeg; s++) {
    const a = ia[s]!,
      b = ib[s]!,
      c = ic[s]!;
    const cx = (coords[a * 3]! + coords[b * 3]! + coords[c * 3]!) / 3;
    const cy = (coords[a * 3 + 1]! + coords[b * 3 + 1]! + coords[c * 3 + 1]!) / 3;
    const cz = (coords[a * 3 + 2]! + coords[b * 3 + 2]! + coords[c * 3 + 2]!) / 3;
    const key = pack(Math.floor(cx * invC), Math.floor(cy * invC), Math.floor(cz * invC));
    const list = buckets.get(key);
    if (list) list.push(s);
    else buckets.set(key, [s]);
  }

  let pushed = 0;
  for (let i = 0; i < nNodes; i++) {
    const skip = star2[i]!;
    const ix = Math.floor(coords[i * 3]! * invC);
    const iy = Math.floor(coords[i * 3 + 1]! * invC);
    const iz = Math.floor(coords[i * 3 + 2]! * invC);
    const mark = nextMark(cache);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(pack(ix + dx, iy + dy, iz + dz));
          if (!list) continue;
          for (const s of list) {
            if (stamp[s] === mark) continue;
            stamp[s] = mark;
            const a = ia[s]!,
              b = ib[s]!,
              c = ic[s]!;
            if (skip.has(a) || skip.has(b) || skip.has(c)) continue;
            const px = coords[i * 3]!,
              py = coords[i * 3 + 1]!,
              pz = coords[i * 3 + 2]!;
            const ax = coords[a * 3]!,
              ay = coords[a * 3 + 1]!,
              az = coords[a * 3 + 2]!;
            const bx = coords[b * 3]!,
              by = coords[b * 3 + 1]!,
              bz = coords[b * 3 + 2]!;
            const cx = coords[c * 3]!,
              cy = coords[c * 3 + 1]!,
              cz = coords[c * 3 + 2]!;
            if (
              px < Math.min(ax, bx, cx) - engage ||
              px > Math.max(ax, bx, cx) + engage ||
              py < Math.min(ay, by, cy) - engage ||
              py > Math.max(ay, by, cy) + engage ||
              pz < Math.min(az, bz, cz) - engage ||
              pz > Math.max(az, bz, cz) + engage
            ) {
              continue;
            }
            const hit = closestPointOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
            const ddx = px - hit.qx;
            const ddy = py - hit.qy;
            const ddz = pz - hit.qz;
            const d = Math.hypot(ddx, ddy, ddz);
            if (d >= engage || d < 1e-12) continue;
            const amt = Math.min(maxPush, (kiss - d) * SHARE);
            if (!(amt > 0)) continue;
            const inv = amt / d;
            const ox = ddx * inv;
            const oy = ddy * inv;
            const oz = ddz * inv;
            coords[i * 3]! += ox;
            coords[i * 3 + 1]! += oy;
            coords[i * 3 + 2]! += oz;
            coords[a * 3]! -= ox * hit.wa;
            coords[a * 3 + 1]! -= oy * hit.wa;
            coords[a * 3 + 2]! -= oz * hit.wa;
            coords[b * 3]! -= ox * hit.wb;
            coords[b * 3 + 1]! -= oy * hit.wb;
            coords[b * 3 + 2]! -= oz * hit.wb;
            coords[c * 3]! -= ox * hit.wc;
            coords[c * 3 + 1]! -= oy * hit.wc;
            coords[c * 3 + 2]! -= oz * hit.wc;
            pushed += 1;
          }
        }
      }
    }
  }

  let minGap = engage;
  let viol = 0;
  if (args.measureGap !== false) {
    minGap = Infinity;
    for (let i = 0; i < nNodes; i++) {
      const skip = star2[i]!;
      const px = coords[i * 3]!,
        py = coords[i * 3 + 1]!,
        pz = coords[i * 3 + 2]!;
      const ix = Math.floor(px * invC);
      const iy = Math.floor(py * invC);
      const iz = Math.floor(pz * invC);
      const mark = nextMark(cache);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const list = buckets.get(pack(ix + dx, iy + dy, iz + dz));
            if (!list) continue;
            for (const s of list) {
              if (stamp[s] === mark) continue;
              stamp[s] = mark;
              const a = ia[s]!,
                b = ib[s]!,
                c = ic[s]!;
              if (skip.has(a) || skip.has(b) || skip.has(c)) continue;
              const hit = closestPointOnTriangle(
                px,
                py,
                pz,
                coords[a * 3]!,
                coords[a * 3 + 1]!,
                coords[a * 3 + 2]!,
                coords[b * 3]!,
                coords[b * 3 + 1]!,
                coords[b * 3 + 2]!,
                coords[c * 3]!,
                coords[c * 3 + 1]!,
                coords[c * 3 + 2]!,
              );
              const d = Math.hypot(px - hit.qx, py - hit.qy, pz - hit.qz);
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
    contactClass: contactClassFor("node-segment"),
  };
}

/** Heuristic: a node that crossed through the closed surface (empty V) is punch-through. */
export function punchedThrough(volume: number, volume0: number): boolean {
  return !(volume > 0) || volume > 50 * Math.max(volume0, 1e-12);
}

