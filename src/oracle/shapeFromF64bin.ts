/**
 * Parse OpenRadioss host float64 node dumps written beside `.sta` by a
 * patched `stat_node.F`:
 *
 *   ACCESS='STREAM', FORM='UNFORMATTED'
 *   WRITE(unit) ITAB(I), X(1,I), X(2,I), X(3,I)
 *
 * Record layout (little-endian): int32 ITAB + 3×float64 XYZ (28 bytes/node).
 * Prefer this over E20.13 `.sta` text when Object.is gates are required.
 */

import { coordsSortedById, type StaNodeBlock } from "./shapeFromSta.js";

export const F64BIN_RECORD_BYTES = 4 + 3 * 8;

/**
 * OpenRadioss `stat_node.F` zeroes |X|≤1e-90 before E20.13 print. Host dumps
 * retain tinier underflows (~1e-22…1e-45) that break Object.is against a clean
 * web-mbd state. Scrub both sides with this floor before bitwise compares.
 */
export const F64BIN_NEAR_ZERO = 1e-18;

/** Wipe |x|≤eps to +0 (matches Radioss near-zero policy for Object.is). */
export function scrubNearZeros(
  coords: ArrayLike<number>,
  eps: number = F64BIN_NEAR_ZERO,
): Float64Array {
  const out = new Float64Array(coords.length);
  for (let i = 0; i < coords.length; i++) {
    const v = coords[i]!;
    out[i] = Math.abs(v) <= eps ? 0 : v;
  }
  return out;
}

/** Parse a `.f64bin` buffer into ID + XYZ arrays (file order). */
export function parseF64binNodes(buf: ArrayBuffer | Uint8Array): StaNodeBlock {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.byteLength % F64BIN_RECORD_BYTES !== 0) {
    throw new Error(
      `f64bin size ${bytes.byteLength} is not a multiple of ${F64BIN_RECORD_BYTES}`,
    );
  }
  const n = bytes.byteLength / F64BIN_RECORD_BYTES;
  if (n === 0) throw new Error("f64bin has no nodes");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ids = new Int32Array(n);
  const coords = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const off = i * F64BIN_RECORD_BYTES;
    ids[i] = view.getInt32(off, true);
    coords[i * 3] = view.getFloat64(off + 4, true);
    coords[i * 3 + 1] = view.getFloat64(off + 12, true);
    coords[i * 3 + 2] = view.getFloat64(off + 20, true);
  }
  return { ids, coords };
}

export function shapeFromF64bin(
  buf: ArrayBuffer | Uint8Array,
  length0: number,
  radius0: number,
  options: { expectedNodes?: number; scrubEps?: number } = {},
): {
  finalLength: number;
  finalMaxRadius: number;
  lengthRatio: number;
  radiusRatio: number;
  coords: Float64Array;
  nodeIds: Int32Array;
} {
  const block = parseF64binNodes(buf);
  if (options.expectedNodes !== undefined && block.ids.length !== options.expectedNodes) {
    throw new Error(
      `f64bin node count ${block.ids.length} != expected ${options.expectedNodes}`,
    );
  }
  const scrubEps = options.scrubEps ?? F64BIN_NEAR_ZERO;
  const coords = scrubNearZeros(coordsSortedById(block), scrubEps);
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
