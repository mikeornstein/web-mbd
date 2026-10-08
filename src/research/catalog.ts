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
  /** False = keep the fixture, do not list it on the page. */
  listedOnPage: boolean;
  create: () => InflateModelIR;
}

/** Stock models drawn from Layer-1 research / validation notes. */
export type ResearchStockModel = TaylorStockModel | InflateStockModel;

export const RESEARCH_STOCK_MODELS: readonly ResearchStockModel[] = [
  {
    kind: "inflate-nh-membrane",
    id: "inflate-a-desmopan",
    title: "Letter A inflate (neo-Hookean)",
    researchPath: "docs/mvp-inflate-a.md",
    layer: 1,
    summary:
      "The only validated inflate letter. Desmopan 85085A film letter A. Locked shear modulus, density, and thickness. Fast-load (dynamic) pressure ramp 0→65 kPa / 40 ms is the open Radioss reference on a consistently outward-oriented mesh at first stretch ≥ 2. The film runs about half a millisecond behind the reference solvers throughout the run. That shows up as roughly 12% low in median stretch mid-run (8 ms) and about 3% low at the 16 ms freeze; the 0.5 ms fit was made across all frames, so the lag does not disappear at the freeze, it only looks smaller there because stretch changes more slowly near the end. Node positions sit about three times farther from the decks than the decks sit from each other, so the shape does not match. Slow-load (quasi-static) is not validated: last measured at head 8a05992 the toy was off 7.7% stretch, 8.8% pressure, 65% volume and the balloon folded; that code was removed, not fixed. The Inflation ABC ~54 kPa figure is not claimed. Default view is solid fill with mesh edges. Open Radioss is the offline golden only.",
    validation: "radioss-dynamic-golden",
    listedOnPage: true,
    create: () => createInflateAModel(),
  },
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
    id: "inflate-b-desmopan",
    title: "Letter B inflate (unvalidated demo, unstable past stretch 2)",
    researchPath: "docs/mvp-inflate-a.md",
    layer: 1,
    summary:
      "Unvalidated demo, unstable past stretch 2. First stretch ≥ 2 at 4.4, past the warn line. Desmopan 85085A film letter B from inflation-abc meshes/B.json. Same constitutive locks. Source mesh has 404 of 2178 triangles wound against their neighbors. The Inflation ABC refine ladder (coarse, fine, finer) inherits the old winding unless fixed. Open Radioss golden NOT-YET (no tape). Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.",
    validation: "unvalidated-demo",
    listedOnPage: true,
    create: () => createInflateBModel(),
  },
  {
    kind: "inflate-nh-membrane",
    id: "inflate-c-desmopan",
    title: "Letter C inflate (unvalidated demo, unstable)",
    researchPath: "docs/mvp-inflate-a.md",
    layer: 1,
    summary:
      "Unvalidated demo, unstable. Hidden from the page. First stretch ≥ 2 sample is ~43,000 at 2 ms. Source mesh has 412 of 1972 triangles wound against their neighbors. The Inflation ABC refine ladder (coarse, fine, finer) inherits the old winding unless fixed. Same constitutive locks as letter A. Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.",
    validation: "unvalidated-demo-unstable",
    listedOnPage: false,
    create: () => createInflateCModel(),
  },
];

export function isListedOnPage(entry: ResearchStockModel): boolean {
  if (entry.kind !== "inflate-nh-membrane") return true;
  return entry.listedOnPage;
}

export function pageCatalogModels(): ResearchStockModel[] {
  return RESEARCH_STOCK_MODELS.filter(isListedOnPage);
}

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
