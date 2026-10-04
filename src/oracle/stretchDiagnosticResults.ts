import stretchDiagRaw from "./stretch-diagnostics-results.json" with { type: "json" };
import { STRETCH_DIAGNOSTIC_RULES_LINES } from "./stretchDiagnosticRules.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Page copy. Rules are always shown. Results stay empty until the later run commit. */
export function stretchDiagnosticsPageText(): { rules: string; results: string } {
  const rules = [
    "Letter A stretch diagnostics (measurement, not a gate). Do not widen any bar. Do not apply a time shift.",
    ...STRETCH_DIAGNOSTIC_RULES_LINES,
  ].join("\n");
  if (!isRecord(stretchDiagRaw)) {
    return { rules, results: "Rules committed first. Results file is unreadable." };
  }
  const status = str(stretchDiagRaw["status"]);
  if (status === "rules-committed-results-not-yet-run") {
    return { rules, results: "Rules committed first. Results not yet written." };
  }
  const verdict = str(stretchDiagRaw["verdictLine"]);
  const body = str(stretchDiagRaw["pageBody"]);
  const lines = ["Results (measurement, not a gate):"];
  if (body !== null) lines.push(body);
  if (verdict !== null) lines.push(`Verdict: ${verdict}`);
  return { rules, results: lines.join("\n") };
}
