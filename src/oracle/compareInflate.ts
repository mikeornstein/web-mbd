import type { InflateLawCard, InflateSolveMetrics, RadiossInflateGolden } from "../inflate/types.js";

export const INFLATE_BANDS = {
  lambdaRel: 0.02,
  volumeRel: 0.05,
  pressureRel: 0.05,
} as const;

function relErr(ours: number, gold: number): number {
  return Math.abs(ours - gold) / Math.max(Math.abs(gold), 1e-30);
}

function sameNumber(a: number, b: number): boolean {
  return Object.is(a, b) || Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b), 1);
}

export function lawCardsEqual(
  a: InflateLawCard,
  b: InflateLawCard,
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const keys: (keyof InflateLawCard)[] = [
    "mu1",
    "alpha1",
    "muOthers",
    "nu",
    "pronyM",
    "iform",
    "h0",
    "rho",
    "gapMin",
    "warnLam",
    "ishell",
    "ismstr",
    "ithick",
    "loadFamily",
    "pMax",
    "tRamp",
    "rayleighAlpha",
  ];
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") {
      if (!sameNumber(av, bv)) mismatches.push(`${key}: ${String(av)} ≠ ${String(bv)}`);
    } else if (av !== bv) {
      mismatches.push(`${key}: ${String(av)} ≠ ${String(bv)}`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export interface InflateCompareResult {
  ok: boolean;
  reasons: string[];
  lawEqual: boolean;
  loadFamilyEqual: boolean;
  meshEqual: boolean;
  psiNonNegative: boolean;
  lambdaRelError: number | null;
  volumeRelError: number | null;
  pressureRelError: number | null;
  bands: typeof INFLATE_BANDS;
}

/**
 * Themis tooling gate: PASS iff toy vs checked-in Radioss golden at first λ≥2
 * clears λ≤2% / V≤5% / p≤5% (p only if same load law) with identical law-card
 * fields and labeled load family.
 */
export function compareInflateToGolden(
  toy: Pick<InflateSolveMetrics, "warn" | "loadFamily" | "meshFingerprint" | "punchedThrough" | "psi_J"> & {
    law: InflateLawCard;
  },
  golden: RadiossInflateGolden,
): InflateCompareResult {
  const reasons: string[] = [];
  const law = lawCardsEqual(toy.law, golden.law);
  if (!law.ok) {
    reasons.push(`law-card mismatch: ${law.mismatches.join("; ")}`);
  }
  const loadFamilyEqual = toy.loadFamily === golden.loadFamily && toy.law.loadFamily === golden.loadFamily;
  if (!loadFamilyEqual) {
    reasons.push(
      `load family ${toy.loadFamily} ≠ golden ${golden.loadFamily} (unlabeled swap is a FAIL; do not retune μ)`,
    );
  }
  const meshEqual =
    toy.meshFingerprint === golden.mesh.fingerprint &&
    golden.mesh.nShellQuads === golden.mesh.NUMELC &&
    golden.mesh.NUMELTG === 0;
  if (toy.meshFingerprint !== golden.mesh.fingerprint) {
    reasons.push(`mesh fingerprint ${toy.meshFingerprint} ≠ ${golden.mesh.fingerprint}`);
  }
  if (golden.mesh.NUMELTG !== 0 || golden.mesh.NUMELC !== golden.mesh.nShellQuads) {
    reasons.push("golden mesh is not the quad-only NUMELC ship family");
  }
  if (toy.punchedThrough) reasons.push("punch-through / empty or exploded V");
  const psiToy = toy.warn?.psi_J ?? toy.psi_J;
  const psiNonNegative = psiToy >= 0 && golden.warn.psi_J >= 0;
  if (!psiNonNegative) reasons.push(`Ψ sign fail (toy ${psiToy}, golden ${golden.warn.psi_J})`);
  if (toy.warn === null) {
    reasons.push("λ never crossed WARN_LAM=2");
  }

  let lambdaRelError: number | null = null;
  let volumeRelError: number | null = null;
  let pressureRelError: number | null = null;
  if (toy.warn !== null) {
    lambdaRelError = relErr(toy.warn.lambdaMax, golden.warn.lambdaMax);
    volumeRelError = relErr(toy.warn.volume_mL, golden.warn.volume_mL);
    pressureRelError = relErr(toy.warn.p, golden.warn.p);
    if (lambdaRelError > golden.bands.lambdaRel) {
      reasons.push(
        `λ rel error ${(100 * lambdaRelError).toFixed(2)}% > ${100 * golden.bands.lambdaRel}% (toy ${toy.warn.lambdaMax}, golden ${golden.warn.lambdaMax})`,
      );
    }
    if (volumeRelError > golden.bands.volumeRel) {
      reasons.push(
        `V rel error ${(100 * volumeRelError).toFixed(2)}% > ${100 * golden.bands.volumeRel}% (toy ${toy.warn.volume_mL} mL, golden ${golden.warn.volume_mL} mL)`,
      );
    }
    if (loadFamilyEqual && pressureRelError > golden.bands.pressureRel) {
      reasons.push(
        `p rel error ${(100 * pressureRelError).toFixed(2)}% > ${100 * golden.bands.pressureRel}% (toy ${toy.warn.p} Pa, golden ${golden.warn.p} Pa; same load family ${toy.loadFamily})`,
      );
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    lawEqual: law.ok,
    loadFamilyEqual,
    meshEqual,
    psiNonNegative,
    lambdaRelError,
    volumeRelError,
    pressureRelError,
    bands: INFLATE_BANDS,
  };
}

export function formatInflateCompare(result: InflateCompareResult): string {
  const lines = [
    result.ok ? "INFLATE ORACLE: PASS" : "INFLATE ORACLE: FAIL",
    `law-card equal: ${result.lawEqual}`,
    `load family equal: ${result.loadFamilyEqual}`,
    `mesh fingerprint equal: ${result.meshEqual}`,
    `Ψ ≥ 0: ${result.psiNonNegative}`,
    `λ rel: ${result.lambdaRelError === null ? "n/a" : (100 * result.lambdaRelError).toFixed(3) + "%"} (band ${100 * result.bands.lambdaRel}%)`,
    `V rel: ${result.volumeRelError === null ? "n/a" : (100 * result.volumeRelError).toFixed(3) + "%"} (band ${100 * result.bands.volumeRel}%)`,
    `p rel: ${result.pressureRelError === null ? "n/a" : (100 * result.pressureRelError).toFixed(3) + "%"} (band ${100 * result.bands.pressureRel}%, same-law only)`,
  ];
  if (result.reasons.length > 0) {
    lines.push("reasons:");
    for (const r of result.reasons) lines.push(`  - ${r}`);
  }
  return lines.join("\n");
}
