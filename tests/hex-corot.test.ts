import { describe, expect, it } from "vitest";
import { hexCorotR, rotateNodes8 } from "../src/fe/hex.js";

describe("hexCorotR (Radioss SORTHO3 / SRCOOR3)", () => {
  it("is orthonormal with det≈+1 on an axis-aligned unit brick", () => {
    const x = new Float64Array([
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ]);
    const R = hexCorotR(x);
    // Column-major [e1|e2|e3]; for this node order R is a signed permutation, not I.
    for (let c = 0; c < 3; c++) {
      const n = Math.hypot(R[c * 3]!, R[c * 3 + 1]!, R[c * 3 + 2]!);
      expect(Math.abs(n - 1)).toBeLessThan(1e-14);
    }
    // e1·e2, e1·e3, e2·e3 ≈ 0
    const dot = (a: number, b: number) =>
      R[a * 3]! * R[b * 3]! + R[a * 3 + 1]! * R[b * 3 + 1]! + R[a * 3 + 2]! * R[b * 3 + 2]!;
    expect(Math.abs(dot(0, 1))).toBeLessThan(1e-14);
    expect(Math.abs(dot(0, 2))).toBeLessThan(1e-14);
    expect(Math.abs(dot(1, 2))).toBeLessThan(1e-14);
    const det =
      R[0]! * (R[4]! * R[8]! - R[7]! * R[5]!) -
      R[3]! * (R[1]! * R[8]! - R[7]! * R[2]!) +
      R[6]! * (R[1]! * R[5]! - R[4]! * R[2]!);
    expect(Math.abs(det - 1)).toBeLessThan(1e-14);
  });

  it("rotateNodes8 R then Rᵀ recovers vectors (Radioss convention)", () => {
    const x = new Float64Array([
      0, 0, 0, 1.1, 0.05, 0, 1.05, 1, 0.02, 0, 1, 0, 0.02, 0, 1, 1, 0.05, 1, 1, 1, 1.05, 0, 1, 1,
    ]);
    const R = hexCorotR(x);
    const v = new Float64Array(24);
    for (let i = 0; i < 24; i++) v[i] = (i + 1) * 0.01;
    const loc = new Float64Array(24);
    const back = new Float64Array(24);
    rotateNodes8(R, v, loc, false); // to local
    rotateNodes8(R, loc, back, true); // to global
    for (let i = 0; i < 24; i++) {
      expect(Math.abs(back[i]! - v[i]!)).toBeLessThan(1e-14);
    }
  });
});
