import quadAvgRaw from "./deck-quad-averaged-results.json" with { type: "json" };
import { QUAD_AVG_NOT_A_GATE, QUAD_AVG_PLAN_LINES, RULE_A_CONVENTION_COLUMN } from "./deckQuadAveragedRules.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Page copy. Engine column is primary. Results stay empty until the later run commit. */
export function deckQuadAveragedPageText(): { rules: string; results: string } {
  const rules = [
    "Letter A quad-averaged stretch and node-distance (measurement, not a gate). Engine internal energy is the primary energy column. Do not widen any bar. Do not apply a time shift.",
    QUAD_AVG_NOT_A_GATE,
    ...QUAD_AVG_PLAN_LINES,
    `Toy-function on deck nodes is labeled: ${RULE_A_CONVENTION_COLUMN}.`,
  ].join("\n");
  const raw: unknown = quadAvgRaw;
  if (!isRecord(raw)) {
    return { rules, results: "Plan committed first. Results file is unreadable." };
  }
  const status = str(raw["status"]);
  if (status === "plan-committed-results-not-yet-run") {
    return { rules, results: "Results not yet written. Plan was committed first. Engine internal energy is the primary energy column." };
  }
  const verdict = str(raw["verdictLine"]);
  const ruleC = str(raw["ruleCLine"]);
  const body = str(raw["pageBody"]);
  const lines = ["Results (measurement; engine column primary, not compare:inflate):"];
  if (body !== null) lines.push(body);
  if (verdict !== null) lines.push(`Locked table: ${verdict}`);
  if (ruleC !== null) lines.push(`Rule C outcome: ${ruleC}`);
  return { rules, results: lines.join("\n") };
}
