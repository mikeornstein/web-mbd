export interface Camera3 {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
  depth: number;
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
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);

  // Rotate world so camera looks toward origin along +Z of view space.
  const x1 = cy * x + sy * z;
  const z1 = -sy * x + cy * z;
  const y2 = cp * y - sp * z1;
  const z2 = sp * y + cp * z1;

  const depth = camera.distance + z2;
  const focal = 1.6 * Math.min(width, height);
  const scale = focal / Math.max(depth, 1e-9);
  return {
    x: width * 0.5 + x1 * scale,
    y: height * 0.5 - y2 * scale,
    depth,
  };
}

export function defaultCamera(): Camera3 {
  return { yaw: 0.85, pitch: 0.35, distance: 0.08 };
}
