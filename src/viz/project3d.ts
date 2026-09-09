export interface Camera3 {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface ViewPoint {
  x: number;
  y: number;
  z: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
}

/** Rotate world so the camera looks toward the origin along −Z of view space. */
export function toViewSpace(x: number, y: number, z: number, camera: Camera3): ViewPoint {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);

  const x1 = cy * x + sy * z;
  const z1 = -sy * x + cy * z;
  const y2 = cp * y - sp * z1;
  const z2 = sp * y + cp * z1;
  return { x: x1, y: y2, z: z2 };
}

/** Orbit camera → screen projection (perspective). */
export function projectPoint(
  x: number,
  y: number,
  z: number,
  camera: Camera3,
  width: number,
  height: number,
): ProjectedPoint {
  const v = toViewSpace(x, y, z, camera);
  const depth = camera.distance + v.z;
  const focal = 1.6 * Math.min(width, height);
  const scale = focal / Math.max(depth, 1e-9);
  return {
    x: width * 0.5 + v.x * scale,
    y: height * 0.5 - v.y * scale,
    depth,
  };
}

export function defaultCamera(): Camera3 {
  return { yaw: 0.85, pitch: 0.35, distance: 0.08 };
}
