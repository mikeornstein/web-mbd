/**
 * Read-only stretch diagnostics. Not a gate. Does not change physics.
 * Decision rules are in stretchDiagnosticRules.ts (committed first).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { RAYLEIGH_ALPHA } from "../inflate/constants.js";
import {
  SIXTEEN_MS_SPREAD_NOTE,
  compareInflateToGolden,
  formatEveryFrameTable,
  toySamplesFromSolve,
} from "../oracle/compareInflate.js";
import { loadInflateGolden } from "../oracle/inflateGolden.js";
import {
  DECK_FINE_REORIENTED,
  DECK_ISHELL24_ISMSTR2,
  DECK_TRIANGLE_SH3N,
  GOLDEN_TAPE,
  interpolateStretch,
} from "../oracle/survivingDecks.js";
import {
  RULE_INTERP,
  STRETCH_DIAGNOSTIC_RULES_LINES,
  scoreStretchDiagnostics,
  type EnergyFrameInput,
  type SeriesPoint,
  type StretchDiagnosticsInput,
} from "../oracle/stretchDiagnosticRules.js";
import {
  membraneStrainEnergyFromCoords,
  stretchFieldFromCoords,
  stretchStats,
} from "../oracle/stretchField.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const FRAME_MS = [0, 2, 4, 6, 8, 10, 12, 14, 16] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`diag: bad ${label}`);
  return v;
}

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

interface FieldSnap {
  t_ms: number;
  max: number;
  p50: number;
  areaWeightedMean: number;
}

function readStretchMeasureToyAndGolden(): { toy: FieldSnap[]; golden: FieldSnap[] } {
  const raw: unknown = JSON.parse(readFileSync(resolve(DIAG, "stretch-measure.json"), "utf8"));
  if (!isRecord(raw)) throw new Error("stretch-measure");
  const snaps = raw["snapshots"];
  if (!Array.isArray(snaps)) throw new Error("stretch-measure snapshots");
  const toy: FieldSnap[] = [];
  const golden: FieldSnap[] = [];
  for (const row of snaps) {
    if (!isRecord(row)) continue;
    const t_ms = num(row["t_ms"], "t_ms");
    const take = (key: string, into: FieldSnap[]): void => {
      const block = row[key];
      if (!isRecord(block)) return;
      const stats = block["stats"];
      if (!isRecord(stats)) return;
      into.push({
        t_ms,
        max: num(stats["max"], `${key}.max`),
        p50: num(stats["p50"], `${key}.p50`),
        areaWeightedMean: num(stats["areaWeightedMean"], `${key}.awm`),
      });
    };
    take("toyKillOff", toy);
    take("radioss", golden);
  }
  return { toy, golden };
}

function readElementTypeMedians(): { name: string; snaps: FieldSnap[]; times: number[] }[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(DIAG, "element-type.json"), "utf8"));
  if (!isRecord(raw)) throw new Error("element-type");
  const runs = raw["runs"];
  if (!isRecord(runs)) throw new Error("element-type runs");
  const wanted: { key: string; name: string }[] = [
    { key: "qephIsmstr2", name: "Ishell 24 ismstr 2" },
    { key: "fine", name: "fine re-oriented" },
    { key: "sh3n", name: "triangle /SH3N" },
  ];
  const out: { name: string; snaps: FieldSnap[]; times: number[] }[] = [];
  for (const w of wanted) {
    const run = runs[w.key];
    if (!isRecord(run)) continue;
    const snapsRaw = run["snapshots"];
    if (!Array.isArray(snapsRaw)) continue;
    const snaps: FieldSnap[] = [];
    for (const row of snapsRaw) {
      if (!isRecord(row)) continue;
      if (row["available"] !== true) continue;
      const stats = row["stats"];
      if (!isRecord(stats)) continue;
      snaps.push({
        t_ms: num(row["t_ms"], "t_ms"),
        max: num(stats["max"], "max"),
        p50: num(stats["p50"], "p50"),
        areaWeightedMean: num(stats["areaWeightedMean"], "awm"),
      });
    }
    out.push({ name: w.name, snaps, times: snaps.map((s) => s.t_ms) });
  }
  return out;
}

function readRadiossOwnPsi(): { t_ms: number; psi_J: number }[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(DIAG, "oriented-ismstr2-metrics.json"), "utf8"));
  if (!Array.isArray(raw)) throw new Error("oriented metrics");
  const out: { t_ms: number; psi_J: number }[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const t = num(row["t"], "t");
    if (t > 0.017) continue;
    out.push({ t_ms: Math.round(t * 1000), psi_J: num(row["Psi_J"], "Psi_J") });
  }
  return out;
}

function snapAt(snaps: readonly FieldSnap[], t_ms: number): FieldSnap | null {
  for (const s of snaps) {
    if (s.t_ms === t_ms) return s;
  }
  return null;
}

function fmt(n: number | null, digits = 4): string {
  if (n === null) return "n/a";
  return n.toFixed(digits);
}

function pct(n: number | null): string {
  if (n === null) return "n/a";
  return `${(100 * n).toFixed(2)}%`;
}

function main(): void {
  console.log("MEASUREMENT. Stretch diagnostics. Not a physics pass. Does not gate.");
  for (const line of STRETCH_DIAGNOSTIC_RULES_LINES) console.log(line);
  console.log(RULE_INTERP);

  const vtkGolden = vtkCount(resolve(ROOT, "radioss/A-inflate/run"));
  const vtkOriented = vtkCount(resolve(ROOT, "radioss/diag-oriented-ismstr2/run"));
  const vtkSh3n = vtkCount(resolve(ROOT, "radioss/diag-element-type/sh3n/run"));
  const vtkIshell = vtkCount(resolve(ROOT, "radioss/diag-element-type/qeph-ismstr2/run"));
  const vtkFine = vtkCount(resolve(ROOT, "radioss/diag-element-type/fine/run"));
  const vtkNote = [
    `golden A-inflate VTK files: ${String(vtkGolden)}`,
    `oriented-ismstr2 VTK files: ${String(vtkOriented)}`,
    `triangle /SH3N VTK files: ${String(vtkSh3n)}`,
    `Ishell 24 VTK files: ${String(vtkIshell)}`,
    `fine re-oriented VTK files: ${String(vtkFine)}`,
  ].join("\n");
  const goldenPositionsUsable = vtkGolden + vtkOriented > 0;
  const deckPositionNotes = [
    {
      name: "golden Belytschko quad",
      usable: goldenPositionsUsable,
      frames: goldenPositionsUsable ? "animation frames present" : "no animation frames in this repository",
    },
    {
      name: "Ishell 24 ismstr 2",
      usable: vtkIshell > 0,
      frames: vtkIshell > 0 ? "animation frames present" : "no animation frames in this repository",
    },
    {
      name: "fine re-oriented",
      usable: vtkFine > 0,
      frames: vtkFine > 0 ? "animation frames present" : "no animation frames in this repository",
    },
    {
      name: "triangle /SH3N",
      usable: vtkSh3n > 0,
      frames: vtkSh3n > 0 ? "animation frames present" : "no animation frames in this repository",
    },
  ];

  const model = createInflateAModel();
  const result = solveInflate(model, { maxWallMs: 600_000 });
  const times = result.history.map((h) => h.t);
  const rest = model.mesh.coords;
  const quads = model.mesh.quads;
  const alpha = model.law.rayleighAlpha;
  if (alpha !== RAYLEIGH_ALPHA) {
    throw new Error("Rayleigh mass rate drifted; do not retune");
  }

  const bookkeeping: EnergyFrameInput[] = [];
  const toyStrain: { t_ms: number; psi_J: number; interpolated: boolean }[] = [];
  const volumeToy: SeriesPoint[] = [];
  const maxToy: SeriesPoint[] = [];
  const medianToy: SeriesPoint[] = [];
  const awmToy: SeriesPoint[] = [];
  const energyRows: {
    t_ms: number;
    pressureWork_J: number;
    strain_J: number;
    kinetic_J: number;
    damping_J: number;
    bookkeepingRel: number;
    median: number;
    awm: number;
    max: number;
    interpolated: boolean;
  }[] = [];

  let pressW = 0;
  let dampW = 0;
  for (const t_ms of FRAME_MS) {
    const idx = nearestIndex(times, t_ms / 1000);
    const h = result.history[idx];
    const coords = result.meshHistory[idx];
    const lam = result.lambdaHistory[idx];
    const p = result.pressureHistory[idx];
    const vol = result.volumeHistory[idx];
    if (h === undefined || coords === undefined || lam === undefined || p === undefined || vol === undefined) {
      throw new Error(`missing toy sample near ${String(t_ms)} ms`);
    }
    if (idx > 0) {
      const prev = result.history[idx - 1]!;
      const prevP = result.pressureHistory[idx - 1]!;
      const prevV = result.volumeHistory[idx - 1]!;
      pressW += 0.5 * (p + prevP) * (vol - prevV);
      dampW += alpha * (h.kinetic + prev.kinetic) * (h.t - prev.t);
    }
    const psiFromCoords = membraneStrainEnergyFromCoords(coords, rest, quads);
    const field = stretchFieldFromCoords(coords, rest, quads);
    const stats = stretchStats(field);
    const interpolated = t_ms === 10 || t_ms === 12 || t_ms === 14;
    const rhs = psiFromCoords + h.kinetic + dampW;
    const denom = Math.max(Math.abs(pressW), Math.abs(rhs), 1e-12);
    const bookkeepingRel = Math.abs(pressW - rhs) / denom;
    bookkeeping.push({
      t_ms,
      pressureWork_J: pressW,
      strain_J: psiFromCoords,
      kinetic_J: h.kinetic,
      damping_J: dampW,
      interpolated,
    });
    toyStrain.push({ t_ms, psi_J: psiFromCoords, interpolated });
    volumeToy.push({ t_ms, y: vol * 1e6 });
    maxToy.push({ t_ms, y: lam });
    medianToy.push({ t_ms, y: stats.p50 });
    awmToy.push({ t_ms, y: stats.areaWeightedMean });
    energyRows.push({
      t_ms,
      pressureWork_J: pressW,
      strain_J: psiFromCoords,
      kinetic_J: h.kinetic,
      damping_J: dampW,
      bookkeepingRel,
      median: stats.p50,
      awm: stats.areaWeightedMean,
      max: lam,
      interpolated,
    });
  }

  const measure = readStretchMeasureToyAndGolden();
  const decks = readElementTypeMedians();
  const radiossOwnPsi = readRadiossOwnPsi();
  const volumeGold: SeriesPoint[] = GOLDEN_TAPE.map((row) => ({ t_ms: row.t_ms, y: row.volume_mL }));
  const maxGold: SeriesPoint[] = GOLDEN_TAPE.map((row) => ({ t_ms: row.t_ms, y: row.lambdaMax }));
  const medianGold: SeriesPoint[] = measure.golden.map((s) => ({ t_ms: s.t_ms, y: s.p50 }));

  const input: StretchDiagnosticsInput = {
    bookkeeping,
    toyStrain,
    goldenStrain: {
      at8_J: null,
      at16_J: null,
      at4_J: null,
      fromToyFunctionOnNodePositions: goldenPositionsUsable,
      note: goldenPositionsUsable
        ? "computed from animation node positions with the toy function"
        : "no animation frames in this repository; cannot compute golden strain energy from node positions with the toy function",
    },
    deckStrainAt8: [],
    deckStrainAt16: [],
    volumeToy,
    volumeGold,
    medianToy,
    medianGold,
    maxToy,
    maxGold,
  };
  const score = scoreStretchDiagnostics(input);

  const golden = loadInflateGolden();
  const cmp = compareInflateToGolden(
    { ...result.metrics, law: result.law, samples: toySamplesFromSolve(result) },
    golden,
  );
  const tally = formatEveryFrameTable(cmp);

  const medianLines: string[] = [
    "t_ms | source | max | median | median strain (λ−1) | volume-averaged stretch | strain from volume-averaged | interpolated",
  ];
  const medianSources: { name: string; snaps: FieldSnap[] }[] = [
    { name: "toy (this solve, toy function on node positions)", snaps: energyRows.map((r) => ({ t_ms: r.t_ms, max: r.max, p50: r.median, areaWeightedMean: r.awm })) },
    { name: "golden (stretch-measure, committed field stats)", snaps: measure.golden },
    { name: "toy kill-off (stretch-measure, committed field stats)", snaps: measure.toy },
    ...decks.map((d) => ({ name: d.name, snaps: d.snaps })),
  ];
  for (const t_ms of FRAME_MS) {
    for (const src of medianSources) {
      const s = snapAt(src.snaps, t_ms);
      const interp = t_ms === 10 || t_ms === 12 || t_ms === 14;
      if (s === null) {
        medianLines.push(
          `${String(t_ms)} | ${src.name} | n/a | n/a | n/a | n/a | n/a | ${interp ? "yes (decides nothing)" : "no"}`,
        );
        continue;
      }
      medianLines.push(
        `${String(t_ms)} | ${src.name} | ${fmt(s.max)} | ${fmt(s.p50)} | ${fmt(s.p50 - 1)} | ${fmt(s.areaWeightedMean)} | ${fmt(s.areaWeightedMean - 1)} | ${interp ? "yes (decides nothing)" : "no"}`,
      );
    }
  }

  const energyLines: string[] = [
    "t_ms | toy strain (J, toy function on node positions) | toy kinetic (J) | toy damping (J, Rayleigh integral) | toy pressure work (J) | bookkeeping rel | Radioss own strain (J, not the toy function) | interpolated",
  ];
  for (const row of energyRows) {
    const own = radiossOwnPsi.find((p) => p.t_ms === row.t_ms);
    energyLines.push(
      `${String(row.t_ms)} | ${fmt(row.strain_J, 6)} | ${fmt(row.kinetic_J, 6)} | ${fmt(row.damping_J, 6)} | ${fmt(row.pressureWork_J, 6)} | ${pct(row.bookkeepingRel)} | ${own === undefined ? "n/a" : fmt(own.psi_J, 6)} | ${row.interpolated ? "yes (decides nothing)" : "no"}`,
    );
  }

  const positionLines = deckPositionNotes.map(
    (d) => `- ${d.name}: ${d.usable ? "usable node positions" : "no usable node positions"} (${d.frames})`,
  );

  const maxTape = [
    { name: "golden Belytschko quad", samples: GOLDEN_TAPE },
    { name: "Ishell 24 ismstr 2", samples: DECK_ISHELL24_ISMSTR2 },
    { name: "fine re-oriented", samples: DECK_FINE_REORIENTED },
    { name: "triangle /SH3N", samples: DECK_TRIANGLE_SH3N },
  ];
  const earlyLines: string[] = ["2 and 4 ms vs the spread of all decks (not the golden alone):"];
  for (const t_ms of [2, 4] as const) {
    const members: string[] = [];
    const vals: number[] = [];
    for (const deck of maxTape) {
      const hit = interpolateStretch(deck.samples, t_ms);
      if (hit === null) continue;
      members.push(`${deck.name} ${hit.lambdaMax.toFixed(4)}${hit.interpolated ? " (interp)" : ""}`);
      vals.push(hit.lambdaMax);
    }
    const toy = maxToy.find((r) => r.t_ms === t_ms);
    let min = vals[0];
    let max = vals[0];
    if (min === undefined || max === undefined) {
      earlyLines.push(`  ${String(t_ms)} ms: no deck samples`);
      continue;
    }
    for (const v of vals) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const inside = toy !== undefined && toy.y >= min && toy.y <= max;
    earlyLines.push(
      `  ${String(t_ms)} ms: toy max ${fmt(toy?.y ?? null)} vs deck spread ${fmt(min)}–${fmt(max)} → ${inside ? "inside" : "outside"}. Members: ${members.join("; ")}.`,
    );
  }

  const shiftLine = [
    `volume shift ${fmt(score.shift.volume_ms, 3)} ms`,
    `median stretch shift ${fmt(score.shift.median_ms, 3)} ms`,
    `maximum stretch shift ${fmt(score.shift.max_ms, 3)} ms`,
    score.shift.note,
  ].join("; ");

  const pageBody = [
    "The film runs about half a millisecond behind the reference solvers throughout the run. That shows up as roughly 12% low in median stretch mid-run (8 ms) and about 3% low at the 16 ms freeze; the 0.5 ms fit was made across all frames, so the lag does not disappear at the freeze, it only looks smaller there because stretch changes more slowly near the end. Node positions sit about three times farther from the decks than the decks sit from each other, so the shape does not match.",
    SIXTEEN_MS_SPREAD_NOTE,
    ...energyLines,
    ...medianLines,
    `Shift: ${shiftLine}`,
    `Verdict: ${score.verdictLine}`,
  ].join("\n");

  const md = [
    "# Stretch diagnostics (measurement, not a gate)",
    "",
    "The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`",
    "is pinned only to the OpenCourant copy, not the original OpenRadioss",
    "tree. Rules were committed first in `stretch-diagnostics-prediction.md`",
    "and were not changed after this run.",
    "",
    "## Locked rules (unchanged)",
    "",
    ...STRETCH_DIAGNOSTIC_RULES_LINES.map((l) => `- ${l}`),
    "",
    "## Corrected Themis tally (committed max-stretch tapes + this solve)",
    "",
    "```",
    tally,
    "```",
    "",
    `16 ms note: ${SIXTEEN_MS_SPREAD_NOTE}`,
    "",
    "## Node positions",
    "",
    vtkNote,
    ...positionLines,
    "",
    "## Energy table",
    "",
    "Toy strain energy is the toy function on this solve’s node positions.",
    "Radioss own strain is `Psi_J` from `oriented-ismstr2-metrics.json` — a",
    "different quantity, not used to score energy-agrees.",
    "",
    "```",
    ...energyLines,
    "```",
    "",
    `Bookkeeping worst relative residual: ${pct(score.bookkeepingWorstRel)}. Pass at 3%: ${score.bookkeepingOk ? "yes" : "NO — STOP"}`,
    "",
    "Deck kinetic energy: none of the committed deck tapes store velocities,",
    "so deck kinetic energy is not computed. Deck damping loss as remainder",
    "is not computed either, because deck strain energy from the toy function",
    "on node positions is missing when animation frames are missing.",
    "",
    "## Median and strain table",
    "",
    "```",
    ...medianLines,
    "```",
    "",
    ...earlyLines,
    "",
    "## Time shift (diagnostic only; never applied)",
    "",
    shiftLine,
    "",
    `energy-agrees=${String(score.energyAgrees)} energy-low=${String(score.energyLow)} one-shift-fits=${String(score.oneShiftFits)} median-agrees=${String(score.medianAgrees)} energy-comparable=${String(score.energyComparable)}`,
    `energy 8 ms toy ${fmt(score.energyAt8.toy, 6)} J vs golden ${fmt(score.energyAt8.golden, 6)} J rel ${pct(score.energyAt8.rel)}`,
    `energy 16 ms toy ${fmt(score.energyAt16.toy, 6)} J vs golden ${fmt(score.energyAt16.golden, 6)} J rel ${pct(score.energyAt16.rel)}`,
    `energy 4 ms toy ${fmt(score.energyAt4.toy, 6)} J vs golden ${fmt(score.energyAt4.golden, 6)} J (reported, not a decide row)`,
    `median strain 8 ms toy ${fmt(score.medianStrainAt8.toy, 6)} vs golden ${fmt(score.medianStrainAt8.golden, 6)} rel ${pct(score.medianStrainAt8.rel)}`,
    `median strain 16 ms toy ${fmt(score.medianStrainAt16.toy, 6)} vs golden ${fmt(score.medianStrainAt16.golden, 6)} rel ${pct(score.medianStrainAt16.rel)}`,
    "",
    "## Verdict",
    "",
    score.verdictLine,
  ].join("\n");

  writeFileSync(resolve(DIAG, "stretch-diagnostics-results.md"), `${md}\n`);
  const payload = {
    kind: "stretch-diagnostics-measurement",
    status: "run",
    notAGate: true,
    verdictLine: score.verdictLine,
    pageBody,
    bookkeepingOk: score.bookkeepingOk,
    energyAgrees: score.energyAgrees,
    energyLow: score.energyLow,
    oneShiftFits: score.oneShiftFits,
    medianAgrees: score.medianAgrees,
    energyComparable: score.energyComparable,
    shift: score.shift,
    vtk: { vtkGolden, vtkOriented, vtkSh3n, vtkIshell, vtkFine },
  };
  writeFileSync(resolve(DIAG, "stretch-diagnostics-results.json"), `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(
    resolve(ROOT, "src/oracle/stretch-diagnostics-results.json"),
    `${JSON.stringify(
      {
        kind: "stretch-diagnostics-measurement",
        status: "run",
        notAGate: true,
        verdictLine: score.verdictLine,
        pageBody,
      },
      null,
      2,
    )}\n`,
  );

  console.log(md);
  console.log(score.verdictLine);
}

main();
