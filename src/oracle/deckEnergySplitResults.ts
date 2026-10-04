import energySplitRaw from "./deck-energy-split-results.json" with { type: "json" };
import { ENERGY_SPLIT_NOT_A_GATE, ENERGY_SPLIT_PLAN_LINES } from "./deckEnergySplitRules.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Page copy. Plan is always shown. Results stay empty until the later run commit. */
export function deckEnergySplitPageText(): { rules: string; results: string } {
  const rules = [
    "Letter A energy and damping split (measurement, not a gate). Do not widen any bar. Do not apply a time shift. Do not add a verdict row.",
    ENERGY_SPLIT_NOT_A_GATE,
    ...ENERGY_SPLIT_PLAN_LINES,
  ].join("\n");
  const raw: unknown = energySplitRaw;
  if (!isRecord(raw)) {
    return { rules, results: "Plan committed first. Results file is unreadable." };
  }
  const status = str(raw["status"]);
  if (status === "plan-committed-results-not-yet-run") {
    return { rules, results: "Results not yet written. Plan was committed first." };
  }
  const outcome = str(raw["outcomeLine"]);
  const body = str(raw["pageBody"]);
  const wording = str(raw["pageWording"]);
  const lines = ["Results (measurement; energy and damping split, not compare:inflate):"];
  if (body !== null) lines.push(body);
  if (outcome !== null) lines.push(`Outcome: ${outcome}`);
  if (wording !== null) {
    lines.push("");
    lines.push("Page wording (text, no numbers or bars changed; clearly separated from the table):");
    lines.push(wording);
  }
  return { rules, results: lines.join("\n") };
}
