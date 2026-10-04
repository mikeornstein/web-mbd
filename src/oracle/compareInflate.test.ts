import { describe, expect, it } from "vitest";
import { LOAD_FAMILY_DYNAMIC_PLOAD_40MS, LOAD_FAMILY_QS_ISH_PLOAD_400MS, MU, RHO, SHIP_SHELL_QUADS } from "../inflate/constants.js";
import { lockedLawCard } from "../inflate/lawCard.js";
import { enclosedVolume, loadShipMesh, loadShipMeshA } from "../inflate/meshA.js";
import { compareInflateToGolden, DIAGNOSIS_TOY_SNAP, diagnosisMissMatchesLock } from "./compareInflate.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "./inflateGolden.js";
import type { InflateLawCard, InflateWarnMetrics } from "../inflate/types.js";

describe("inflate Radioss golden + law card", () => {
  it("locks μ/ρ/H0 to the RUN.md formula (no retune)", () => {
    const law = lockedLawCard();
    expect(law.mu1).toBe(MU);
    expect(law.mu1).toBe((800 * 6894.757) / 1.75);
    expect(law.rho).toBe(RHO);
    expect(law.rho).toBe(1130);
    expect(law.h0).toBe(0.015 * 0.0254);
    expect(law.alpha1).toBe(2);
    expect(law.loadFamily).toBe(LOAD_FAMILY_DYNAMIC_PLOAD_40MS);
    assertGoldenLawMatchesLock();
  });

  it("ship A mesh is Design-PASS quad family NUMELC=1554 / NUMELTG=0", () => {
    const mesh = loadShipMeshA();
    const golden = loadInflateGolden();
    expect(mesh.nNodes).toBe(1554);
    expect(mesh.nQuads).toBe(SHIP_SHELL_QUADS);
    expect(mesh.nQuads).toBe(1554);
    expect(mesh.nTris).toBe(0);
    expect(mesh.letter).toBe("A");
    expect(mesh.fingerprint).toBe(golden.mesh.fingerprint);
    expect(golden.mesh.NUMELC).toBe(1554);
    expect(golden.mesh.NUMELTG).toBe(0);
    const v0mL = enclosedVolume(mesh.coords, mesh.quads) * 1e6;
    expect(v0mL).toBeCloseTo(420.5, 0);
    expect(golden.mesh.fingerprint).toBe("f9635c7f");
  });

  it("compare harness fails on μ retune and unlabeled load swap", () => {
    const golden = loadInflateGolden();
    const warn: InflateWarnMetrics = {
      frame: golden.warn.frame,
      t: golden.warn.t,
      lambdaMax: golden.warn.lambdaMax,
      p: golden.warn.p,
      volume_mL: golden.warn.volume_mL,
      psi_J: golden.warn.psi_J,
      warn: true,
    };
    const retuned: InflateLawCard = { ...lockedLawCard(), mu1: MU * 1.1 };
    const muFail = compareInflateToGolden(
      {
        warn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: retuned,
      },
      golden,
    );
    expect(muFail.ok).toBe(false);
    expect(muFail.lawEqual).toBe(false);

    const missingWarn = compareInflateToGolden(
      {
        warn: null,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 0,
        law: lockedLawCard(),
      },
      golden,
    );
    expect(missingWarn.ok).toBe(false);
    expect(missingWarn.reasons.some((r) => r.includes("WARN_LAM"))).toBe(true);

    const pass = compareInflateToGolden(
      {
        warn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: lockedLawCard(),
      },
      golden,
    );
    expect(pass.ok).toBe(true);

    const qsSwap = compareInflateToGolden(
      {
        warn: { ...warn, p: 54100 },
        loadFamily: LOAD_FAMILY_QS_ISH_PLOAD_400MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: { ...lockedLawCard(), loadFamily: LOAD_FAMILY_QS_ISH_PLOAD_400MS, tRamp: 0.4 },
      },
      golden,
    );
    expect(qsSwap.ok).toBe(false);
    expect(qsSwap.loadFamilyEqual).toBe(false);
  });

  it("B and C ship meshes load with the same constitutive locks", () => {
    const a = lockedLawCard();
    const b = loadShipMesh("B");
    const c = loadShipMesh("C");
    expect(b.letter).toBe("B");
    expect(c.letter).toBe("C");
    expect(b.nNodes).toBe(1087);
    expect(c.nNodes).toBe(988);
    expect(b.nTris).toBeGreaterThan(0);
    expect(c.nTris).toBeGreaterThan(0);
    expect(a.mu1).toBe(MU);
    expect(a.gapMin).toBe(0.000762);
    expect(enclosedVolume(b.coords, b.quads, b.tris)).toBeGreaterThan(0);
    expect(enclosedVolume(c.coords, c.quads, c.tris)).toBeGreaterThan(0);
  });

  it("checked-in golden JSON is the outward-oriented fast-load desk, not slow-load", () => {
    const golden = loadInflateGolden();
    expect(golden.provenance.source).toBe("openradioss");
    expect(golden.loadFamily).toBe("dynamic-pload-40ms");
    expect(golden.bands.lambdaRel).toBe(0.02);
    expect(golden.bands.volumeRel).toBe(0.05);
    expect(golden.bands.pressureRel).toBe(0.05);
    expect(golden.warn.volume_mL).toBeGreaterThan(0);
    expect(golden.provenance.note).toContain("not ABC QS");
    expect(golden.provenance.note).toContain("Do not retune");
    expect(golden.provenance.note.toLowerCase()).toContain("outward");
  });

  it("diagnosis lock (not a physics pass) rejects a band-widen PASS and accepts the recorded snap miss", () => {
    const golden = loadInflateGolden();
    const snapWarn: InflateWarnMetrics = {
      frame: DIAGNOSIS_TOY_SNAP.frame,
      t: 0.02400758092700195,
      lambdaMax: DIAGNOSIS_TOY_SNAP.lambdaMax,
      p: 39012.31900637817,
      volume_mL: DIAGNOSIS_TOY_SNAP.volume_mL,
      psi_J: 80.91495778156124,
      warn: true,
    };
    const miss = compareInflateToGolden(
      {
        warn: snapWarn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: snapWarn.psi_J,
        law: lockedLawCard(),
      },
      golden,
    );
    expect(miss.ok).toBe(false);
    const lock = diagnosisMissMatchesLock(miss, golden, snapWarn);
    expect(lock.ok).toBe(true);

    const matchingWarn: InflateWarnMetrics = {
      frame: golden.warn.frame,
      t: golden.warn.t,
      lambdaMax: golden.warn.lambdaMax,
      p: golden.warn.p,
      volume_mL: golden.warn.volume_mL,
      psi_J: golden.warn.psi_J,
      warn: true,
    };
    const pass = compareInflateToGolden(
      {
        warn: matchingWarn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: lockedLawCard(),
      },
      golden,
    );
    expect(pass.ok).toBe(true);
    const passLock = diagnosisMissMatchesLock(pass, golden, matchingWarn);
    expect(passLock.ok).toBe(false);
    expect(passLock.reasons.some((r) => r.includes("PASS"))).toBe(true);

    const widened = {
      ...golden,
      bands: { lambdaRel: 2, volumeRel: 5, pressureRel: 5 },
    };
    const fakePass = compareInflateToGolden(
      {
        warn: snapWarn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: snapWarn.psi_J,
        law: lockedLawCard(),
      },
      widened,
    );
    expect(fakePass.ok).toBe(true);
    const widenLock = diagnosisMissMatchesLock(fakePass, widened, snapWarn);
    expect(widenLock.ok).toBe(false);
    expect(widenLock.reasons.some((r) => r.includes("widen"))).toBe(true);
  });
});
