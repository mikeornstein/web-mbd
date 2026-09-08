import { describe, expect, it } from "vitest";
import {
  F64BIN_NEAR_ZERO,
  F64BIN_RECORD_BYTES,
  parseF64binNodes,
  scrubNearZeros,
  shapeFromF64bin,
} from "../src/oracle/shapeFromF64bin.js";
import { alignedCoordGap } from "../src/oracle/compare.js";
import { formatRadiossF20, snapToRadiossF20 } from "../src/oracle/exportRadioss.js";

/** Encode one host-float64 OR node record (LE int32 + 3×float64). */
function packNode(id: number, x: number, y: number, z: number): Uint8Array {
  const buf = new ArrayBuffer(F64BIN_RECORD_BYTES);
  const view = new DataView(buf);
  view.setInt32(0, id, true);
  view.setFloat64(4, x, true);
  view.setFloat64(12, y, true);
  view.setFloat64(20, z, true);
  return new Uint8Array(buf);
}

describe("shapeFromF64bin", () => {
  it("parses host float64 records and sorts by ITAB", () => {
    const parts = [
      packNode(2, 1e-3, -2e-3, 3e-2),
      packNode(1, 0, 0, 0),
      packNode(3, 3.2e-3, 0, 3.24e-2),
    ];
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
      buf.set(p, off);
      off += p.length;
    }
    const block = parseF64binNodes(buf);
    expect(block.ids.length).toBe(3);
    const shape = shapeFromF64bin(buf, 32.4e-3, 3.2e-3, { expectedNodes: 3 });
    expect(shape.nodeIds[0]).toBe(1);
    expect(shape.coords[0]).toBe(0);
    expect(shape.coords[3]).toBe(1e-3);
    expect(shape.finalLength).toBe(3.24e-2);
    expect(shape.finalMaxRadius).toBe(3.2e-3);
    expect(alignedCoordGap(shape.coords, shape.coords).bitwiseEqual).toBe(true);
  });

  it("scrubs host underflows that break Object.is", () => {
    const dirty = new Float64Array([1e-22, -3e-45, 1.0]);
    const clean = scrubNearZeros(dirty, F64BIN_NEAR_ZERO);
    expect(clean[0]).toBe(0);
    expect(clean[1]).toBe(0);
    expect(clean[2]).toBe(1);
  });

  it("rejects mis-sized buffers", () => {
    expect(() => parseF64binNodes(new Uint8Array(10))).toThrow(/multiple/);
  });
});

describe("Radioss F20 snap", () => {
  it("round-trips cylinder corner through deck field", () => {
    const x = -0.0032 / Math.SQRT2;
    const text = formatRadiossF20(x);
    expect(text.length).toBe(20);
    const snapped = snapToRadiossF20(x);
    expect(Object.is(snapped, Number(text.trim()))).toBe(true);
    // Full float64 √2 corner is not deck-identical without snap.
    expect(Object.is(x, snapped)).toBe(false);
  });
});
