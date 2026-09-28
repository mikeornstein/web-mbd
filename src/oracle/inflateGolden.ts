import goldenRaw from "./inflate-a-radioss-golden.json" with { type: "json" };
import { LOAD_FAMILY_DYNAMIC_PLOAD_40MS } from "../inflate/constants.js";
import { lockedLawCard } from "../inflate/lawCard.js";
import type { InflateLawCard, RadiossInflateGolden } from "../inflate/types.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`golden: bad ${label}`);
  return v;
}

function str(v: unknown, label: string): string {
  if (typeof v !== "string") throw new Error(`golden: bad ${label}`);
  return v;
}

function parseLaw(raw: unknown): InflateLawCard {
  if (!isRecord(raw)) throw new Error("golden: law not an object");
  const loadFamily = str(raw["loadFamily"], "law.loadFamily");
  if (loadFamily !== LOAD_FAMILY_DYNAMIC_PLOAD_40MS) {
    throw new Error(`golden: unsupported load family ${loadFamily}`);
  }
  return {
    mu1: num(raw["mu1"], "mu1"),
    alpha1: num(raw["alpha1"], "alpha1"),
    muOthers: num(raw["muOthers"], "muOthers"),
    nu: num(raw["nu"], "nu"),
    pronyM: num(raw["pronyM"], "pronyM"),
    iform: num(raw["iform"], "iform"),
    h0: num(raw["h0"], "h0"),
    rho: num(raw["rho"], "rho"),
    gapMin: num(raw["gapMin"], "gapMin"),
    warnLam: num(raw["warnLam"], "warnLam"),
    ishell: num(raw["ishell"], "ishell"),
    ismstr: num(raw["ismstr"], "ismstr"),
    ithick: num(raw["ithick"], "ithick"),
    loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
    pMax: num(raw["pMax"], "pMax"),
    tRamp: num(raw["tRamp"], "tRamp"),
    rayleighAlpha: num(raw["rayleighAlpha"], "rayleighAlpha"),
  };
}

export function parseInflateGolden(raw: unknown): RadiossInflateGolden {
  if (!isRecord(raw)) throw new Error("golden: not an object");
  const provenanceRaw = raw["provenance"];
  const meshRaw = raw["mesh"];
  const warnRaw = raw["warn"];
  const bandsRaw = raw["bands"];
  if (!isRecord(provenanceRaw) || !isRecord(meshRaw) || !isRecord(warnRaw) || !isRecord(bandsRaw)) {
    throw new Error("golden: missing sections");
  }
  const loadFamily = str(raw["loadFamily"], "loadFamily");
  if (loadFamily !== LOAD_FAMILY_DYNAMIC_PLOAD_40MS) {
    throw new Error(`golden: loadFamily ${loadFamily}`);
  }
  return {
    provenance: {
      source: "openradioss",
      desk: str(provenanceRaw["desk"], "desk"),
      branch: str(provenanceRaw["branch"], "branch"),
      note: str(provenanceRaw["note"], "note"),
    },
    loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
    law: parseLaw(raw["law"]),
    mesh: {
      nNodes: num(meshRaw["nNodes"], "nNodes"),
      nShellQuads: num(meshRaw["nShellQuads"], "nShellQuads"),
      NUMELC: num(meshRaw["NUMELC"], "NUMELC"),
      NUMELTG: num(meshRaw["NUMELTG"], "NUMELTG"),
      fingerprint: str(meshRaw["fingerprint"], "fingerprint"),
    },
    warn: {
      frame: num(warnRaw["frame"], "frame"),
      t: num(warnRaw["t"], "t"),
      lambdaMax: num(warnRaw["lambdaMax"], "lambdaMax"),
      p: num(warnRaw["p"], "p"),
      volume_mL: num(warnRaw["volume_mL"], "volume_mL"),
      psi_J: num(warnRaw["psi_J"], "psi_J"),
    },
    bands: {
      lambdaRel: num(bandsRaw["lambdaRel"], "lambdaRel"),
      volumeRel: num(bandsRaw["volumeRel"], "volumeRel"),
      pressureRel: num(bandsRaw["pressureRel"], "pressureRel"),
    },
  };
}

export function loadInflateGolden(): RadiossInflateGolden {
  return parseInflateGolden(goldenRaw);
}

/** Checked-in law card must match the locked formula module bit-for-bit. */
export function assertGoldenLawMatchesLock(golden: RadiossInflateGolden = loadInflateGolden()): void {
  const lock = lockedLawCard();
  for (const key of Object.keys(lock) as (keyof InflateLawCard)[]) {
    if (!Object.is(lock[key], golden.law[key])) {
      throw new Error(`golden law.${key} drifted from lockedLawCard()`);
    }
  }
}
