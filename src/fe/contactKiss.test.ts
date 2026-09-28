import { describe, expect, it } from "vitest";
import { CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT, CONTACT_KISS } from "../inflate/constants.js";
import { applyKissProjection, closestPointOnTriangle } from "./contactKiss.js";

describe("TYPE19-class node-to-segment kiss", () => {
  it("projects a node through Gapmin and reports viol=0 after the press", () => {
    const kiss = CONTACT_KISS;
    const coords = new Float64Array([
      0, 0, 0, 0.02, 0, 0, 0, 0.02, 0, 0.02, 0.02, 0, 0.005, 0.005, kiss * 0.25, 0.025, 0.005, kiss * 0.25, 0.005,
      0.025, kiss * 0.25, 0.025, 0.025, kiss * 0.25,
    ]);
    const quads = [0, 1, 3, 2, 4, 5, 7, 6];
    const before = closestPointOnTriangle(
      coords[12]!,
      coords[13]!,
      coords[14]!,
      coords[0]!,
      coords[1]!,
      coords[2]!,
      coords[3]!,
      coords[4]!,
      coords[5]!,
      coords[9]!,
      coords[10]!,
      coords[11]!,
    );
    expect(before.d).toBeLessThan(kiss);
    const first = applyKissProjection({ coords, quads, kiss });
    expect(first.contactClass).toBe(CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT);
    expect(first.pushed).toBeGreaterThan(0);
    expect(first.minGap).toBeGreaterThan(before.d);
    let result = first;
    for (let sweep = 0; sweep < 8; sweep++) {
      result = applyKissProjection({ coords, quads, kiss });
    }
    expect(result.viol).toBe(0);
    expect(result.minGap).toBeGreaterThanOrEqual(kiss - 1e-8);
  });

  it("is labeled TYPE19-class, not bitwise Radioss TYPE19", () => {
    expect(CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT).toBe("type19-class-node-to-segment");
  });
});
