import type { EnergySample } from "../ir/types.js";
import type { CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE, LOAD_FAMILY_DYNAMIC_PLOAD_40MS, LOAD_FAMILY_QS_ISH_PLOAD_400MS } from "./constants.js";

export type InflateLoadFamily =
  | typeof LOAD_FAMILY_DYNAMIC_PLOAD_40MS
  | typeof LOAD_FAMILY_QS_ISH_PLOAD_400MS;

export type InflateLetter = "A" | "B" | "C";

export type InflateValidationStatus = "radioss-dynamic-golden" | "playable-not-yet-radioss";

export type InflateContactClass = typeof CONTACT_CLASS_TYPE19_GAPMIN_NODE_NODE;

export type InflateKissKind = "node-node";

export interface InflateLawCard {
  mu1: number;
  alpha1: number;
  muOthers: number;
  nu: number;
  pronyM: number;
  iform: number;
  h0: number;
  rho: number;
  gapMin: number;
  warnLam: number;
  ishell: number;
  ismstr: number;
  ithick: number;
  loadFamily: InflateLoadFamily;
  pMax: number;
  tRamp: number;
  rayleighAlpha: number;
}

export interface QuadShellMesh {
  coords: number[];
  /** Packed 4-node shells, 0-based, NUMELC = length/4. */
  quads: number[];
  /** Packed leftover 3-node CSTs after orphan pairing (NUMELTG analogue). Empty on letter A. */
  tris: number[];
  nNodes: number;
  nQuads: number;
  nTris: number;
  fingerprint: string;
  letter: InflateLetter;
}

export interface InflateModelIR {
  kind: "inflate-nh-membrane";
  meta: {
    name: string;
    version: 1;
    units: "SI";
    description?: string;
  };
  law: InflateLawCard;
  mesh: QuadShellMesh;
  controls: {
    endTime: number;
    cfl: number;
    maxSteps: number;
    historyInterval: number;
    /** When true, scale velocities at kinetic-energy peaks (Underwood /ADYREL analogue). */
    kineticDamping: boolean;
    /** Velocity scale at a KE peak. 0 = full reset (classic Underwood). */
    kineticDampingScale: number;
    /**
     * Minimum time between Underwood peaks. 0 = every local KE max (dynamic).
     */
    kineticDampingMinInterval: number;
    /**
     * TYPE19-class Gapmin pairing. Fast-load (dynamic) path is node-node.
     */
    contactKind: InflateKissKind;
  };
}

export interface InflateWarnMetrics {
  /** First history sample with λ_max ≥ WARN_LAM (ANIM-stride freeze). */
  frame: number;
  t: number;
  lambdaMax: number;
  p: number;
  volume_mL: number;
  psi_J: number;
  warn: boolean;
}

export interface InflateSolveMetrics {
  nSteps: number;
  elapsedMs: number;
  energyErrorPct: number;
  lambdaMax: number;
  p: number;
  volume_mL: number;
  psi_J: number;
  t: number;
  warn: InflateWarnMetrics | null;
  loadFamily: InflateLoadFamily;
  meshFingerprint: string;
  punchedThrough: boolean;
  minGap: number;
  contactViol: number;
  contactClass: InflateContactClass;
  incompressResidualMax: number;
}

export interface InflateSolveResult {
  kind: "inflate-nh-membrane";
  coords: Float64Array;
  history: EnergySample[];
  meshHistory: Float64Array[];
  lambdaHistory: number[];
  pressureHistory: number[];
  volumeHistory: number[];
  psiHistory: number[];
  metrics: InflateSolveMetrics;
  law: InflateLawCard;
}

export interface RadiossInflateGolden {
  provenance: {
    source: "openradioss";
    desk: string;
    branch: string;
    note: string;
  };
  loadFamily: InflateLoadFamily;
  law: InflateLawCard;
  mesh: {
    nNodes: number;
    nShellQuads: number;
    NUMELC: number;
    NUMELTG: number;
    fingerprint: string;
  };
  warn: {
    frame: number;
    t: number;
    lambdaMax: number;
    p: number;
    volume_mL: number;
    psi_J: number;
  };
  bands: {
    lambdaRel: number;
    volumeRel: number;
    pressureRel: number;
  };
}
