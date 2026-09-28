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

/** One-ring neighbors plus self. TYPE19-class skip: share a node with the segment. */
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
 * Packed undirected skip pairs for the old node-node path (tests / diagnostics).
 * 1–2 hop neighbors skipped.
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
  /** Remaining node–segment pairs with gap < Gapmin *after* the soft press. */
  viol: number;
  contactClass: typeof CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT;
}

interface Seg {
  i: number;
  j: number;
  k: number;
}

function collectSegments(quads: ArrayLike<number>, tris: ArrayLike<number>): Seg[] {
  const segs: Seg[] = [];
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    const a = quads[e * 4]!,
      b = quads[e * 4 + 1]!,
      c = quads[e * 4 + 2]!,
      d = quads[e * 4 + 3]!;
    segs.push({ i: a, j: b, k: c }, { i: a, j: c, k: d });
  }
  const nt = tris.length / 3;
  for (let e = 0; e < nt; e++) {
    segs.push({ i: tris[e * 3]!, j: tris[e * 3 + 1]!, k: tris[e * 3 + 2]! });
  }
  return segs;
}

/** Closest point on triangle ABC to P (Ericson). Returns q and unsigned distance. */
export function closestPointOnTriangle(
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
): { qx: number; qy: number; qz: number; d: number; nx: number; ny: number; nz: number } {
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
  if (d1 <= 0 && d2 <= 0) {
    const d = Math.hypot(apx, apy, apz);
    const nx = apx,
      ny = apy,
      nz = apz;
    const inv = d > 1e-18 ? 1 / d : 0;
    return { qx: ax, qy: ay, qz: az, d, nx: nx * inv, ny: ny * inv, nz: nz * inv };
  }

  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    const d = Math.hypot(bpx, bpy, bpz);
    const inv = d > 1e-18 ? 1 / d : 0;
    return { qx: bx, qy: by, qz: bz, d, nx: bpx * inv, ny: bpy * inv, nz: bpz * inv };
  }

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + abx * v,
      qy = ay + aby * v,
      qz = az + abz * v;
    const dx = px - qx,
      dy = py - qy,
      dz = pz - qz;
    const d = Math.hypot(dx, dy, dz);
    const inv = d > 1e-18 ? 1 / d : 0;
    return { qx, qy, qz, d, nx: dx * inv, ny: dy * inv, nz: dz * inv };
  }

  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    const d = Math.hypot(cpx, cpy, cpz);
    const inv = d > 1e-18 ? 1 / d : 0;
    return { qx: cx, qy: cy, qz: cz, d, nx: cpx * inv, ny: cpy * inv, nz: cpz * inv };
  }

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + acx * w,
      qy = ay + acy * w,
      qz = az + acz * w;
    const dx = px - qx,
      dy = py - qy,
      dz = pz - qz;
    const d = Math.hypot(dx, dy, dz);
    const inv = d > 1e-18 ? 1 / d : 0;
    return { qx, qy, qz, d, nx: dx * inv, ny: dy * inv, nz: dz * inv };
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const qx = bx + (cx - bx) * w,
      qy = by + (cy - by) * w,
      qz = bz + (cz - bz) * w;
    const dx = px - qx,
      dy = py - qy,
      dz = pz - qz;
    const d = Math.hypot(dx, dy, dz);
    const inv = d > 1e-18 ? 1 / d : 0;
    return { qx, qy, qz, d, nx: dx * inv, ny: dy * inv, nz: dz * inv };
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const qx = ax + abx * v + acx * w;
  const qy = ay + aby * v + acy * w;
  const qz = az + abz * v + acz * w;
  let nx = aby * acz - abz * acy;
  let ny = abz * acx - abx * acz;
  let nz = abx * acy - aby * acx;
  const nl = Math.hypot(nx, ny, nz);
  if (nl > 1e-18) {
    nx /= nl;
    ny /= nl;
    nz /= nl;
  }
  const dx = px - qx,
    dy = py - qy,
    dz = pz - qz;
  const signed = dx * nx + dy * ny + dz * nz;
  if (signed < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const d = Math.hypot(dx, dy, dz);
  return { qx, qy, qz, d, nx, ny, nz };
}

function pack(ix: number, iy: number, iz: number): number {
  return ((ix + 512) | 0) + ((iy + 512) | 0) * 1024 + ((iz + 512) | 0) * 1024 * 1024;
}

/**
 * TYPE19-class kiss: node-to-segment closest-point projection with
 * Gapmin = CONTACT_KISS. Soft press along the contact normal. Not bitwise
 * OpenRadioss TYPE19 (no Igap=4 variable gap, no TYPE11 edges, no Inacti=6).
 *
 * `viol` is counted **after** the press: remaining pairs with d < Gapmin.
 */
