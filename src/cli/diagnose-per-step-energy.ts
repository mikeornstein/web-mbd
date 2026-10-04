/**
 * Per-step energy bookkeeping. Correctness gate on the toy.
 * Decision rules are in perStepEnergyRules.ts (committed first).
 * Does not change physics. Does not widen any bar. Does not apply a time shift.
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { RAYLEIGH_ALPHA } from "../inflate/constants.js";
import type { InflateModelIR, InflateSolveResult } from "../inflate/types.js";
import {
  ENGINE_STEP_CAP_S,
  PER_STEP_ENERGY_RULES_LINES,
  PER_STEP_REPORT_MS,
  RAYLEIGH_TWO_ALPHA,
  scorePerStepEnergyGate,
  type PerStepEnergyFrame,
  type PerStepRunInput,
} from "../oracle/perStepEnergyRules.js";
import {
  scoreStretchDiagnostics,
  type EnergyFrameInput,
  type StretchDiagnosticsInput,
} from "../oracle/stretchDiagnosticRules.js";
import { GOLDEN_TAPE } from "../oracle/survivingDecks.js";
import { stretchFieldFromCoords, stretchStats } from "../oracle/stretchField.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");

function vtkCount(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((n) => n.endsWith(".vtk")).length;
}

function nearestIndex(times: readonly number[], t: number): number {
  let best = 0;
  let bestDt = Math.abs(times[0]! - t);
  for (let i = 1; i < times.length; i++) {
    const dt = Math.abs(times[i]! - t);
    if (dt < bestDt) {
      best = i;
      bestDt = dt;
    }
  }
  return best;
}

function fmt(n: number | null, digits = 6): string {
  if (n === null) return "n/a";
  return n.toFixed(digits);
}

function pct(n: number | null): string {
  if (n === null) return "n/a";
  return `${(100 * n).toFixed(2)}%`;
}

function withDtMax(model: InflateModelIR, dtMax: number): InflateModelIR {
  return { ...model, controls: { ...model.controls, dtMax } };
}

function framesFromSolve(result: InflateSolveResult): PerStepEnergyFrame[] {
  const ledger = result.perStepEnergy;
  if (ledger === undefined) throw new Error("per-step energy ledger missing");
  const times = ledger.snapshots.map((s) => s.t);
  if (times.length === 0) throw new Error("per-step energy ledger empty");
  const out: PerStepEnergyFrame[] = [];
  for (const t_ms of PER_STEP_REPORT_MS) {
    const idx = nearestIndex(times, t_ms / 1000);
    const snap = ledger.snapshots[idx];
    const coords = result.meshHistory[idx];
    if (snap === undefined || coords === undefined) {
      throw new Error(`missing per-step sample near ${String(t_ms)} ms`);
    }
    out.push({
      t_ms,
      pressureWork_J: snap.pressureWork_J,
      strain_J: snap.strain_J,
      kinetic_J: snap.kinetic_J,
      dampingLogged_J: snap.dampingLogged_J,
      keIntegral_J_s: snap.keIntegral_J_s,
      dampingForceWork_J: snap.dampingForceWork_J,
      interpolated: t_ms === 10 || t_ms === 12 || t_ms === 14,
    });
  }
  return out;
}

function runInput(label: string, result: InflateSolveResult): PerStepRunInput {
  const ledger = result.perStepEnergy;
  if (ledger === undefined) throw new Error("per-step energy ledger missing");
  return {
    label,
    meanDt_s: ledger.meanDt_s,
    nSteps: ledger.nSteps,
    frames: framesFromSolve(result),
  };
}

function tableLines(label: string, result: InflateSolveResult, frames: readonly PerStepEnergyFrame[]): string[] {
  const ledger = result.perStepEnergy;
  if (ledger === undefined) throw new Error("per-step energy ledger missing");
  const lines = [
    `${label}: nSteps=${String(ledger.nSteps)} meanDt=${ledger.meanDt_s.toExponential(3)} s minDt=${ledger.minDt_s.toExponential(3)} s maxDt=${ledger.maxDt_s.toExponential(3)} s`,
    "t_ms | pressure work (J) | strain (J) | kinetic (J) | damping logged (J) | 160 × ∫KE (J) | force-work damping (J) | gap (J) | sign | rel | close 3%",
  ];
  for (const row of frames) {
    const rhs = row.strain_J + row.kinetic_J + row.dampingLogged_J;
    const gap = row.pressureWork_J - rhs;
    const denom = Math.max(Math.abs(row.pressureWork_J), Math.abs(rhs), 1e-12);
    const rel = Math.abs(gap) / denom;
    const sign = gap > 0 ? "positive" : gap < 0 ? "negative" : "zero";
    const expected = RAYLEIGH_TWO_ALPHA * row.keIntegral_J_s;
    lines.push(
      `${String(row.t_ms)} | ${fmt(row.pressureWork_J)} | ${fmt(row.strain_J)} | ${fmt(row.kinetic_J)} | ${fmt(row.dampingLogged_J)} | ${fmt(expected)} | ${fmt(row.dampingForceWork_J)} | ${fmt(gap)} | ${sign} | ${pct(rel)} | ${rel <= 0.03 ? "yes" : "NO"}`,
    );
  }
  return lines;
}

function searchNodePositions(): { lines: string[]; anyUsable: boolean } {
  const vtkGolden = vtkCount(resolve(ROOT, "radioss/A-inflate/run"));
  const vtkOriented = vtkCount(resolve(ROOT, "radioss/diag-oriented-ismstr2/run"));
  const vtkSh3n = vtkCount(resolve(ROOT, "radioss/diag-element-type/sh3n/run"));
  const vtkIshell = vtkCount(resolve(ROOT, "radioss/diag-element-type/qeph-ismstr2/run"));
  const vtkFine = vtkCount(resolve(ROOT, "radioss/diag-element-type/fine/run"));
  const lines = [
    `golden A-inflate VTK files: ${String(vtkGolden)} (path radioss/A-inflate/run, gitignored)`,
    `oriented-ismstr2 VTK files: ${String(vtkOriented)}`,
    `triangle /SH3N VTK files: ${String(vtkSh3n)}`,
    `Ishell 24 VTK files: ${String(vtkIshell)}`,
    `fine re-oriented VTK files: ${String(vtkFine)}`,
    "GitHub Actions artifacts on pull requests 18–22 are web-mbd-preview (the built web app) only; no animation or node-position files.",
  ];
  const anyUsable = vtkGolden + vtkOriented + vtkSh3n + vtkIshell + vtkFine > 0;
  return { lines, anyUsable };
}

function energyFrames(frames: readonly PerStepEnergyFrame[]): EnergyFrameInput[] {
  return frames.map((row) => ({
    t_ms: row.t_ms,
    pressureWork_J: row.pressureWork_J,
    strain_J: row.strain_J,
    kinetic_J: row.kinetic_J,
    damping_J: row.dampingLogged_J,
    interpolated: row.interpolated,
  }));
}

function main(): void {
  console.log("PER-STEP ENERGY. Correctness gate on the toy. Not compare:inflate.");
  for (const line of PER_STEP_ENERGY_RULES_LINES) console.log(line);

  const model = createInflateAModel();
  if (model.controls.dtMax !== undefined) {
    throw new Error("shipped default must not set dtMax");
  }
  if (model.law.rayleighAlpha !== RAYLEIGH_ALPHA) {
    throw new Error("Rayleigh mass rate drifted; do not retune");
  }
  if (model.controls.damping.kind !== "off") {
    throw new Error("shipped default must stay velocity kill off");
  }

  console.log("Solving toy CFL step (about 8 microseconds, no dtMax)...");
  const cflResult = solveInflate(model, { maxWallMs: 600_000, recordPerStepEnergy: true });
  console.log(`  steps ${String(cflResult.metrics.nSteps)} meanDt=${cflResult.perStepEnergy?.meanDt_s.toExponential(3) ?? "n/a"}`);

  console.log("Solving engine 2 microsecond cap (dtMax = 0.000002 s)...");
  const capResult = solveInflate(withDtMax(model, ENGINE_STEP_CAP_S), {
    maxWallMs: 600_000,
    recordPerStepEnergy: true,
  });
  console.log(`  steps ${String(capResult.metrics.nSteps)} meanDt=${capResult.perStepEnergy?.meanDt_s.toExponential(3) ?? "n/a"}`);

  const cflRun = runInput("toy CFL (no dtMax)", cflResult);
  const capRun = runInput("engine 2 microsecond cap", capResult);
  const gate = scorePerStepEnergyGate(cflRun, capRun);
  const nodeSearch = searchNodePositions();

  const cflTable = tableLines("Toy CFL (no dtMax)", cflResult, cflRun.frames);
  const capTable = tableLines("Engine 2 microsecond cap", capResult, capRun.frames);

  let chironLine = "Chiron/Themis rows not scored (bookkeeping gate did not pass).";
  if (gate.applyChironThemisRows) {
    const rest = model.mesh.coords;
    const quads = model.mesh.quads;
    const volumeToy: { t_ms: number; y: number }[] = [];
    const medianToy: { t_ms: number; y: number }[] = [];
    const maxToy: { t_ms: number; y: number }[] = [];
    const histTimes = cflResult.history.map((h) => h.t);
    for (const t_ms of PER_STEP_REPORT_MS) {
      const idx = nearestIndex(histTimes, t_ms / 1000);
      const coords = cflResult.meshHistory[idx];
      const vol = cflResult.volumeHistory[idx];
      const lam = cflResult.lambdaHistory[idx];
      if (coords === undefined || vol === undefined || lam === undefined) continue;
      const stats = stretchStats(stretchFieldFromCoords(coords, rest, quads));
      volumeToy.push({ t_ms, y: vol * 1e6 });
      medianToy.push({ t_ms, y: stats.p50 });
      maxToy.push({ t_ms, y: lam });
    }
    const input: StretchDiagnosticsInput = {
      bookkeeping: energyFrames(cflRun.frames),
      toyStrain: cflRun.frames.map((row) => ({
        t_ms: row.t_ms,
        psi_J: row.strain_J,
        interpolated: row.interpolated,
      })),
      goldenStrain: {
        at8_J: null,
        at16_J: null,
        at4_J: null,
        fromToyFunctionOnNodePositions: nodeSearch.anyUsable,
        note: nodeSearch.anyUsable
          ? "computed from animation node positions with the toy function"
          : "no animation frames in this repository; cannot compute golden strain energy from node positions with the toy function",
      },
      deckStrainAt8: [],
      deckStrainAt16: [],
      volumeToy,
      volumeGold: GOLDEN_TAPE.map((row) => ({ t_ms: row.t_ms, y: row.volume_mL })),
      medianToy,
      medianGold: [],
      maxToy,
      maxGold: GOLDEN_TAPE.map((row) => ({ t_ms: row.t_ms, y: row.lambdaMax })),
    };
    chironLine = scoreStretchDiagnostics(input).verdictLine;
  }

  const pageBody = [
    ...cflTable,
    ...capTable,
    `Damping cross-check CFL worst rel ${pct(gate.cfl.dampingWorstRel)} ok=${String(gate.cfl.dampingOk)}`,
    `Damping cross-check 2 microsecond worst rel ${pct(gate.cap.dampingWorstRel)} ok=${String(gate.cap.dampingOk)}`,
    `Step sizes agree at 2–8 ms: ${String(gate.stepSizesAgree)}`,
    gate.verdictLine,
  ].join("\n");

  const md = [
    "# Per-step energy bookkeeping (correctness gate on the toy)",
    "",
    "The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`",
    "is pinned only to the OpenCourant copy, not the original OpenRadioss",
    "tree. Rules were committed first in `stretch-per-step-energy-prediction.md`",
    "and were not changed after this run.",
    "",
    "## Locked rules (unchanged)",
    "",
    ...PER_STEP_ENERGY_RULES_LINES.map((l) => `- ${l}`),
    "",
    "## Toy CFL (no dtMax)",
    "",
    "```",
    ...cflTable,
    "```",
    "",
    "## Engine 2 microsecond cap",
    "",
    "```",
    ...capTable,
    "```",
    "",
    "## Damping cross-check",
    "",
    `CFL: logged vs 160 × ∫KE worst relative ${pct(gate.cfl.dampingWorstRel)} → ${gate.cfl.dampingOk ? "pass" : "FAIL"}`,
    `2 microsecond: logged vs 160 × ∫KE worst relative ${pct(gate.cap.dampingWorstRel)} → ${gate.cap.dampingOk ? "pass" : "FAIL"}`,
    "",
    "## Node positions",
    "",
    ...nodeSearch.lines,
    "",
    nodeSearch.anyUsable
      ? "Animation frames were found; deck strain energy uses the toy function on those node positions."
      : [
          "Animation frames do **not** exist in this checkout, in gitignored `radioss/**/run/` trees, or in GitHub Actions artifacts of pull requests 18–22.",
          "Re-running the decks with node output would need: the OpenCourant linux64 package (starter, engine, anim_to_vtk; no licence — it is an open package), the committed starter/engine decks under `radioss/A-inflate` and `radioss/diag-element-type/*`, `scripts/run-element-type.sh` (about 5 minutes per deck, 10 minutes for the fine mesh, 4 OpenMP threads), and ANIM→VTK conversion. VTK files are gitignored and were never uploaded as CI artifacts. Do not run that without being told.",
        ].join(" "),
    "",
    "## Verdict",
    "",
    `kind=${gate.kind}`,
    `stepSizesAgree=${String(gate.stepSizesAgree)} applyChironThemisRows=${String(gate.applyChironThemisRows)}`,
    `CFL miss at 2–8 ms: ${gate.cfl.missAtGateMs.join(", ") || "none"}`,
    `2 microsecond miss at 2–8 ms: ${gate.cap.missAtGateMs.join(", ") || "none"}`,
    gate.verdictLine,
    chironLine,
  ].join("\n");

  writeFileSync(resolve(DIAG, "stretch-per-step-energy-results.md"), `${md}\n`);
  const payload = {
    kind: "per-step-energy-gate",
    status: "run",
    correctnessGateOnToy: true,
    notAGateForCompare: true,
    verdictLine: gate.verdictLine,
    pageBody,
    gateKind: gate.kind,
    stepSizesAgree: gate.stepSizesAgree,
    applyChironThemisRows: gate.applyChironThemisRows,
    chironLine,
    cfl: {
      nSteps: cflResult.metrics.nSteps,
      meanDt_s: cflResult.perStepEnergy?.meanDt_s ?? null,
      missAtGateMs: gate.cfl.missAtGateMs,
      dampingOk: gate.cfl.dampingOk,
      dampingWorstRel: gate.cfl.dampingWorstRel,
    },
    cap: {
      nSteps: capResult.metrics.nSteps,
      meanDt_s: capResult.perStepEnergy?.meanDt_s ?? null,
      missAtGateMs: gate.cap.missAtGateMs,
      dampingOk: gate.cap.dampingOk,
      dampingWorstRel: gate.cap.dampingWorstRel,
    },
  };
  writeFileSync(resolve(DIAG, "stretch-per-step-energy-results.json"), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(
    resolve(ROOT, "src/oracle/per-step-energy-results.json"),
    `${JSON.stringify(
      {
        kind: "per-step-energy-gate",
        status: "run",
        correctnessGateOnToy: true,
        notAGateForCompare: true,
        verdictLine: gate.verdictLine,
        pageBody,
      },
      null,
      2,
    )}\n`,
  );
  console.log(md);
  console.log(gate.verdictLine);
}

main();
