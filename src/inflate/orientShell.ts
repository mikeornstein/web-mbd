/** Consistent outward winding for a closed quad (plus leftover triangle) shell. */

export type ShellTriangle = readonly [number, number, number];

export interface ShellWindingReport {
  triangleCount: number;
  undirectedEdgeCount: number;
  boundaryEdgeCount: number;
  /** Shared edges where both triangles travel the same way. */
  inconsistentEdgeCount: number;
  /** CST triangles that disagree with the unique outward orientation. */
  trianglesNeedingFlip: number;
  /** Quads whose both CST triangles need to reverse. */
  quadsNeedingFlip: number;
  /** Quads whose two CST triangles disagree with each other. */
  mixedQuadCount: number;
  signedVolume: number;
  orientedSignedVolume: number;
  orientable: boolean;
}

export function cstTrianglesFromQuads(quads: ArrayLike<number>): ShellTriangle[] {
  const out: ShellTriangle[] = [];
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    out.push(
      [quads[e * 4]!, quads[e * 4 + 1]!, quads[e * 4 + 2]!],
      [quads[e * 4]!, quads[e * 4 + 2]!, quads[e * 4 + 3]!],
    );
  }
  return out;
}

export function leftoverTriangles(tris: ArrayLike<number>): ShellTriangle[] {
  const out: ShellTriangle[] = [];
  const n = tris.length / 3;
  for (let e = 0; e < n; e++) {
    out.push([tris[e * 3]!, tris[e * 3 + 1]!, tris[e * 3 + 2]!]);
  }
  return out;
}

export function reverseTriangle(tri: ShellTriangle): ShellTriangle {
  return [tri[0], tri[2], tri[1]];
}

export function tetVolume(coords: ArrayLike<number>, tri: ShellTriangle): number {
  const ax = coords[tri[0] * 3]!,
    ay = coords[tri[0] * 3 + 1]!,
    az = coords[tri[0] * 3 + 2]!;
  const bx = coords[tri[1] * 3]!,
    by = coords[tri[1] * 3 + 1]!,
    bz = coords[tri[1] * 3 + 2]!;
  const cx = coords[tri[2] * 3]!,
    cy = coords[tri[2] * 3 + 1]!,
    cz = coords[tri[2] * 3 + 2]!;
  return (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
}

export function signedVolumeOfTriangles(coords: ArrayLike<number>, tris: readonly ShellTriangle[]): number {
  let v = 0;
  for (const t of tris) v += tetVolume(coords, t);
  return v;
}

export function triangleNormal(
  coords: ArrayLike<number>,
  tri: ShellTriangle,
): [number, number, number] {
  const ax = coords[tri[0] * 3]!,
    ay = coords[tri[0] * 3 + 1]!,
    az = coords[tri[0] * 3 + 2]!;
  const bx = coords[tri[1] * 3]!,
    by = coords[tri[1] * 3 + 1]!,
    bz = coords[tri[1] * 3 + 2]!;
  const cx = coords[tri[2] * 3]!,
    cy = coords[tri[2] * 3 + 1]!,
    cz = coords[tri[2] * 3 + 2]!;
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-18)) return [0, 0, 0];
  return [nx / len, ny / len, nz / len];
}

function undirectedKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

interface EdgeUse {
  triangle: number;
  a: number;
  b: number;
}

/**
 * Walk the dual graph so neighboring triangles traverse each shared edge
 * in opposite directions. Then reverse the whole mesh if the signed volume
 * is negative, so the unique consistent orientation is outward.
 */
export function orientTrianglesOutward(
  coords: ArrayLike<number>,
  triangles: readonly ShellTriangle[],
): { triangles: ShellTriangle[]; flipped: boolean[]; orientable: boolean } {
  const n = triangles.length;
  if (n === 0) return { triangles: [], flipped: [], orientable: true };

  const adj: { other: number; sameDir: boolean }[][] = Array.from({ length: n }, () => []);
  const firstUse = new Map<string, EdgeUse>();
  for (let t = 0; t < n; t++) {
    const [i, j, k] = triangles[t]!;
    for (const [a, b] of [
      [i, j],
      [j, k],
      [k, i],
    ] as const) {
      const key = undirectedKey(a, b);
      const prev = firstUse.get(key);
      if (prev === undefined) {
        firstUse.set(key, { triangle: t, a, b });
        continue;
      }
      const sameDir = prev.a === a && prev.b === b;
      adj[t]!.push({ other: prev.triangle, sameDir });
      adj[prev.triangle]!.push({ other: t, sameDir });
    }
  }

  const flipped = new Array<boolean>(n).fill(false);
  const seen = new Array<boolean>(n).fill(false);
  let orientable = true;
  for (let seed = 0; seed < n; seed++) {
    if (seen[seed]) continue;
    seen[seed] = true;
    const stack = [seed];
    while (stack.length > 0) {
      const t = stack.pop()!;
      for (const { other, sameDir } of adj[t]!) {
        const wantFlip = sameDir ? !flipped[t]! : flipped[t]!;
        if (!seen[other]) {
          seen[other] = true;
          flipped[other] = wantFlip;
          stack.push(other);
        } else if (flipped[other] !== wantFlip) {
          orientable = false;
        }
      }
    }
  }

  let oriented: ShellTriangle[] = triangles.map((tri, i) => (flipped[i] ? reverseTriangle(tri) : [tri[0], tri[1], tri[2]]));
  if (signedVolumeOfTriangles(coords, oriented) < 0) {
    for (let i = 0; i < n; i++) flipped[i] = !flipped[i];
    oriented = triangles.map((tri, i) => (flipped[i] ? reverseTriangle(tri) : [tri[0], tri[1], tri[2]]));
  }
  return { triangles: oriented, flipped, orientable };
}

