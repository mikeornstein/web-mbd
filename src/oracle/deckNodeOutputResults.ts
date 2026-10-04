import deckNodeRaw from "./deck-node-output-results.json" with { type: "json" };
import { DECK_NODE_PLAN_LINES, DECK_NODE_NOT_A_GATE } from "./deckNodeOutputRules.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Page copy. Plan is always shown. Results stay empty until the later run commit. */
export function deckNodeOutputPageText(): { rules: string; results: string } {
  const rules = [
    "Letter A deck node-output re-run (measurement, not a gate). Do not widen any bar. Do not apply a time shift.",
    DECK_NODE_NOT_A_GATE,
    ...DECK_NODE_PLAN_LINES,
  ].join("\n");
  if (!isRecord(deckNodeRaw)) {
    return { rules, results: "Plan committed first. Results file is unreadable." };
  }
  const status = str(deckNodeRaw["status"]);
  if (status === "plan-committed-results-not-yet-run") {
    return { rules, results: "Results not yet written. Plan was committed first." };
  }
  const verdict = str(deckNodeRaw["verdictLine"]);
  const body = str(deckNodeRaw["pageBody"]);
  const lines = ["Results (measurement; node output re-run, not compare:inflate):"];
  if (body !== null) lines.push(body);
  if (verdict !== null) lines.push(`Verdict: ${verdict}`);
  return { rules, results: lines.join("\n") };
}
