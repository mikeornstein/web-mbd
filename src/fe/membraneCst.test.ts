import { describe, expect, it } from "vitest";
import { H0, MU, WARN_LAM } from "../inflate/constants.js";
import { membranePsi, restI1PlaneStress } from "./materialNeoHookean.js";
import { accumulateCstForces, accumulatePressureQuad, accumulatePressureTri, accumulateQ4Forces, buildCstRest, buildQ4Rest, cstSample } from "./membraneCst.js";
import { enclosedVolume, loadShipMeshA } from "../inflate/meshA.js";

describe("neo-Hookean membrane constitutive", () => {
  it("is zero at the identity (Ψ ≈ 0, I1 = 3)", () => {
    expect(restI1PlaneStress(1, 1)).toBeCloseTo(3, 12);
    expect(membranePsi(3, 1)).toBeCloseTo(0, 12);
  });

  it("stays non-negative for equibiaxial stretch", () => {
    const I1 = restI1PlaneStress(2, 2);
    expect(I1).toBeGreaterThan(3);
    expect(membranePsi(I1, 0.01)).toBeGreaterThan(0);
  });

  it("condenses λ3 = 1/(λ1 λ2) so |λ1 λ2 λ3 − 1| is float noise", () => {
    const coords0 = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const rest = buildCstRest(coords0, 0, 1, 2);
    expect(rest).not.toBeNull();
    if (!rest) return;
    const sample = cstSample(coords0, rest);
    expect(sample.I1).toBeCloseTo(3, 10);
    expect(sample.W).toBeCloseTo(0, 12);
    expect(sample.incompressResidual).toBeLessThan(1e-12);
  });

  it("analytic forces match finite-difference −∂Ψ/∂x on a stretched triangle", () => {
    const coords0 = [0, 0, 0, 0.01, 0, 0, 0, 0.01, 0];
    const rest = buildCstRest(coords0, 0, 1, 2);
    expect(rest).not.toBeNull();
    if (!rest) return;
    const coords = Float64Array.from([0, 0, 0, 0.02, 0, 0, 0, 0.012, 0.001]);
    const f = new Float64Array(9);
    accumulateCstForces(coords, rest, f, MU, H0);
    const h = 1e-8;
    for (let dof = 0; dof < 9; dof++) {
      const plus = Float64Array.from(coords);
      const minus = Float64Array.from(coords);
      plus[dof]! += h;
      minus[dof]! -= h;
      const wp = cstSample(plus, rest, MU, H0).W;
      const wm = cstSample(minus, rest, MU, H0).W;
      const fd = -(wp - wm) / (2 * h);
      expect(f[dof]!).toBeCloseTo(fd, 4);
    }
  });

  it("does not treat WARN_LAM as a constitutive knob", () => {
    expect(WARN_LAM).toBe(2);
  });

  it("PLOAD tet gradient matches p ∂V/∂x on the closed ship-A surface", () => {
    const mesh = loadShipMeshA();
    const x = Float64Array.from(mesh.coords);
    const p = 2500;
    const f = new Float64Array(x.length);
    for (let e = 0; e < mesh.nQuads; e++) {
      const i0 = mesh.quads[e * 4]!,
        i1 = mesh.quads[e * 4 + 1]!,
        i2 = mesh.quads[e * 4 + 2]!,
        i3 = mesh.quads[e * 4 + 3]!;
      accumulatePressureTri(x, i0, i1, i2, p, f);
      accumulatePressureTri(x, i0, i2, i3, p, f);
    }
    const h = 1e-8;
    const dofs = [0, 1, 2, 17 * 3 + 1, 400 * 3 + 2, 1553 * 3];
    for (const dof of dofs) {
      const plus = Float64Array.from(x);
      const minus = Float64Array.from(x);
      plus[dof]! += h;
      minus[dof]! -= h;
      const dV =
        (enclosedVolume(plus, mesh.quads, mesh.tris) - enclosedVolume(minus, mesh.quads, mesh.tris)) /
        (2 * h);
      expect(f[dof]!).toBeCloseTo(p * dV, 6);
    }
  });

  it("Q4 mean-plane PLOAD is equal pA/4, not CST tet shares", () => {
    const coords = [0.1, 0.1, 0, 0.12, 0.1, 0, 0.12, 0.11, 0, 0.1, 0.11, 0];
    const p = 4000;
    const f = new Float64Array(12);
    accumulatePressureQuad(coords, 0, 1, 2, 3, p, f);
    const area = 0.02 * 0.01;
    const fz = (p * area) / 4;
    for (let n = 0; n < 4; n++) {
      expect(f[n * 3]!).toBeCloseTo(0, 12);
      expect(f[n * 3 + 1]!).toBeCloseTo(0, 12);
      expect(f[n * 3 + 2]!).toBeCloseTo(fz, 12);
    }
    const fTet = new Float64Array(12);
    accumulatePressureTri(coords, 0, 1, 2, p, fTet);
    accumulatePressureTri(coords, 0, 2, 3, p, fTet);
    let netQ = 0;
    for (let n = 0; n < 4; n++) {
      netQ += f[n * 3 + 2]!;
    }
    expect(netQ).toBeCloseTo(p * area, 12);
    expect(Math.abs(fTet[0 * 3 + 2]! - fTet[1 * 3 + 2]!)).toBeGreaterThan(1e-12);
    expect(Math.abs(f[0 * 3 + 2]! - fTet[0 * 3 + 2]!)).toBeGreaterThan(1e-12);
  });

  it("1-GP Q4 membrane forces match finite-difference −∂Ψ/∂x", () => {
    const coords0 = [0.1, 0.1, 0, 0.12, 0.1, 0, 0.12, 0.11, 0, 0.1, 0.11, 0];
    const rest = buildQ4Rest(coords0, 0, 1, 2, 3);
    expect(rest).not.toBeNull();
    if (!rest) return;
    expect(rest.A0).toBeCloseTo(0.02 * 0.01, 12);
    const coords = Float64Array.from([0.1, 0.1, 0, 0.125, 0.101, 0.002, 0.121, 0.114, 0.001, 0.098, 0.112, 0]);
    const f = new Float64Array(12);
    const { W } = accumulateQ4Forces(coords, rest, f, MU, H0);
    expect(W).toBeGreaterThan(0);
    const h = 1e-8;
    const scratch = new Float64Array(12);
    for (let dof = 0; dof < 12; dof++) {
      const plus = Float64Array.from(coords);
      const minus = Float64Array.from(coords);
      plus[dof]! += h;
      minus[dof]! -= h;
      scratch.fill(0);
      const wp = accumulateQ4Forces(plus, rest, scratch, MU, H0).W;
      scratch.fill(0);
      const wm = accumulateQ4Forces(minus, rest, scratch, MU, H0).W;
      const fd = -(wp - wm) / (2 * h);
      expect(f[dof]!).toBeCloseTo(fd, 5);
    }
  });
});