export function edgeConsistency(triangles: readonly ShellTriangle[]): {
  undirectedEdgeCount: number;
  boundaryEdgeCount: number;
  inconsistentEdgeCount: number;
} {
  const directed = new Map<string, number>();
  const undirected = new Map<string, number>();
  for (const [i, j, k] of triangles) {
    for (const [a, b] of [
      [i, j],
      [j, k],
      [k, i],
    ] as const) {
      const dkey = `${String(a)}->${String(b)}`;
      directed.set(dkey, (directed.get(dkey) ?? 0) + 1);
      const ukey = undirectedKey(a, b);
      undirected.set(ukey, (undirected.get(ukey) ?? 0) + 1);
    }
  }
  let inconsistentEdgeCount = 0;
  let boundaryEdgeCount = 0;
  for (const [ukey, count] of undirected) {
    if (count === 1) {
      boundaryEdgeCount += 1;
      continue;
    }
    const [aRaw, bRaw] = ukey.split(",");
    const a = Number(aRaw);
    const b = Number(bRaw);
    const fwd = directed.get(`${String(a)}->${String(b)}`) ?? 0;
    const rev = directed.get(`${String(b)}->${String(a)}`) ?? 0;
    if (!(fwd === 1 && rev === 1 && count === 2)) inconsistentEdgeCount += 1;
  }
  return {
    undirectedEdgeCount: undirected.size,
    boundaryEdgeCount,
    inconsistentEdgeCount,
  };
}

export function shellWindingReport(
  coords: ArrayLike<number>,
  quads: ArrayLike<number>,
  leftoverTris: ArrayLike<number> = [],
): ShellWindingReport {
  const fromQuads = cstTrianglesFromQuads(quads);
  const leftover = leftoverTriangles(leftoverTris);
  const source = [...fromQuads, ...leftover];
  const edges = edgeConsistency(source);
  const oriented = orientTrianglesOutward(coords, source);
  const orientedEdges = edgeConsistency(oriented.triangles);
  let trianglesNeedingFlip = 0;
  for (const flag of oriented.flipped) {
    if (flag) trianglesNeedingFlip += 1;
  }
  const nq = quads.length / 4;
  let quadsNeedingFlip = 0;
  let mixedQuadCount = 0;
  for (let e = 0; e < nq; e++) {
    const a = oriented.flipped[2 * e]!;
    const b = oriented.flipped[2 * e + 1]!;
    if (a && b) quadsNeedingFlip += 1;
    if (a !== b) mixedQuadCount += 1;
  }
  return {
    triangleCount: source.length,
    undirectedEdgeCount: edges.undirectedEdgeCount,
    boundaryEdgeCount: edges.boundaryEdgeCount,
    inconsistentEdgeCount: edges.inconsistentEdgeCount,
    trianglesNeedingFlip,
    quadsNeedingFlip,
    mixedQuadCount,
    signedVolume: signedVolumeOfTriangles(coords, source),
    orientedSignedVolume: signedVolumeOfTriangles(coords, oriented.triangles),
    orientable: oriented.orientable && orientedEdges.inconsistentEdgeCount === 0,
  };
}

/** Shading triangles: consistent outward winding from rest coordinates. Solver connectivity is not modified. */
export function outwardShadingTriangles(
  restCoords: ArrayLike<number>,
  quads: ArrayLike<number>,
  leftoverTris: ArrayLike<number> = [],
): ShellTriangle[] {
  const source = [...cstTrianglesFromQuads(quads), ...leftoverTriangles(leftoverTris)];
  return orientTrianglesOutward(restCoords, source).triangles;
}
