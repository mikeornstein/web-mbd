import { describe, expect, it } from "vitest";
import { H0, MU, NU } from "../inflate/constants.js";
import { buildCstRest } from "./membraneCst.js";
import { accumulateHingeForces, buildShellHinges, flexuralRigidity } from "./shellHinge.js";

describe("QS Kirchhoff hinge bending (Ithick=1, not a μ retune)", () => {
  it("computes D from locked μ, H0, ν", () => {
    const E = 2 * MU * (1 + NU);
    const D = flexuralRigidity(MU, H0, NU);
    expect(D).toBeCloseTo((E * H0 ** 3) / (12 * (1 - NU * NU)), 12);
  });

  it("resists flattening a 90° extrusion corner", () => {
    const coords0 = [
      0, 0, 0, 0.01, 0, 0, 0.01, 0.01, 0, 0, 0, 0.01, 0.01, 0, 0.01, 0, 0.01, 0.01,
    ];
    const restA = buildCstRest(coords0, 0, 1, 2);
    const restB = buildCstRest(coords0, 0, 3, 1);
    expect(restA).not.toBeNull();
    expect(restB).not.toBeNull();
    if (!restA || !restB) return;
    const hinges = buildShellHinges(coords0, [restA, restB], MU, H0, NU);
    expect(hinges.length).toBeGreaterThan(0);
    const x = Float64Array.from(coords0);
    x[2 * 3 + 2] = 0.003;
    const f = new Float64Array(x.length);
    let W = 0;
    for (const h of hinges) W += accumulateHingeForces(x, h, f);
    expect(W).toBeGreaterThan(0);
    expect(f[2 * 3 + 2]!).not.toBe(0);
  });
});
