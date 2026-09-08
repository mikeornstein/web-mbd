/**
 * Parse OpenRadioss state (`.sta`) `/NODE` blocks written by `stat_node.F`:
 *   WRITE(IUGEO,'(I10,1P3E20.13)') ITAB(I), X, Y, Z
 *
 * E20.13 ≈ 14 decimal digits — suitable for float64 oracle compare.
 * Anim→VTK remains float32 and cannot support Object.is gates.
 */

export interface StaNodeBlock {
  /** Node user IDs (ITAB), parallel to coords. */
  ids: Int32Array;
  /** XYZ packed as [x0,y0,z0, …] in file order. */
  coords: Float64Array;
}

/** Find the last `/NODE` section and parse all (id,x,y,z) rows until the next `/` card. */
export function parseStaNodes(sta: string): StaNodeBlock {
  const lines = sta.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t === "/NODE" || t.startsWith("/NODE ")) start = i + 1;
  }
  if (start < 0) throw new Error("state file missing /NODE section");

  const ids: number[] = [];
  const coords: number[] = [];
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith("#")) continue;
    if (t.startsWith("/")) break;
    // Fixed-ish: I10 + 3×E20.13, but tolerate free-form whitespace splits.
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length < 4) {
      throw new Error(`bad /NODE row at line ${i + 1}: ${t}`);
    }
    const id = Number(parts[0]);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if (![id, x, y, z].every(Number.isFinite)) {
      throw new Error(`non-finite /NODE values at line ${i + 1}: ${t}`);
    }
    ids.push(id | 0);
    coords.push(x, y, z);
  }
  if (ids.length === 0) throw new Error("state file /NODE section has no nodes");
  return { ids: Int32Array.from(ids), coords: Float64Array.from(coords) };
}

/**
 * Return coords sorted by ascending node ID (stable for same-mesh web-mbd ↔ OR).
 * web-mbd uses 0-based contiguous indices ≡ Radioss ITAB = index+1 when exported 1..N.
 */
export function coordsSortedById(block: StaNodeBlock): Float64Array {
  const n = block.ids.length;
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => block.ids[a]! - block.ids[b]!);
  const out = new Float64Array(n * 3);
  for (let k = 0; k < n; k++) {
    const src = order[k]! * 3;
    const dst = k * 3;
    out[dst] = block.coords[src]!;
    out[dst + 1] = block.coords[src + 1]!;
    out[dst + 2] = block.coords[src + 2]!;
  }
  return out;
}

export function shapeFromSta(
  sta: string,
  length0: number,
  radius0: number,
  options: { expectedNodes?: number } = {},
): {
  finalLength: number;
  finalMaxRadius: number;
  lengthRatio: number;
  radiusRatio: number;
  coords: Float64Array;
  nodeIds: Int32Array;
} {
  const block = parseStaNodes(sta);
  if (options.expectedNodes !== undefined && block.ids.length !== options.expectedNodes) {
    throw new Error(
      `state /NODE count ${block.ids.length} != expected ${options.expectedNodes}`,
    );
  }
  const coords = coordsSortedById(block);
  let zMin = Infinity;
  let zMax = -Infinity;
  let rMax = 0;
  const n = coords.length / 3;
  for (let p = 0; p < n; p++) {
    const x = coords[p * 3]!;
    const y = coords[p * 3 + 1]!;
    const z = coords[p * 3 + 2]!;
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
    rMax = Math.max(rMax, Math.hypot(x, y));
  }
  const finalLength = zMax - zMin;
  // Preserve ID order matching sorted coords.
  const nodeIds = Int32Array.from(
    Array.from({ length: n }, (_, i) => i)
      .sort((a, b) => block.ids[a]! - block.ids[b]!)
      .map((i) => block.ids[i]!),
  );
  return {
    finalLength,
    finalMaxRadius: rMax,
    lengthRatio: finalLength / length0,
    radiusRatio: rMax / radius0,
    coords,
    nodeIds,
  };
}
