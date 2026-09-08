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
 * OpenRadioss `/RWALL/PLANE` ITIED=0 (slide) kinematic constraint.
 *
 * Predicts mid-step motion `X + (V+A·dt/2)·dt`. If that prediction penetrates
 * and the relative normal velocity approaches the wall, strip the normal
 * components of V and A. Positions are **not** hard-projected (matches `rgwall.F`).
 */
export function applyRigidWallKinematic(args: {
  wall: RigidWallPlane;
  coords: Float64Array;
  velocities: Float64Array;
  accelerations?: Float64Array;
  dt?: number;
}): { nContact: number } {
  const { wall, coords, velocities } = args;
  const [px, py, pz] = wall.point;
  const [nx, ny, nz] = wall.normal;
  const acc = args.accelerations;
  const dt = args.dt ?? 0;
  const dt12 = 0.5 * dt;
  let nContact = 0;
  const nNodes = coords.length / 3;

  for (let a = 0; a < nNodes; a++) {
    const i = a * 3;
    const ax = acc ? acc[i]! : 0;
    const ay = acc ? acc[i + 1]! : 0;
    const az = acc ? acc[i + 2]! : 0;

    // Radioss: VX = V + A*DT12 ; UX = X + VX*DT2 with DT2≈dt
    const vxP = velocities[i]! + ax * dt12;
    const vyP = velocities[i + 1]! + ay * dt12;
    const vzP = velocities[i + 2]! + az * dt12;
    const ux = coords[i]! + vxP * dt;
    const uy = coords[i + 1]! + vyP * dt;
    const uz = coords[i + 2]! + vzP * dt;
    const dp = (ux - px) * nx + (uy - py) * ny + (uz - pz) * nz;
    if (dp > 0) continue;

    const vnP = vxP * nx + vyP * ny + vzP * nz;
    if (vnP > 0) continue;

    const dv = velocities[i]! * nx + velocities[i + 1]! * ny + velocities[i + 2]! * nz;
    velocities[i]! -= dv * nx;
    velocities[i + 1]! -= dv * ny;
    velocities[i + 2]! -= dv * nz;
    if (acc) {
      const da = ax * nx + ay * ny + az * nz;
      acc[i]! -= da * nx;
      acc[i + 1]! -= da * ny;
      acc[i + 2]! -= da * nz;
    }
    nContact += 1;
  }
  return { nContact };
}
