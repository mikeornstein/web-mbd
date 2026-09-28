import { describe, expect, it } from "vitest";
import { LOAD_FAMILY_DYNAMIC_PLOAD_40MS, MU, RHO, SHIP_SHELL_QUADS } from "../inflate/constants.js";
import { lockedLawCard } from "../inflate/lawCard.js";
import { enclosedVolume, loadShipMeshA } from "../inflate/meshA.js";
import { compareInflateToGolden } from "./compareInflate.js";
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
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: { ...lockedLawCard() },
      },
      golden,
    );
    expect(qsSwap.ok).toBe(false);
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
