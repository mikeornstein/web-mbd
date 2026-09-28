import { describe, expect, it } from "vitest";
import { CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE, CONTACT_CLASS_TYPE19_GAPMIN_NODE_SEGMENT, CONTACT_KISS } from "../inflate/constants.js";
import { applyKissProjection, buildVertexStar2 } from "./contactKiss.js";

describe("TYPE19-class Gapmin kiss", () => {
  it("separates two nodes to Gapmin and reports viol=0 after the press", () => {
    const kiss = CONTACT_KISS;
    const z = kiss * 0.25;
    const coords = new Float64Array([
      0, 0, 0, 0.01, 0, 0, 0.01, 0.01, 0, 0, 0.01, 0, 0, 0, z, 0.01, 0, z, 0.01, 0.01, z, 0, 0.01, z,
    ]);
    const quads = [0, 1, 2, 3, 4, 5, 6, 7];
    const first = applyKissProjection({ coords, quads, kiss, kind: "node-node" });
    expect(first.contactClass).toBe(CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE);
    expect(first.pushed).toBeGreaterThan(0);
    let result = first;
    for (let sweep = 0; sweep < 8; sweep++) {
      result = applyKissProjection({ coords, quads, kiss, kind: "node-node" });
    }
    expect(result.viol).toBe(0);
    expect(result.minGap).toBeGreaterThanOrEqual(kiss * 0.99);
  });

  it("is labeled TYPE19-class Gapmin, not bitwise Radioss TYPE19", () => {
    expect(CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE).toBe("type19-class-gapmin-node-node");
    expect(CONTACT_CLASS_TYPE19_GAPMIN_NODE_SEGMENT).toBe("type19-class-gapmin-node-segment");
  });

  it("node-segment catches a staggered face that node-node misses at Gapmin", () => {
    const kiss = CONTACT_KISS;
    const z = kiss * 0.25;
    const shift = 0.005;
    const coordsNode = new Float64Array([
      0, 0, 0, 0.01, 0, 0, 0.01, 0.01, 0, 0, 0.01, 0, shift, shift, z, 0.01 + shift, shift, z, 0.01 + shift,
      0.01 + shift, z, shift, 0.01 + shift, z,
    ]);
    const coordsSeg = Float64Array.from(coordsNode);
    const quads = [0, 1, 2, 3, 4, 5, 6, 7];
    const nn = applyKissProjection({ coords: coordsNode, quads, kiss, kind: "node-node" });
    const ns = applyKissProjection({ coords: coordsSeg, quads, kiss, kind: "node-segment" });
    expect(nn.pushed).toBe(0);
    expect(nn.contactClass).toBe(CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE);
    expect(ns.pushed).toBeGreaterThan(0);
    expect(ns.contactClass).toBe(CONTACT_CLASS_TYPE19_GAPMIN_NODE_SEGMENT);
    let result = ns;
    for (let sweep = 0; sweep < 8; sweep++) {
      result = applyKissProjection({ coords: coordsSeg, quads, kiss, kind: "node-segment" });
    }
    expect(result.viol).toBe(0);
    expect(result.minGap).toBeGreaterThanOrEqual(kiss * 0.99);
  });

  it("QS 1-ring skip still kisses a U-fold lid that 2-hop skip ignores", () => {
    const kiss = CONTACT_KISS;
    const z = kiss * 0.4;
    const coords = new Float64Array([
      0, 0, 0, 0.01, 0, 0, 0.01, 0, z, 0, 0, z, 0, 0.01, 0, 0.01, 0.01, 0, 0.01, 0.01, z, 0, 0.01, z,
    ]);
    const quads = [0, 1, 5, 4, 1, 2, 6, 5, 2, 3, 7, 6];
    const oneRing = applyKissProjection({ coords: Float64Array.from(coords), quads, kiss, kind: "node-segment" });
    const twoHop = applyKissProjection({
      coords: Float64Array.from(coords),
      quads,
      kiss,
      kind: "node-segment",
      star2: buildVertexStar2(quads, 8),
    });
    expect(oneRing.pushed).toBeGreaterThan(0);
    expect(twoHop.pushed).toBe(0);
  });
});
