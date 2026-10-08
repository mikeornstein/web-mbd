import { expect, test } from "vitest";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { H0, MU, RAYLEIGH_ALPHA } from "./constants.js";
import { trueEnclosedVolume } from "./meshA.js";
import {
  SPHERE_LAMBDA_STAR,
  SLOW_SPHERE_RAMP_S,
  SPHERE_HOLD_P_PA,
  SPHERE_R0_STATED_M,
  buildSphereMesh,
  createSlowSphereModel,
  invertNhSphereStretch,
  nhSpherePressure,
  orientedEquivalentSphere,
  createSphereProbeModel,
  slowSphereRayleighAlpha,
  sphereBreathingPeriodS,
  sphereCircuitPeriodS,
} from "./slowSphere.js";

test("closed-form sphere limit is 32.02 kPa at stretch 7^(1/6) for the oriented equivalent R0", () => {
  const sph = orientedEquivalentSphere();
  expect(sph.H0_m).toBe(H0);
  expect(sph.V0_m3 * 1e6).toBeCloseTo(420.5, 0);
  expect(sph.R0_m * 1000).toBeCloseTo(46.48, 2);
  expect(SPHERE_LAMBDA_STAR).toBeCloseTo(7 ** (1 / 6), 12);
  expect(SPHERE_LAMBDA_STAR).toBeCloseTo(1.383, 3);
  expect(sph.pMax_Pa / 1000).toBeCloseTo(32.02, 2);
  expect(nhSpherePressure(SPHERE_LAMBDA_STAR, MU, H0, sph.R0_m)).toBe(sph.pMax_Pa);
});

test("diagnosis sphere mesh is a closed outward shell at that R0, not Letter A", () => {
  const sph = orientedEquivalentSphere();
  const mesh = buildSphereMesh(sph.R0_m);
  expect(mesh.nQuads).toBe(0);
  expect(mesh.nTris).toBe(1280);
  expect(mesh.nNodes).toBe(642);
  const v = trueEnclosedVolume(mesh.coords, mesh.quads, mesh.tris);
  expect(v).toBeGreaterThan(0);
  expect(mesh.fingerprint).not.toBe(createInflateAModel().mesh.fingerprint);
});

test("independent closed-form invert at 28 kPa is 1.18757 on the stated 46.48 mm sphere", () => {
  const lam = invertNhSphereStretch(SPHERE_HOLD_P_PA, MU, H0, SPHERE_R0_STATED_M);
  expect(lam).toBeCloseTo(1.18757, 5);
  expect(nhSpherePressure(lam, MU, H0, SPHERE_R0_STATED_M)).toBeCloseTo(SPHERE_HOLD_P_PA, 6);
  const pStar = nhSpherePressure(SPHERE_LAMBDA_STAR, MU, H0, SPHERE_R0_STATED_M);
  expect(pStar / 1000).toBeCloseTo(32.023, 3);
  expect(nhSpherePressure(1.318, MU, H0, SPHERE_R0_STATED_M) / pStar).toBeCloseTo(0.9907, 4);
  expect(nhSpherePressure(1.34, MU, H0, SPHERE_R0_STATED_M) / pStar).toBeCloseTo(0.9962, 4);
});

test("slow-sphere model is kill-off, 400 ms to closed-form p_max; shipped Letter A is also kill-off", () => {
  const sph = orientedEquivalentSphere();
  const model = createSlowSphereModel();
  expect(model.controls.damping).toEqual({ kind: "off" });
  expect(model.controls.dtMax).toBeUndefined();
  expect(model.law.tRamp).toBe(SLOW_SPHERE_RAMP_S);
  expect(model.law.pMax).toBe(sph.pMax_Pa);
  expect(model.law.rayleighAlpha).toBeCloseTo(slowSphereRayleighAlpha(sph.R0_m), 12);
  expect(sphereCircuitPeriodS(sph.R0_m)).toBeCloseTo(0.0032, 3);
  expect(sphereBreathingPeriodS(sph.R0_m)).toBeCloseTo(0.00553, 4);
  expect(createInflateAModel().controls.damping).toEqual({ kind: "off" });
  expect(createInflateAModel().controls.dtMax).toBeUndefined();
});

test("sphere probe model is kill-off with starter Rayleigh 80 /s; shipped Letter A is also kill-off", () => {
  const model = createSphereProbeModel({
    pMax: SPHERE_HOLD_P_PA,
    tRamp: 0.4,
    endTime: 0.55,
    rayleighAlpha: RAYLEIGH_ALPHA,
  });
  expect(model.controls.damping).toEqual({ kind: "off" });
  expect(model.law.rayleighAlpha).toBe(80);
  expect(model.law.pMax).toBe(28_000);
  expect(createInflateAModel().controls.damping.kind).toBe("off");
});
