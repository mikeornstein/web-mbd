import { describe, expect, it } from "vitest";
import { LOAD_FAMILY_DYNAMIC_PLOAD_40MS, LOAD_FAMILY_QS_ISH_DEAD_PRESSURE, MU, RHO, SHIP_SHELL_QUADS } from "../inflate/constants.js";
import { lockedLawCard, lockedLawCardQsIsh } from "../inflate/lawCard.js";
import { enclosedVolume, loadShipMesh, loadShipMeshA } from "../inflate/meshA.js";
import { compareInflateToGolden, compareInflateToQsGolden } from "./compareInflate.js";
import {
  assertGoldenLawMatchesLock,
  assertQsGoldenLawMatchesLock,
  loadInflateGolden,
  loadInflateQsGolden,
} from "./inflateGolden.js";
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
    expect(v0mL).toBeCloseTo(354, 0);
  });

  it("compare harness fails on μ retune and unlabeled load swap", () => {
    const golden = loadInflateGolden();
    const warn: InflateWarnMetrics = {
      frame: 11,
      t: 0.022,
      lambdaMax: 2.14,
      p: 35769,
      volume_mL: 901.8,
      psi_J: 9.5,
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
        loadFamily: LOAD_FAMILY_QS_ISH_DEAD_PRESSURE,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: lockedLawCardQsIsh(),
      },
      golden,
    );
    expect(qsSwap.ok).toBe(false);
    expect(qsSwap.loadFamilyEqual).toBe(false);
  });

  it("QS Radioss golden is EMPTY and FAIL-closed", () => {
    assertQsGoldenLawMatchesLock();
    const qs = loadInflateQsGolden();
    expect(qs.status).toBe("EMPTY");
    expect(qs.loadFamily).toBe(LOAD_FAMILY_QS_ISH_DEAD_PRESSURE);
    expect(qs.law.mu1).toBe(MU);
    expect(qs.law.rho).toBe(RHO);
    expect(qs.law.pMax).toBe(54100);
    const mesh = loadShipMeshA();
    const closed = compareInflateToQsGolden(
      {
        warn: {
          frame: 1,
          t: 0.01,
          lambdaMax: 2.05,
          p: 54100,
          volume_mL: 900,
          psi_J: 10,
          warn: true,
        },
        loadFamily: LOAD_FAMILY_QS_ISH_DEAD_PRESSURE,
        meshFingerprint: mesh.fingerprint,
        punchedThrough: false,
        psi_J: 10,
        law: lockedLawCardQsIsh(),
      },
      qs,
    );
    expect(closed.ok).toBe(false);
    expect(closed.reasons.some((r) => r.includes("EMPTY"))).toBe(true);
    expect(closed.reasons.some((r) => r.includes("ABC QS apples"))).toBe(true);
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

  it("checked-in golden JSON is the PR#8 dynamic desk, not QS", () => {
    const golden = loadInflateGolden();
    expect(golden.provenance.source).toBe("openradioss");
    expect(golden.loadFamily).toBe("dynamic-pload-40ms");
    expect(golden.warn.p).toBe(35769);
    expect(golden.warn.lambdaMax).toBe(2.1404);
    expect(golden.warn.volume_mL).toBe(901.8);
    expect(golden.warn.psi_J).toBe(9.502);
    expect(golden.provenance.note).toContain("not ABC QS");
    expect(golden.provenance.note).toContain("Do not retune");
  });
});
