/** Local hex face loops with outward right-hand normals. */
export const HEX_FACES: readonly (readonly [number, number, number, number])[] = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [3, 7, 6, 2],
  [0, 4, 7, 3],
  [1, 2, 6, 5],
];

export type HexQuad = readonly [number, number, number, number];

/** Unique outward faces (interior shared faces dropped). */
export function boundaryHexFaces(hexes: ArrayLike<number>): HexQuad[] {
  const seen = new Map<string, { face: HexQuad; count: number }>();
  for (let e = 0; e < hexes.length; e += 8) {
    for (const local of HEX_FACES) {
      const face: HexQuad = [
        hexes[e + local[0]]!,
        hexes[e + local[1]]!,
        hexes[e + local[2]]!,
        hexes[e + local[3]]!,
      ];
      const key = faceKey(face);
      const prev = seen.get(key);
      if (prev) prev.count += 1;
      else seen.set(key, { face, count: 1 });
    }
  }
  const out: HexQuad[] = [];
  for (const { face, count } of seen.values()) {
    if (count === 1) out.push(face);
  }
  return out;
}

export function faceNormal(
  coords: ArrayLike<number>,
  face: HexQuad,
): [number, number, number] {
  const ax = coords[face[0] * 3]!;
  const ay = coords[face[0] * 3 + 1]!;
  const az = coords[face[0] * 3 + 2]!;
  const bx = coords[face[1] * 3]!;
  const by = coords[face[1] * 3 + 1]!;
  const bz = coords[face[1] * 3 + 2]!;
  const dx = coords[face[3] * 3]!;
  const dy = coords[face[3] * 3 + 1]!;
  const dz = coords[face[3] * 3 + 2]!;
  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = dx - ax;
  const vy = dy - ay;
  const vz = dz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 1e-18)) return [0, 0, 0];
  return [nx / len, ny / len, nz / len];
}

function faceKey(face: HexQuad): string {
  const nodes = [face[0], face[1], face[2], face[3]];
  nodes.sort((a, b) => a - b);
  return `${nodes[0]},${nodes[1]},${nodes[2]},${nodes[3]}`;
}
