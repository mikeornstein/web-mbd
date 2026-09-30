import {
  createInflateAModel,
  createInflateBModel,
  createInflateCModel,
} from "../fixtures/inflateA.js";
import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../fixtures/taylorBar.js";
import type { InflateModelIR, InflateValidationStatus } from "../inflate/types.js";
import type { ModelIR, TaylorMetrics } from "../ir/types.js";

export interface TaylorStockModel {
  kind: "taylor-j2-hex";
  id: string;
  title: string;
  researchPath: string;
  layer: 1;
  summary: string;
  acceptance: typeof TAYLOR_ACCEPTANCE;
  create: () => ModelIR;
}

export interface InflateStockModel {
  kind: "inflate-nh-membrane";
  id: string;
  title: string;
  researchPath: string;
  layer: 1;
  summary: string;
  validation: InflateValidationStatus;
  create: () => InflateModelIR;
}

/** Stock models drawn from Layer-1 research / validation notes. */
export type ResearchStockModel = TaylorStockModel | InflateStockModel;

export const RESEARCH_STOCK_MODELS: readonly ResearchStockModel[] = [
  {
    kind: "taylor-j2-hex",
    id: "taylor-bar-copper",
    title: "Taylor bar (OFHC copper)",
    researchPath: "docs/research/04-validation-strategy.md",
    layer: 1,
    summary:
      "Elastic-plastic cylinder impact on a rigid wall — Layer-1 gate for large strain, contact, and plasticity.",
    acceptance: TAYLOR_ACCEPTANCE,
    create: () => createTaylorBarModel(),
  },
  {
    kind: "inflate-nh-membrane",
    id: "inflate-a-desmopan",
    title: "Letter A inflate (neo-Hookean)",
    researchPath: "docs/mvp-inflate-a.md",
    layer: 1,
    summary:
      "Desmopan 85085A film letter A. Locked shear modulus, density, and thickness. Fast-load (dynamic) pressure ramp 0→65 kPa / 40 ms matches the OpenRadioss reference at first stretch ≥ 2. Slow-load (quasi-static) is not validated: last measured at head 8a05992 the toy was off 7.7% stretch, 8.8% pressure, 65% volume and the balloon folded; that code was removed, not fixed. The Inflation ABC ~54 kPa figure is not claimed. Mesh edges default ON. OpenRadioss is the offline golden only.",
    validation: "radioss-dynamic-golden",
    create: () => createInflateAModel(),
  },
  {
    kind: "inflate-nh-membrane",
    id: "inflate-b-desmopan",
    title: "Letter B inflate (neo-Hookean)",
    researchPath: "docs/mvp-inflate-a.md",
    layer: 1,
    summary:
      "Desmopan 85085A film letter B from inflation-abc meshes/B.json. Same constitutive locks. Playable; OpenRadioss golden NOT-YET (no tape). Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.",
    validation: "playable-not-yet-radioss",
    create: () => createInflateBModel(),
  },
  {
    kind: "inflate-nh-membrane",
    id: "inflate-c-desmopan",
    title: "Letter C inflate (neo-Hookean)",
    researchPath: "docs/mvp-inflate-a.md",
    layer: 1,
    summary:
      "Desmopan 85085A film letter C from inflation-abc meshes/C.json. Same constitutive locks. Playable; OpenRadioss golden NOT-YET (no tape). Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.",
    validation: "playable-not-yet-radioss",
    create: () => createInflateCModel(),
  },
];

export function getResearchStockModel(id: string): ResearchStockModel {
  const found = RESEARCH_STOCK_MODELS.find((m) => m.id === id);
  if (!found) throw new Error(`unknown research stock model: ${id}`);
  return found;
}

export function metricsPassAcceptance(
  metrics: TaylorMetrics,
  acceptance: typeof TAYLOR_ACCEPTANCE,
): boolean {
  return (
    metrics.lengthRatio >= acceptance.lengthRatio.min &&
    metrics.lengthRatio <= acceptance.lengthRatio.max &&
    metrics.radiusRatio >= acceptance.radiusRatio.min &&
    metrics.radiusRatio <= acceptance.radiusRatio.max &&
    Math.abs(metrics.energyErrorPct) <= acceptance.energyErrorPctAbsMax &&
    metrics.maxEqPlasticStrain >= acceptance.maxEqPlasticStrain.min &&
    metrics.maxEqPlasticStrain <= acceptance.maxEqPlasticStrain.max
  );
}
