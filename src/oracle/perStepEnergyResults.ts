import perStepJson from "./per-step-energy-results.json" with { type: "json" };
import { PER_STEP_CHIRON_THEMIS_ROWS, PER_STEP_ENERGY_RULES_LINES } from "./perStepEnergyRules.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Page copy. Rules are always shown. Results stay empty until the later run commit. */
export function perStepEnergyPageText(): { rules: string; results: string } {
  const rules = [
    "Letter A per-step energy bookkeeping (correctness gate on the toy). Do not widen any bar. Do not apply a time shift.",
    ...PER_STEP_ENERGY_RULES_LINES,
    "Chiron/Themis rows (unchanged; applied only if the per-step sum closes under 3% at every reported frame at both step sizes):",
    ...PER_STEP_CHIRON_THEMIS_ROWS,
  ].join("\n");
  const perStepRaw: unknown = perStepJson;
  if (!isRecord(perStepRaw)) {
    return { rules, results: "Rules committed first. Results file is unreadable." };
  }
  const status = str(perStepRaw["status"]);
  if (status === "rules-committed-results-not-yet-run") {
    return { rules, results: "Results not yet written. Rules were committed first." };
  }
  const verdict = str(perStepRaw["verdictLine"]);
  const body = str(perStepRaw["pageBody"]);
  const lines = ["Results (correctness gate on the toy; not compare:inflate):"];
  if (body !== null) lines.push(body);
  if (verdict !== null) lines.push(`Verdict: ${verdict}`);
  return { rules, results: lines.join("\n") };
}
