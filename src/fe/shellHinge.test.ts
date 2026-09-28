import { describe, expect, it } from "vitest";
import { H0, MU, NU } from "../inflate/constants.js";
import { buildCstRest, splitQuadCsts } from "./membraneCst.js";
import {
  accumulateHingeForces,
  buildShellHinges,
  flexuralRigidity,
  meshEdgeKeys,
} from "./shellHinge.js";

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
    const tris = [0, 1, 2, 0, 3, 1];
    const hinges = buildShellHinges(coords0, [restA, restB], MU, H0, NU, meshEdgeKeys([], tris));
    expect(hinges.length).toBeGreaterThan(0);
    const x = Float64Array.from(coords0);
    x[2 * 3 + 2] = 0.003;
    const f = new Float64Array(x.length);
    let W = 0;
    for (const h of hinges) W += accumulateHingeForces(x, h, f);
    expect(W).toBeGreaterThan(0);
    expect(f[2 * 3 + 2]!).not.toBe(0);
  });

  it("analytic forces match finite-difference −∂W/∂x on an asymmetric fold", () => {
    const coords0 = [0, 0, 0, 0.012, 0, 0, 0.003, 0.009, 0, -0.002, 0, 0.008];
    const restA = buildCstRest(coords0, 0, 1, 2);
    const restB = buildCstRest(coords0, 0, 3, 1);
    expect(restA).not.toBeNull();
    expect(restB).not.toBeNull();
    if (!restA || !restB) return;
    const tris = [0, 1, 2, 0, 3, 1];
    const hinges = buildShellHinges(coords0, [restA, restB], MU, H0, NU, meshEdgeKeys([], tris));
    expect(hinges.length).toBe(1);
    const x = Float64Array.from(coords0);
    x[2 * 3 + 2] = 0.004;
    x[3 * 3] = -0.001;
    const f = new Float64Array(x.length);
    let W0 = 0;
    for (const h of hinges) W0 += accumulateHingeForces(x, h, f);
    expect(W0).toBeGreaterThan(0);
    const hStep = 1e-8;
    const scratch = new Float64Array(x.length);
    for (let dof = 0; dof < x.length; dof++) {
      const plus = Float64Array.from(x);
      const minus = Float64Array.from(x);
      plus[dof]! += hStep;
      minus[dof]! -= hStep;
      let wp = 0;
      let wm = 0;
      scratch.fill(0);
      for (const hinge of hinges) wp += accumulateHingeForces(plus, hinge, scratch);
      scratch.fill(0);
      for (const hinge of hinges) wm += accumulateHingeForces(minus, hinge, scratch);
      const fd = -(wp - wm) / (2 * hStep);
      expect(f[dof]!).toBeCloseTo(fd, 5);
    }
  });

  it("skips CST split diagonals so Q4 shells do not get a crease on i0–i2", () => {
    const coords0 = [0, 0, 0, 0.01, 0, 0, 0.01, 0.01, 0, 0, 0.01, 0];
    const pair = splitQuadCsts(coords0, 0, 1, 2, 3);
    expect(pair).not.toBeNull();
    if (!pair) return;
    const quads = [0, 1, 2, 3];
    const withDiag = buildShellHinges(coords0, [pair.a, pair.b], MU, H0, NU);
    const meshOnly = buildShellHinges(coords0, [pair.a, pair.b], MU, H0, NU, meshEdgeKeys(quads));
    expect(withDiag.length).toBe(1);
    expect(meshOnly.length).toBe(0);
  });
});
