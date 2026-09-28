import { describe, expect, it } from "vitest";
import { H0, MU, NU, RHO } from "../inflate/constants.js";
import {
  accumulateChvis3Forces,
  AREA_SHEAR,
  chvis3RectCoeffs,
  createHourglassState,
  HELAS,
  HVISC,
  HVLIN,
  law42Young,
  PROP_HF,
  PROP_HM,
} from "./belytschkoHourglass.js";
import { accumulateQ4Forces, buildQ4Rest } from "./membraneCst.js";

describe("Belytschko CHVIS3 hourglass (Ishell=1)", () => {
  it("locks Radioss coefficients (not a gain table)", () => {
    expect(HELAS).toBe(0.5);
    expect(HVISC).toBe(0.5);
    expect(HVLIN).toBe(0);
    expect(PROP_HM).toBe(0.01);
    expect(PROP_HF).toBe(0.01);
    expect(AREA_SHEAR).toBe(5 / 6);
    expect(law42Young(MU, NU)).toBe(2 * MU * (1 + NU));
  });

  it("matches CHVIS3 HH1/H1Q/HH2 on a unit square", () => {
    const dt = 1e-6;
    const c = chvis3RectCoeffs(0.01, dt, MU, RHO, NU, H0);
    const ym = 2 * MU * (1 + NU);
    const shfpr3 = (5 / 6) / (3 * (1 + NU));
    const r1 = 0.25 * RHO * 100;
    expect(c.hh1).toBeCloseTo(PROP_HM * 0.25 * ym * HELAS * H0 * dt, 12);
    expect(c.h1q).toBeCloseTo(r1 * HVISC * PROP_HM * H0 * 0.01, 12);
    expect(c.h2q).toBeCloseTo(r1 * HVISC * PROP_HF * Math.sqrt(shfpr3) * H0 * H0, 12);
    expect(c.hh2).toBeGreaterThan(0);
  });

  it("kills the out-of-plane warp mode (VZ +−+−)", () => {
    const L = 0.01;
    const coords = Float64Array.from([0, 0, 0, L, 0, 0, L, L, 0, 0, L, 0]);
    const rest = buildQ4Rest(coords, 0, 1, 2, 3);
    expect(rest).not.toBeNull();
    if (!rest) return;
    const v = Float64Array.from([0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, -1]);
    const f = new Float64Array(12);
    const state = createHourglassState();
    accumulateChvis3Forces(coords, v, 0, 1, 2, 3, rest.A0, state, 1e-6, f, MU, RHO, NU, H0);
    expect(f[2]!).toBeLessThan(0);
    expect(f[5]!).toBeGreaterThan(0);
    expect(f[8]!).toBeLessThan(0);
    expect(f[11]!).toBeGreaterThan(0);
    expect(Math.abs(f[2]! + f[5]! + f[8]! + f[11]!)).toBeLessThan(1e-18);
  });

  it("kills the in-plane membrane hourglass (VX +−+−)", () => {
    const L = 0.01;
    const coords = Float64Array.from([0, 0, 0, L, 0, 0, L, L, 0, 0, L, 0]);
    const rest = buildQ4Rest(coords, 0, 1, 2, 3);
    expect(rest).not.toBeNull();
    if (!rest) return;
    const v = Float64Array.from([1, 0, 0, -1, 0, 0, 1, 0, 0, -1, 0, 0]);
    const f = new Float64Array(12);
    const state = createHourglassState();
    accumulateChvis3Forces(coords, v, 0, 1, 2, 3, rest.A0, state, 1e-6, f, MU, RHO, NU, H0);
    expect(f[0]!).toBeLessThan(0);
    expect(f[3]!).toBeGreaterThan(0);
    expect(f[6]!).toBeLessThan(0);
    expect(f[9]!).toBeGreaterThan(0);
  });

  it("is silent on rigid translation and uniform stretch rate", () => {
    const L = 0.01;
    const coords = Float64Array.from([0, 0, 0, L, 0, 0, L, L, 0, 0, L, 0]);
    const rest = buildQ4Rest(coords, 0, 1, 2, 3);
    expect(rest).not.toBeNull();
    if (!rest) return;
    const fT = new Float64Array(12);
    accumulateChvis3Forces(
      coords,
      Float64Array.from([0.4, 0.1, -0.2, 0.4, 0.1, -0.2, 0.4, 0.1, -0.2, 0.4, 0.1, -0.2]),
      0,
      1,
      2,
      3,
      rest.A0,
      createHourglassState(),
      1e-6,
      fT,
      MU,
      RHO,
      NU,
      H0,
    );
    for (let i = 0; i < 12; i++) expect(Math.abs(fT[i]!)).toBeLessThan(1e-14);

    const rate = 2;
    const vStretch = Float64Array.from([
      0,
      0,
      0,
      rate * L,
      0,
      0,
      rate * L,
      rate * L,
      0,
      0,
      rate * L,
      0,
    ]);
    const fS = new Float64Array(12);
    accumulateChvis3Forces(coords, vStretch, 0, 1, 2, 3, rest.A0, createHourglassState(), 1e-6, fS, MU, RHO, NU, H0);
    for (let i = 0; i < 12; i++) expect(Math.abs(fS[i]!)).toBeLessThan(1e-12);
  });

  it("1-GP membrane is silent on warp; CHVIS3 is not", () => {
    const L = 0.01;
    const d = 2e-4;
    const coords0 = [0, 0, 0, L, 0, 0, L, L, 0, 0, L, 0];
    const rest = buildQ4Rest(coords0, 0, 1, 2, 3);
    expect(rest).not.toBeNull();
    if (!rest) return;
    const warped = Float64Array.from([0, 0, d, L, 0, -d, L, L, d, 0, L, -d]);
    const fMem = new Float64Array(12);
    const { W } = accumulateQ4Forces(warped, rest, fMem, MU, H0);
    expect(Math.abs(W)).toBeLessThan(1e-16);
    for (let i = 0; i < 12; i++) expect(Math.abs(fMem[i]!)).toBeLessThan(1e-12);
    const vWarp = Float64Array.from([0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, -1]);
    const fHg = new Float64Array(12);
    accumulateChvis3Forces(warped, vWarp, 0, 1, 2, 3, rest.A0, createHourglassState(), 1e-6, fHg, MU, RHO, NU, H0);
    expect(fHg[2]!).toBeLessThan(0);
    expect(Math.abs(fHg[2]!)).toBeGreaterThan(Math.abs(fMem[2]!) + 1e-18);
  });

  it("Ithick=1 uses 1-GP area, so pure warp does not retune THK", () => {
    const L = 0.01;
    const coords0 = Float64Array.from([0, 0, 0, L, 0, 0, L, L, 0, 0, L, 0]);
    const rest = buildQ4Rest(coords0, 0, 1, 2, 3);
    expect(rest).not.toBeNull();
    if (!rest) return;
    const v = Float64Array.from([0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, -1]);
    const f0 = new Float64Array(12);
    const fW = new Float64Array(12);
    accumulateChvis3Forces(coords0, v, 0, 1, 2, 3, rest.A0, createHourglassState(), 1e-6, f0, MU, RHO, NU, H0);
    const warped = Float64Array.from([0, 0, 5e-4, L, 0, -5e-4, L, L, 5e-4, 0, L, -5e-4]);
    accumulateChvis3Forces(warped, v, 0, 1, 2, 3, rest.A0, createHourglassState(), 1e-6, fW, MU, RHO, NU, H0);
    expect(fW[2]!).toBeCloseTo(f0[2]!, 6);
  });
});
