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
    const near = compareToOracle(
      { lengthRatio: 0.66666, radiusRatio: 2.2325 },
      { lengthRatio: 0.66656, radiusRatio: 2.2319 },
    );
    expect(near.lengthRelError).toBeLessThan(0.001);
    expect(near.radiusRelError).toBeLessThan(0.002);
    expect(near.ok).toBe(true);

    const far = compareToOracle(
      { lengthRatio: 0.62, radiusRatio: 1.5 },
      { lengthRatio: 0.67, radiusRatio: 2.2 },
    );
    expect(far.ok).toBe(false);
  });
});
