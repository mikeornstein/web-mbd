import { describe, expect, it } from "vitest";
import { LOAD_FAMILY_DYNAMIC_PLOAD_40MS, LOAD_FAMILY_QS_ISH_PLOAD_400MS, MU, RHO, SHIP_SHELL_QUADS } from "../inflate/constants.js";
import { lockedLawCard } from "../inflate/lawCard.js";
import { enclosedVolume, loadShipMesh, loadShipMeshA } from "../inflate/meshA.js";
import {
  compareInflateToGolden,
  SHIPPED_KILL_OFF_FREEZE,
  diagnosisMissMatchesLock,
  type InflateToySample,
} from "./compareInflate.js";
import { GOLDEN_TAPE } from "./survivingDecks.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "./inflateGolden.js";
import type { InflateLawCard, InflateWarnMetrics } from "../inflate/types.js";

function goldenSamples(): InflateToySample[] {
  return GOLDEN_TAPE.map((row) => ({
    t: row.t_ms / 1000,
    lambdaMax: row.lambdaMax,
    volume_mL: row.volume_mL,
    p: row.p_Pa,
  }));
}

/** Committed oriented kill-off Letter A tape, 0–16 ms. */
function killOffSamples(): InflateToySample[] {
  return [
    { t: 0, lambdaMax: 1.0000000074505808, volume_mL: 420.5477389711655, p: 0 },
    { t: 0.002002992059327919, lambdaMax: 1.1183172586557617, volume_mL: 520.0139970474382, p: 3254.8620964078686 },
    { t: 0.0040013169923814994, lambdaMax: 1.108327114264293, volume_mL: 525.0123369833336, p: 6502.140112619937 },
    { t: 0.006001741783163348, lambdaMax: 1.2855257454832372, volume_mL: 570.3991833132725, p: 9752.83039764044 },
    { t: 0.008004723846906503, lambdaMax: 1.4077530823945796, volume_mL: 601.9857131699121, p: 13007.676251223067 },
    { t: 0.010002621665691975, lambdaMax: 1.4716475093227872, volume_mL: 643.8240746767805, p: 16254.260206749459 },
    { t: 0.012004801886361497, lambdaMax: 1.5644431198580904, volume_mL: 694.6543799496277, p: 19507.80306533743 },
    { t: 0.014000748502444316, lambdaMax: 1.7363983261849765, volume_mL: 757.601942213197, p: 22751.21631647201 },
    { t: 0.016003703120549294, lambdaMax: 2.105201010510652, volume_mL: 866.0832041483628, p: 26006.0175708926 },
  ];
}

const matchingWarn: InflateWarnMetrics = {
  frame: 8,
  t: 0.0160038,
  lambdaMax: 2.128161758970982,
  p: 26006.175,
  volume_mL: 891.7110015235089,
  psi_J: 7.313,
  warn: true,
};

const killOffWarn: InflateWarnMetrics = {
  frame: SHIPPED_KILL_OFF_FREEZE.frame,
  t: 0.016003703120549294,
  lambdaMax: SHIPPED_KILL_OFF_FREEZE.lambdaMax,
  p: 26006.0175708926,
  volume_mL: SHIPPED_KILL_OFF_FREEZE.volume_mL,
  psi_J: 7.313,
  warn: true,
};

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
        samples: goldenSamples(),
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
        samples: goldenSamples(),
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
        samples: goldenSamples(),
      },
      golden,
    );
    expect(pass.ok).toBe(true);
    expect(pass.gatingBar).toBe("themis-deck-spread");
    expect(pass.themisOk).toBe(true);

    const qsSwap = compareInflateToGolden(
      {
        warn: { ...warn, p: 54100 },
        loadFamily: LOAD_FAMILY_QS_ISH_PLOAD_400MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: { ...lockedLawCard(), loadFamily: LOAD_FAMILY_QS_ISH_PLOAD_400MS, tRamp: 0.4 },
        samples: goldenSamples(),
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

  it("diagnosis lock (not a physics pass) accepts the Themis miss and rejects a PASS", () => {
    const golden = loadInflateGolden();
    const miss = compareInflateToGolden(
      {
        warn: killOffWarn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: killOffWarn.psi_J,
        law: lockedLawCard(),
        samples: killOffSamples(),
      },
      golden,
    );
    expect(miss.ok).toBe(false);
    expect(miss.themisOk).toBe(false);
    expect(miss.gatingBar).toBe("themis-deck-spread");
    const lock = diagnosisMissMatchesLock(miss, golden, killOffWarn);
    expect(lock.ok).toBe(true);

    const pass = compareInflateToGolden(
      {
        warn: matchingWarn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 9.5,
        law: lockedLawCard(),
        samples: goldenSamples(),
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
    const stillMiss = compareInflateToGolden(
      {
        warn: killOffWarn,
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: killOffWarn.psi_J,
        law: lockedLawCard(),
        samples: killOffSamples(),
      },
      widened,
    );
    expect(stillMiss.ok).toBe(false);
    const widenLock = diagnosisMissMatchesLock(stillMiss, widened, killOffWarn);
    expect(widenLock.ok).toBe(false);
    expect(widenLock.reasons.some((r) => r.includes("widen"))).toBe(true);
  });
});
