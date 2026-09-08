import { describe, expect, it } from "vitest";
import {
  coordsSortedById,
  parseStaNodes,
  shapeFromSta,
} from "../src/oracle/shapeFromSta.js";
import { alignedCoordGap } from "../src/oracle/compare.js";

const SAMPLE_STA = `#RADIOSS STATE FILE TAYLOR_0001.sta
/BEGIN
TAYLOR
      2023         0
  1.0000000000000E+00  1.0000000000000E+00  1.0000000000000E+00
  1.0000000000000E+00  1.0000000000000E+00  1.0000000000000E+00
/NODE
#    NODID               XCOOR               YCOOR               ZCOOR
         2 1.0000000000000E-03-2.0000000000000E-03 3.0000000000000E-02
         1 0.0000000000000E+00 0.0000000000000E+00 0.0000000000000E+00
         3 3.2000000000000E-03 0.0000000000000E+00 3.2400000000000E-02
/BRICK/         1
`;

describe("shapeFromSta", () => {
  it("parses E20.13 /NODE rows and sorts by ITAB", () => {
    const block = parseStaNodes(SAMPLE_STA);
    expect(block.ids.length).toBe(3);
    const sorted = coordsSortedById(block);
    expect(sorted[0]).toBe(0);
    expect(sorted[1]).toBe(0);
    expect(sorted[2]).toBe(0);
    expect(sorted[3]).toBe(1e-3);
    expect(sorted[4]).toBe(-2e-3);
    expect(sorted[5]).toBe(3e-2);
    expect(sorted[6]).toBe(3.2e-3);
    expect(sorted[8]).toBe(3.24e-2);
  });

  it("computes Taylor shape metrics from float64 state", () => {
    const shape = shapeFromSta(SAMPLE_STA, 32.4e-3, 3.2e-3, { expectedNodes: 3 });
    expect(shape.finalLength).toBeCloseTo(3.24e-2, 15);
    expect(shape.finalMaxRadius).toBeCloseTo(3.2e-3, 15);
    expect(shape.lengthRatio).toBeCloseTo(1, 12);
    expect(shape.radiusRatio).toBeCloseTo(1, 12);
    expect(shape.nodeIds[0]).toBe(1);
    expect(shape.nodeIds[2]).toBe(3);
  });

  it("alignedCoordGap reports Object.is when identical", () => {
    const shape = shapeFromSta(SAMPLE_STA, 32.4e-3, 3.2e-3);
    const gap = alignedCoordGap(shape.coords, shape.coords);
    expect(gap.bitwiseEqual).toBe(true);
    expect(gap.max).toBe(0);
  });
});
