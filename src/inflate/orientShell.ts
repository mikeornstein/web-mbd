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

/**
 * Shading triangles the canvas fills. Always run the outward orienter on the
 * supplied connectivity so a stub that returns the raw triangles is visible
 * even when the solver mesh was already rewound at load.
 */
export function outwardShadingTriangles(
  restCoords: ArrayLike<number>,
  quads: ArrayLike<number>,
  leftoverTris: ArrayLike<number> = [],
): ShellTriangle[] {
  const source = [...cstTrianglesFromQuads(quads), ...leftoverTriangles(leftoverTris)];
  return orientTrianglesOutward(restCoords, source).triangles;
}

export function reverseQuad(
  q: readonly [number, number, number, number],
): [number, number, number, number] {
  return [q[0], q[3], q[2], q[1]];
}

export interface OrientedQuadShell {
  quads: number[];
  tris: number[];
  flippedQuadCount: number;
  flippedTriCount: number;
  mixedQuadCount: number;
  orientable: boolean;
}

/**
 * Whole-quad reverse (inflation-abc `orient_outward_closed`): both constant-strain
 * halves of a mixed pair never disagree on letter A, so each shell is either
 * kept or reversed as a unit.
 */
export function orientQuadShellOutward(
  coords: ArrayLike<number>,
  quads: ArrayLike<number>,
  leftoverTris: ArrayLike<number> = [],
): OrientedQuadShell {
  const fromQuads = cstTrianglesFromQuads(quads);
  const leftover = leftoverTriangles(leftoverTris);
  const source = [...fromQuads, ...leftover];
  const oriented = orientTrianglesOutward(coords, source);
  const nq = quads.length / 4;
  const outQuads: number[] = [];
  let flippedQuadCount = 0;
  let mixedQuadCount = 0;
  for (let e = 0; e < nq; e++) {
    const a = oriented.flipped[2 * e]!;
    const b = oriented.flipped[2 * e + 1]!;
    const q: [number, number, number, number] = [
      quads[e * 4]!,
      quads[e * 4 + 1]!,
      quads[e * 4 + 2]!,
      quads[e * 4 + 3]!,
    ];
    if (a !== b) mixedQuadCount += 1;
    if (a && b) {
      const r = reverseQuad(q);
      outQuads.push(r[0], r[1], r[2], r[3]);
      flippedQuadCount += 1;
    } else {
      outQuads.push(q[0], q[1], q[2], q[3]);
    }
  }
  const outTris: number[] = [];
  let flippedTriCount = 0;
  for (let e = 0; e < leftover.length; e++) {
    const flag = oriented.flipped[2 * nq + e]!;
    const t = leftover[e]!;
    if (flag) {
      const r = reverseTriangle(t);
      outTris.push(r[0], r[1], r[2]);
      flippedTriCount += 1;
    } else {
      outTris.push(t[0], t[1], t[2]);
    }
  }
  return {
    quads: outQuads,
    tris: outTris,
    flippedQuadCount,
    flippedTriCount,
    mixedQuadCount,
    orientable: oriented.orientable,
  };
}

export function otherDiagonalVolume(coords: ArrayLike<number>, quads: ArrayLike<number>): number {
  let v = 0;
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    const i0 = quads[e * 4]!;
    const i1 = quads[e * 4 + 1]!;
    const i2 = quads[e * 4 + 2]!;
    const i3 = quads[e * 4 + 3]!;
    v += tetVolume(coords, [i0, i1, i3]);
    v += tetVolume(coords, [i1, i2, i3]);
  }
  return v;
}

function rayHitsTriangle(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number],
  coords: ArrayLike<number>,
  tri: ShellTriangle,
): boolean {
  const ax = coords[tri[0] * 3]!,
    ay = coords[tri[0] * 3 + 1]!,
    az = coords[tri[0] * 3 + 2]!;
  const bx = coords[tri[1] * 3]!,
    by = coords[tri[1] * 3 + 1]!,
    bz = coords[tri[1] * 3 + 2]!;
  const cx = coords[tri[2] * 3]!,
    cy = coords[tri[2] * 3 + 1]!,
    cz = coords[tri[2] * 3 + 2]!;
  const e1x = bx - ax,
    e1y = by - ay,
    e1z = bz - az;
  const e2x = cx - ax,
    e2y = cy - ay,
    e2z = cz - az;
  const px = dir[1] * e2z - dir[2] * e2y;
  const py = dir[2] * e2x - dir[0] * e2z;
  const pz = dir[0] * e2y - dir[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-18) return false;
  const inv = 1 / det;
  const tx = origin[0] - ax,
    ty = origin[1] - ay,
    tz = origin[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 1e-12;
}

/** Odd/even ray parity against an oriented closed triangle shell. */
export function pointInsideClosedShell(
  coords: ArrayLike<number>,
  triangles: readonly ShellTriangle[],
  point: readonly [number, number, number],
): boolean {
  const dir: [number, number, number] = [1, 0.002139, 0.001187];
  let hits = 0;
  for (const tri of triangles) {
    if (rayHitsTriangle(point, dir, coords, tri)) hits += 1;
  }
  return hits % 2 === 1;
}

export function triangleCentroid(coords: ArrayLike<number>, tri: ShellTriangle): [number, number, number] {
  return [
    (coords[tri[0] * 3]! + coords[tri[1] * 3]! + coords[tri[2] * 3]!) / 3,
    (coords[tri[0] * 3 + 1]! + coords[tri[1] * 3 + 1]! + coords[tri[2] * 3 + 1]!) / 3,
    (coords[tri[0] * 3 + 2]! + coords[tri[1] * 3 + 2]! + coords[tri[2] * 3 + 2]!) / 3,
  ];
}

/**
 * Every face of a consistently outward shell: a tiny step along the right-hand
 * normal leaves the enclosed volume; a tiny step against it stays inside.
 */
export function facePointsOutward(
  coords: ArrayLike<number>,
  triangles: readonly ShellTriangle[],
  tri: ShellTriangle,
  offset = 2e-4,
): boolean {
  const n = triangleNormal(coords, tri);
  if (n[0] === 0 && n[1] === 0 && n[2] === 0) return false;
  const c = triangleCentroid(coords, tri);
  const outside: [number, number, number] = [c[0] + offset * n[0], c[1] + offset * n[1], c[2] + offset * n[2]];
  const inside: [number, number, number] = [c[0] - offset * n[0], c[1] - offset * n[1], c[2] - offset * n[2]];
  return !pointInsideClosedShell(coords, triangles, outside) && pointInsideClosedShell(coords, triangles, inside);
}
