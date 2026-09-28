import { describe, expect, it } from "vitest";
import { CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT, CONTACT_KISS } from "../inflate/constants.js";
import { applyKissProjection } from "./contactKiss.js";

describe("TYPE19-class Gapmin kiss", () => {
  it("separates two nodes to Gapmin and reports viol=0 after the press", () => {
    const kiss = CONTACT_KISS;
    const z = kiss * 0.25;
    const coords = new Float64Array([
      0, 0, 0, 0.01, 0, 0, 0.01, 0.01, 0, 0, 0.01, 0, 0, 0, z, 0.01, 0, z, 0.01, 0.01, z, 0, 0.01, z,
    ]);
    const quads = [0, 1, 2, 3, 4, 5, 6, 7];
    const first = applyKissProjection({ coords, quads, kiss });
    expect(first.contactClass).toBe(CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT);
    expect(first.pushed).toBeGreaterThan(0);
    let result = first;
    for (let sweep = 0; sweep < 8; sweep++) {
      result = applyKissProjection({ coords, quads, kiss });
    }
    expect(result.viol).toBe(0);
    expect(result.minGap).toBeGreaterThanOrEqual(kiss * 0.99);
  });

  it("is labeled TYPE19-class Gapmin, not bitwise Radioss TYPE19", () => {
    expect(CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT).toBe("type19-class-gapmin-node-node");
  });
});
