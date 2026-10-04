import lookupRaw from "./deck-mass-work-lookups-results.json" with { type: "json" };
import { LOOKUP_NOT_A_GATE, LOOKUP_PLAN_LINES, NO_FIX, NO_VERDICT_ROW } from "./deckMassWorkLookupRules.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Page copy. Plan is always shown. Results stay empty until the later run commit. */
export function deckMassWorkLookupPageText(): { rules: string; results: string } {
  const rules = [
    "Letter A film mass, work, and ringing lookups (measurement, not a gate). Do not widen any bar. Do not apply a time shift. Do not add a verdict row. Do not propose a fix.",
    LOOKUP_NOT_A_GATE,
    ...LOOKUP_PLAN_LINES,
  ].join("\n");
  const raw: unknown = lookupRaw;
  if (!isRecord(raw)) {
    return { rules, results: "Plan committed first. Results file is unreadable." };
  }
  const status = str(raw["status"]);
  if (status === "plan-committed-results-not-yet-run") {
    return { rules, results: "Results not yet written. Plan was committed first." };
  }
  const outcome = str(raw["outcomeLine"]);
  const body = str(raw["pageBody"]);
  const lines = ["Results (measurement; mass, work, and ringing lookups, not compare:inflate):"];
  if (body !== null) lines.push(body);
  if (outcome !== null) lines.push(`Outcome: ${outcome}`);
  lines.push(NO_VERDICT_ROW);
  lines.push(NO_FIX);
  return { rules, results: lines.join("\n") };
}
