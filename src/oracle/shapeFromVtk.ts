/** Extract Taylor shape metrics from an anim_to_vtk VTK file. */
export function shapeFromVtk(
  vtk: string,
  length0: number,
  radius0: number,
  options: { expectedNodes?: number } = {},
): {
  finalLength: number;
  finalMaxRadius: number;
  lengthRatio: number;
  radiusRatio: number;
} {
  const points: number[] = [];
  const lines = vtk.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("POINTS")) i += 1;
  if (i >= lines.length) throw new Error("VTK missing POINTS");
  const declared = Number(lines[i]!.split(/\s+/)[1]);
  i += 1;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line || /^(CELLS|CELL_TYPES|POINT_DATA|CELL_DATA|VECTORS|SCALARS)/.test(line)) break;
    for (const tok of line.split(/\s+/)) {
      if (tok.length === 0) continue;
      points.push(Number(tok));
    }
    i += 1;
  }
  if (points.length < 9 || points.length % 3 !== 0) {
    throw new Error(`bad VTK point count ${points.length}`);
  }
  // OpenRadioss anim VTK appends rigid-wall corner markers after mesh nodes.
  const nPts = points.length / 3;
  const useN =
    options.expectedNodes !== undefined
      ? Math.min(options.expectedNodes, nPts)
      : Math.min(declared || nPts, nPts);
  let zMin = Infinity;
  let zMax = -Infinity;
  let rMax = 0;
  for (let p = 0; p < useN; p++) {
    const x = points[p * 3]!;
    const y = points[p * 3 + 1]!;
    const z = points[p * 3 + 2]!;
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
    rMax = Math.max(rMax, Math.hypot(x, y));
  }
  const finalLength = zMax - zMin;
  return {
    finalLength,
    finalMaxRadius: rMax,
    lengthRatio: finalLength / length0,
    radiusRatio: rMax / radius0,
  };
}
