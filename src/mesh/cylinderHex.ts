/** Structured hex mesh of a solid cylinder (axis +Z, impact face at z=0). */

export interface CylinderMeshOptions {
  radius: number;
  length: number;
  /** Segments across the square cross-section (>=2). */
  nSide: number;
  /** Axial divisions (>=1). */
  nZ: number;
}

export interface CylinderMesh {
  coords: number[];
  hexes: number[];
  radius0: number;
  length0: number;
}

/**
 * Build a cylinder by mapping a subdivided square cross-section onto a disk, then extruding in Z.
 * Avoids polar singularity at r=0.
 */
export function createCylinderHexMesh(opt: CylinderMeshOptions): CylinderMesh {
  const { radius, length, nSide, nZ } = opt;
  if (nSide < 2 || nZ < 1) throw new Error("invalid cylinder mesh divisions");

  const nXY = nSide + 1;
  const coords: number[] = [];
  const nodeAt: number[][][] = [];

  for (let iz = 0; iz <= nZ; iz++) {
    nodeAt[iz] = [];
    const z = (length * iz) / nZ;
    for (let ix = 0; ix < nXY; ix++) {
      nodeAt[iz][ix] = [];
      const u = -1 + (2 * ix) / nSide;
      for (let iy = 0; iy < nXY; iy++) {
        const v = -1 + (2 * iy) / nSide;
        const [x, y] = squareToCircle(u, v, radius);
        nodeAt[iz][ix][iy] = coords.length / 3;
        coords.push(x, y, z);
      }
    }
  }

  const hexes: number[] = [];
  for (let iz = 0; iz < nZ; iz++) {
    for (let ix = 0; ix < nSide; ix++) {
      for (let iy = 0; iy < nSide; iy++) {
        const n000 = nodeAt[iz][ix]![iy]!;
        const n100 = nodeAt[iz][ix + 1]![iy]!;
        const n110 = nodeAt[iz][ix + 1]![iy + 1]!;
        const n010 = nodeAt[iz][ix]![iy + 1]!;
        const n001 = nodeAt[iz + 1]![ix]![iy]!;
        const n101 = nodeAt[iz + 1]![ix + 1]![iy]!;
        const n111 = nodeAt[iz + 1]![ix + 1]![iy + 1]!;
        const n011 = nodeAt[iz + 1]![ix]![iy + 1]!;
        hexes.push(n000, n100, n110, n010, n001, n101, n111, n011);
      }
    }
  }

  return { coords, hexes, radius0: radius, length0: length };
}

/** Map parent square coords in [-1,1]^2 to a circle of the given radius. */
function squareToCircle(u: number, v: number, radius: number): [number, number] {
  if (u === 0 && v === 0) return [0, 0];
  const x = u;
  const y = v;
  const s = Math.max(Math.abs(x), Math.abs(y));
  const bx = x / s;
  const by = y / s;
  const rb = Math.hypot(bx, by);
  const r = Math.hypot(x, y);
  const target = (radius * r) / rb;
  const f = target / r;
  return [x * f, y * f];
}
