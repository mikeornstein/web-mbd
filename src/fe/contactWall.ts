import type { RigidWallPlane } from "../ir/types.js";

/** Frictionless penalty contact against an infinite plane. */
export function applyRigidWallPenalty(args: {
  wall: RigidWallPlane;
  coords: Float64Array;
  forces: Float64Array;
}): { contactEnergy: number } {
  const { wall, coords, forces } = args;
  const [px, py, pz] = wall.point;
  const [nx, ny, nz] = wall.normal;
  const k = wall.penalty;
  let contactEnergy = 0;
  const nNodes = coords.length / 3;
  for (let a = 0; a < nNodes; a++) {
    const i = a * 3;
    const gap =
      (coords[i]! - px) * nx + (coords[i + 1]! - py) * ny + (coords[i + 2]! - pz) * nz;
    if (gap >= 0) continue;
    const f = -k * gap;
    forces[i]! += f * nx;
    forces[i + 1]! += f * ny;
    forces[i + 2]! += f * nz;
    contactEnergy += 0.5 * k * gap * gap;
  }
  return { contactEnergy };
}

/**
 * Radioss-like frictionless rigid wall: project penetrating nodes onto the plane
 * and remove the normal velocity component (kinematic constraint).
 */
export function applyRigidWallKinematic(args: {
  wall: RigidWallPlane;
  coords: Float64Array;
  velocities: Float64Array;
}): { nContact: number } {
  const { wall, coords, velocities } = args;
  const [px, py, pz] = wall.point;
  const [nx, ny, nz] = wall.normal;
  let nContact = 0;
  const nNodes = coords.length / 3;
  for (let a = 0; a < nNodes; a++) {
    const i = a * 3;
    const gap =
      (coords[i]! - px) * nx + (coords[i + 1]! - py) * ny + (coords[i + 2]! - pz) * nz;
    if (gap >= 0) continue;
    coords[i]! -= gap * nx;
    coords[i + 1]! -= gap * ny;
    coords[i + 2]! -= gap * nz;
    const vn =
      velocities[i]! * nx + velocities[i + 1]! * ny + velocities[i + 2]! * nz;
    if (vn < 0) {
      velocities[i]! -= vn * nx;
      velocities[i + 1]! -= vn * ny;
      velocities[i + 2]! -= vn * nz;
    }
    nContact += 1;
  }
  return { nContact };
}
