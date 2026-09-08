import { describe, expect, it } from "vitest";
import { meanDilatationOperators, meanDilatationRate } from "../src/fe/hex.js";

function unitCube(): Float64Array {
  // Radioss node order: 1(0,0,0) 2(1,0,0) 3(1,1,0) 4(0,1,0) 5(0,0,1) 6(1,0,1) 7(1,1,1) 8(0,1,1)
  return Float64Array.from([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
  ]);
}

describe("H8C mean-dilatation PXC", () => {
  it("recovers unit volume and isotropic compression on the unit cube", () => {
    const x = unitCube();
    const ops = meanDilatationOperators(x);
    expect(ops.det).toBeCloseTo(1, 12);

    // Uniform compression: v = (-x, -y, -z) relative to cube center → div v = -3
    const v = new Float64Array(24);
    for (let a = 0; a < 8; a++) {
      v[a * 3] = -(x[a * 3]! - 0.5);
      v[a * 3 + 1] = -(x[a * 3 + 1]! - 0.5);
      v[a * 3 + 2] = -(x[a * 3 + 2]! - 0.5);
    }
    const dvc = meanDilatationRate(ops.pxc, ops.pyc, ops.pzc, v);
    expect(dvc).toBeCloseTo(-3, 10);
  });
});
