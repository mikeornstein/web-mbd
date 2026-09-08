import { describe, expect, it } from "vitest";
import { alignedCoordGap, compareToOracle, nearestNeighborGap } from "./compare.js";
import { shapeFromVtk } from "./shapeFromVtk.js";


describe("oracle helpers", () => {
  it("parses VTK points and ignores trailing wall markers when expectedNodes set", () => {
    const vtk = `# vtk DataFile Version 3.0
vtk output
ASCII
DATASET UNSTRUCTURED_GRID
POINTS 5 float
0 0 0
0 0 0.01
0.003 0 0
0.003 0 0.01
0.05 0.05 0
`;
    const shape = shapeFromVtk(vtk, 0.01, 0.003, { expectedNodes: 4 });
    expect(shape.lengthRatio).toBeCloseTo(1, 6);
    expect(shape.radiusRatio).toBeCloseTo(1, 6);
  });

  it("compares relative shape errors against tolerances", () => {
    const near = compareToOracle(
      { lengthRatio: 0.6665610, radiusRatio: 2.2318910 },
      { lengthRatio: 0.6665617, radiusRatio: 2.2318897 },
    );
    expect(near.lengthRelError).toBeLessThan(1e-5);
    expect(near.radiusRelError).toBeLessThan(2e-5);
    expect(near.ok).toBe(true);
    expect(near.bitwiseEqual).toBe(false);

    const far = compareToOracle(
      { lengthRatio: 0.62, radiusRatio: 1.5 },
      { lengthRatio: 0.67, radiusRatio: 2.2 },
    );
    expect(far.ok).toBe(false);
  });

  it("reports zero nearest-neighbor gap on identical clouds", () => {
    const pts = Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const nn = nearestNeighborGap(pts, pts);
    expect(nn.max).toBe(0);
    expect(nn.mean).toBe(0);
  });

  it("alignedCoordGap is Object.is when buffers match bit-for-bit", () => {
    const a = Float64Array.from([0, 0, 0, 1, 2, 3]);
    const b = Float64Array.from(a);
    expect(alignedCoordGap(a, b).bitwiseEqual).toBe(true);
    b[5] = 4;
    expect(alignedCoordGap(a, b).bitwiseEqual).toBe(false);
  });
});
