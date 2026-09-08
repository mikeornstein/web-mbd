import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../fixtures/taylorBar.js";
import type { ModelIR, TaylorMetrics } from "../ir/types.js";

/** Stock models drawn from Layer-1 research / validation notes. */
export interface ResearchStockModel {
  id: string;
  title: string;
  /** Path relative to repo root of the research note that names this case. */
  researchPath: string;
  layer: 1;
  summary: string;
  acceptance: typeof TAYLOR_ACCEPTANCE;
  create: () => ModelIR;
}

export const RESEARCH_STOCK_MODELS: readonly ResearchStockModel[] = [
  {
    id: "taylor-bar-copper",
    title: "Taylor bar (OFHC copper)",
    researchPath: "docs/research/04-validation-strategy.md",
    layer: 1,
    summary:
      "Elastic-plastic cylinder impact on a rigid wall — Layer-1 gate for large strain, contact, and plasticity.",
    acceptance: TAYLOR_ACCEPTANCE,
    create: () => createTaylorBarModel(),
  },
] as const;

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
    Math.abs(metrics.energyErrorPct) <= acceptance.energyErrorPctAbsMax
  );
}
