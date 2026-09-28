import goldenRaw from "./inflate-a-radioss-golden.json" with { type: "json" };
import qsGoldenRaw from "./inflate-a-radioss-qs-golden.json" with { type: "json" };
import {
  LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
  LOAD_FAMILY_QS_ISH_DEAD_PRESSURE,
} from "../inflate/constants.js";
import { lockedLawCard, lockedLawCardQsIsh } from "../inflate/lawCard.js";
import type {
  InflateLawCard,
  InflateLoadFamily,
  RadiossInflateGolden,
  RadiossQsGolden,
} from "../inflate/types.js";

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

function parseLaw(raw: unknown, expected: InflateLoadFamily): InflateLawCard {
  if (!isRecord(raw)) throw new Error("golden: law not an object");
  const loadFamily = str(raw["loadFamily"], "law.loadFamily");
  if (loadFamily !== expected) {
    throw new Error(`golden: unsupported load family ${loadFamily} (expected ${expected})`);
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
    loadFamily: expected,
    pMax: num(raw["pMax"], "pMax"),
    tRamp: num(raw["tRamp"], "tRamp"),
    rayleighAlpha: num(raw["rayleighAlpha"], "rayleighAlpha"),
  };
}

function parseMesh(meshRaw: Record<string, unknown>): RadiossInflateGolden["mesh"] {
  return {
    nNodes: num(meshRaw["nNodes"], "nNodes"),
    nShellQuads: num(meshRaw["nShellQuads"], "nShellQuads"),
    NUMELC: num(meshRaw["NUMELC"], "NUMELC"),
    NUMELTG: num(meshRaw["NUMELTG"], "NUMELTG"),
    fingerprint: str(meshRaw["fingerprint"], "fingerprint"),
  };
}

function parseBands(bandsRaw: Record<string, unknown>): RadiossInflateGolden["bands"] {
  return {
    lambdaRel: num(bandsRaw["lambdaRel"], "lambdaRel"),
    volumeRel: num(bandsRaw["volumeRel"], "volumeRel"),
    pressureRel: num(bandsRaw["pressureRel"], "pressureRel"),
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
    law: parseLaw(raw["law"], LOAD_FAMILY_DYNAMIC_PLOAD_40MS),
    mesh: parseMesh(meshRaw),
    warn: {
      frame: num(warnRaw["frame"], "frame"),
      t: num(warnRaw["t"], "t"),
      lambdaMax: num(warnRaw["lambdaMax"], "lambdaMax"),
      p: num(warnRaw["p"], "p"),
      volume_mL: num(warnRaw["volume_mL"], "volume_mL"),
      psi_J: num(warnRaw["psi_J"], "psi_J"),
    },
    bands: parseBands(bandsRaw),
  };
}

export function loadInflateGolden(): RadiossInflateGolden {
  return parseInflateGolden(goldenRaw);
}

export function parseInflateQsGolden(raw: unknown): RadiossQsGolden {
  if (!isRecord(raw)) throw new Error("qs golden: not an object");
  const status = str(raw["status"], "status");
  const provenanceRaw = raw["provenance"];
  const meshRaw = raw["mesh"];
  const bandsRaw = raw["bands"];
  if (!isRecord(provenanceRaw) || !isRecord(meshRaw) || !isRecord(bandsRaw)) {
    throw new Error("qs golden: missing sections");
  }
  const loadFamily = str(raw["loadFamily"], "loadFamily");
  if (loadFamily !== LOAD_FAMILY_QS_ISH_DEAD_PRESSURE) {
    throw new Error(`qs golden: loadFamily ${loadFamily}`);
  }
  const law = parseLaw(raw["law"], LOAD_FAMILY_QS_ISH_DEAD_PRESSURE);
  const mesh = parseMesh(meshRaw);
  const bands = parseBands(bandsRaw);
  const provenanceNote = str(provenanceRaw["note"], "note");
  if (status === "EMPTY") {
    return {
      status: "EMPTY",
      loadFamily: LOAD_FAMILY_QS_ISH_DEAD_PRESSURE,
      law,
      mesh,
      bands,
      provenance: {
        source: "none",
        desk: str(provenanceRaw["desk"], "desk"),
        branch: str(provenanceRaw["branch"], "branch"),
        note: provenanceNote,
      },
    };
  }
  if (status !== "filled") throw new Error(`qs golden: bad status ${status}`);
  const warnRaw = raw["warn"];
  if (!isRecord(warnRaw)) throw new Error("qs golden: filled but missing warn");
  const source = str(provenanceRaw["source"], "source");
  if (source !== "openradioss") throw new Error("qs golden: filled source must be openradioss");
  return {
    status: "filled",
    provenance: {
      source: "openradioss",
      desk: str(provenanceRaw["desk"], "desk"),
      branch: str(provenanceRaw["branch"], "branch"),
      note: provenanceNote,
    },
    loadFamily: LOAD_FAMILY_QS_ISH_DEAD_PRESSURE,
    law,
    mesh,
    warn: {
      frame: num(warnRaw["frame"], "frame"),
      t: num(warnRaw["t"], "t"),
      lambdaMax: num(warnRaw["lambdaMax"], "lambdaMax"),
      p: num(warnRaw["p"], "p"),
      volume_mL: num(warnRaw["volume_mL"], "volume_mL"),
      psi_J: num(warnRaw["psi_J"], "psi_J"),
    },
    bands,
  };
}

export function loadInflateQsGolden(): RadiossQsGolden {
  return parseInflateQsGolden(qsGoldenRaw);
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

export function assertQsGoldenLawMatchesLock(golden: RadiossQsGolden = loadInflateQsGolden()): void {
  const lock = lockedLawCardQsIsh();
  for (const key of Object.keys(lock) as (keyof InflateLawCard)[]) {
    if (!Object.is(lock[key], golden.law[key])) {
      throw new Error(`qs golden law.${key} drifted from lockedLawCardQsIsh()`);
    }
  }
}
