import { describe, expect, it } from "vitest";
import { compareToOracle } from "./compare.js";
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
    const cmp = compareToOracle(
      { lengthRatio: 0.62, radiusRatio: 1.5 },
      { lengthRatio: 0.67, radiusRatio: 2.2 },
    );
    expect(cmp.lengthRelError).toBeLessThan(0.12);
    expect(cmp.radiusRelError).toBeLessThan(0.45);
    expect(cmp.ok).toBe(true);
  });
});