export function applyKissProjection(args: {
  coords: Float64Array;
  quads: ArrayLike<number>;
  tris?: ArrayLike<number>;
  skip?: Set<string>;
  kiss?: number;
  engage?: number;
}): KissResult {
  const coords = args.coords;
  const quads = args.quads;
  const tris = args.tris ?? [];
  const kiss = args.kiss ?? CONTACT_KISS;
  const engage = args.engage ?? CONTACT_ENGAGE;
  const nNodes = coords.length / 3;
  const star = buildVertexStar(quads, nNodes, tris);
  const segs = collectSegments(quads, tris);
  const invC = 1 / engage;
  const buckets = new Map<number, number[]>();
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s]!;
    const xs = [coords[seg.i * 3]!, coords[seg.j * 3]!, coords[seg.k * 3]!];
    const ys = [coords[seg.i * 3 + 1]!, coords[seg.j * 3 + 1]!, coords[seg.k * 3 + 1]!];
    const zs = [coords[seg.i * 3 + 2]!, coords[seg.j * 3 + 2]!, coords[seg.k * 3 + 2]!];
    const i0 = Math.floor((Math.min(xs[0]!, xs[1]!, xs[2]!) - engage) * invC);
    const i1 = Math.floor((Math.max(xs[0]!, xs[1]!, xs[2]!) + engage) * invC);
    const j0 = Math.floor((Math.min(ys[0]!, ys[1]!, ys[2]!) - engage) * invC);
    const j1 = Math.floor((Math.max(ys[0]!, ys[1]!, ys[2]!) + engage) * invC);
    const k0 = Math.floor((Math.min(zs[0]!, zs[1]!, zs[2]!) - engage) * invC);
    const k1 = Math.floor((Math.max(zs[0]!, zs[1]!, zs[2]!) + engage) * invC);
    for (let ix = i0; ix <= i1; ix++) {
      for (let iy = j0; iy <= j1; iy++) {
        for (let iz = k0; iz <= k1; iz++) {
          const key = pack(ix, iy, iz);
          const list = buckets.get(key);
          if (list) list.push(s);
          else buckets.set(key, [s]);
        }
      }
    }
  }

  const share = 0.55;
  const maxPush = engage * 0.9;
  let pushed = 0;
  for (let n = 0; n < nNodes; n++) {
    const px = coords[n * 3]!,
      py = coords[n * 3 + 1]!,
      pz = coords[n * 3 + 2]!;
    const ix = Math.floor(px * invC);
    const iy = Math.floor(py * invC);
    const iz = Math.floor(pz * invC);
    const ring = star[n]!;
    const seen = new Set<number>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(pack(ix + dx, iy + dy, iz + dz));
          if (!list) continue;
          for (const si of list) {
            if (seen.has(si)) continue;
            seen.add(si);
            const seg = segs[si]!;
            if (ring.has(seg.i) || ring.has(seg.j) || ring.has(seg.k)) continue;
            const hit = closestPointOnTriangle(
              coords[n * 3]!,
              coords[n * 3 + 1]!,
              coords[n * 3 + 2]!,
              coords[seg.i * 3]!,
              coords[seg.i * 3 + 1]!,
              coords[seg.i * 3 + 2]!,
              coords[seg.j * 3]!,
              coords[seg.j * 3 + 1]!,
              coords[seg.j * 3 + 2]!,
              coords[seg.k * 3]!,
              coords[seg.k * 3 + 1]!,
              coords[seg.k * 3 + 2]!,
            );
            if (hit.d >= engage || hit.d < 1e-16) continue;
            const amt = Math.min(maxPush, (kiss - hit.d) * share);
            if (!(amt > 0)) continue;
            let nx = hit.nx,
              ny = hit.ny,
              nz = hit.nz;
            const nl = Math.hypot(nx, ny, nz);
            if (nl < 1e-18) continue;
            nx /= nl;
            ny /= nl;
            nz /= nl;
            coords[n * 3]! += nx * amt;
            coords[n * 3 + 1]! += ny * amt;
            coords[n * 3 + 2]! += nz * amt;
            const back = amt / 3;
            coords[seg.i * 3]! -= nx * back;
            coords[seg.i * 3 + 1]! -= ny * back;
            coords[seg.i * 3 + 2]! -= nz * back;
            coords[seg.j * 3]! -= nx * back;
            coords[seg.j * 3 + 1]! -= ny * back;
            coords[seg.j * 3 + 2]! -= nz * back;
            coords[seg.k * 3]! -= nx * back;
            coords[seg.k * 3 + 1]! -= ny * back;
            coords[seg.k * 3 + 2]! -= nz * back;
            pushed += 1;
          }
        }
      }
    }
  }

  let minGap = Infinity;
  let viol = 0;
  for (let n = 0; n < nNodes; n++) {
    const px = coords[n * 3]!,
      py = coords[n * 3 + 1]!,
      pz = coords[n * 3 + 2]!;
    const ix = Math.floor(px * invC);
    const iy = Math.floor(py * invC);
    const iz = Math.floor(pz * invC);
    const ring = star[n]!;
    const seen = new Set<number>();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(pack(ix + dx, iy + dy, iz + dz));
          if (!list) continue;
          for (const si of list) {
            if (seen.has(si)) continue;
            seen.add(si);
            const seg = segs[si]!;
            if (ring.has(seg.i) || ring.has(seg.j) || ring.has(seg.k)) continue;
            const hit = closestPointOnTriangle(
              coords[n * 3]!,
              coords[n * 3 + 1]!,
              coords[n * 3 + 2]!,
              coords[seg.i * 3]!,
              coords[seg.i * 3 + 1]!,
              coords[seg.i * 3 + 2]!,
              coords[seg.j * 3]!,
              coords[seg.j * 3 + 1]!,
              coords[seg.j * 3 + 2]!,
              coords[seg.k * 3]!,
              coords[seg.k * 3 + 1]!,
              coords[seg.k * 3 + 2]!,
            );
            if (hit.d < minGap) minGap = hit.d;
            if (hit.d < kiss - 1e-9 && hit.d > 1e-16) viol += 1;
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
