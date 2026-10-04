/**
 * Four-deck node-output measurement. Not a gate. Does not change physics.
 * Plan/rules are locked in deckNodeOutputRules.ts (committed first).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { enclosedVolume, loadShipMesh } from "../inflate/meshA.js";
import {
  FINE_DECK_FOLDER,
  GOLDEN_DECK_FOLDER,
  ISHELL24_DECK_FOLDER,
  OPENCOURANT_ENGINE_COMMIT,
  OPENCOURANT_TAG,
  OPENCOURANT_ZIP_BYTES,
  OPENCOURANT_ZIP_SHA256,
  TRIANGLE_DECK_FOLDER,
  DECK_NODE_REQUESTED_MS,
  DECK_NODE_TRIANGLE_STOP_MS,
} from "../oracle/deckNodeOutputRules.js";
import {
  kineticEnergyFromVelocities,
  lumpedMassesFromRests,
  parseRadiossShellBlock,
  restsFromTris,
  splitPlanFor1554Quads,
  splitPlanForCommittedTriangles,
  splitPlanForFineLocal,
  strainEnergyFromRests,
  stretchFromTris,
  toyDiagonalsFromOrientedQuads,
  type SplitPlan,
} from "../oracle/deckNodeEnergy.js";
import {
  BOOKKEEPING_REL,
  scoreStretchDiagnostics,
  type EnergyFrameInput,
  type SeriesPoint,
} from "../oracle/stretchDiagnosticRules.js";
import { parseVtkAnimShells, scatterShellToNodeOrder, scatterVelocitiesToNodeOrder } from "../oracle/vtkAnim.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function fmt(v: number | null, digits = 6): string {
  if (v === null) return "n/a";
  return v.toFixed(digits);
}

function pct(v: number | null): string {
  if (v === null) return "n/a";
  return `${(100 * v).toFixed(2)}%`;
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

interface DeckSpec {
  tableName: string;
  folder: string;
  nNodes: number;
  split: "mapped-1554" | "fine-local" | "triangle-committed";
}

const DECKS: readonly DeckSpec[] = [
  { tableName: "golden Belytschko quad", folder: GOLDEN_DECK_FOLDER, nNodes: 1554, split: "mapped-1554" },
  { tableName: "Ishell 24 ismstr 2", folder: ISHELL24_DECK_FOLDER, nNodes: 1554, split: "mapped-1554" },
  { tableName: "fine re-oriented", folder: FINE_DECK_FOLDER, nNodes: 6216, split: "fine-local" },
  { tableName: "triangle /SH3N", folder: TRIANGLE_DECK_FOLDER, nNodes: 1554, split: "triangle-committed" },
];

function vtkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^Ainflate_A\d+\.vtk$/.test(n))
    .sort();
}

interface ThRow {
  t_s: number;
  internal_J: number | null;
  kinetic_J: number | null;
}

function parseThCsv(text: string): ThRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx]!.startsWith("#") && !/[A-Za-z]/.test(lines[headerIdx]!)) {
    headerIdx += 1;
  }
  const headerLine = lines[headerIdx]!.replace(/^#/, "");
  const headers = headerLine.split(/[,;\t]/).map((h) => h.trim().toLowerCase());
  const timeIdx = headers.findIndex((h) => h === "time" || h === "t" || h === "time(s)" || h.includes("time"));
  const ieIdx = headers.findIndex(
    (h) =>
      h === "ie" ||
      h === "internal energy" ||
      h === "ienerg" ||
      h.includes("internal") ||
      h === "int_ener" ||
      h === "iene",
  );
  const keIdx = headers.findIndex(
    (h) => h === "ke" || h === "kinetic energy" || h === "kenerg" || h.includes("kinetic") || h === "kene",
  );
  if (timeIdx < 0) return [];
  const out: ThRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("#")) continue;
    const tok = line.split(/[,;\t]/);
    const t = Number(tok[timeIdx]);
    if (!Number.isFinite(t)) continue;
    const ie = ieIdx >= 0 ? Number(tok[ieIdx]) : NaN;
    const ke = keIdx >= 0 ? Number(tok[keIdx]) : NaN;
    out.push({
      t_s: t,
      internal_J: Number.isFinite(ie) ? ie : null,
      kinetic_J: Number.isFinite(ke) ? ke : null,
    });
  }
  return out;
}

function thAt(rows: readonly ThRow[], t_s: number): ThRow | null {
  if (rows.length === 0) return null;
  return rows[nearestIndex(rows.map((r) => r.t_s), t_s)] ?? null;
}

interface FrameRow {
  requested_ms: number;
  actual_vtk_ms: number | null;
  dt_ms: number | null;
  usable: boolean;
  interpolated: false;
  strainPrimary_J: number | null;
  strainSensitivity_J: number | null;
  strainDiffAbs_J: number | null;
  strainDiffRel: number | null;
  keFromNodes_J: number | null;
  engineInternal_J: number | null;
  engineKinetic_J: number | null;
  engineVsToyRel: number | null;
  medianStretch: number | null;
  maxStretch: number | null;
  volume_mL: number | null;
  velocitiesPresent: boolean;
  note: string;
}

function packTris(tris: readonly (readonly [number, number, number])[]): number[] {
  const out: number[] = [];
  for (const t of tris) out.push(t[0], t[1], t[2]);
  return out;
}

function buildPlan(
  spec: DeckSpec,
  toy: ReturnType<typeof toyDiagonalsFromOrientedQuads>,
  starter: string,
): SplitPlan {
  switch (spec.split) {
    case "mapped-1554":
      return splitPlanFor1554Quads(toy, parseRadiossShellBlock(starter, "/SHELL/1"));
    case "fine-local":
      return splitPlanForFineLocal(parseRadiossShellBlock(starter, "/SHELL/1"));
    case "triangle-committed":
      return splitPlanForCommittedTriangles(toy, parseRadiossShellBlock(starter, "/SH3N/1"));
    default: {
      const _exhaustive: never = spec.split;
      throw new Error(`unhandled split ${String(_exhaustive)}`);
    }
  }
}

function engineWallS(logPath: string): number | null {
  if (!existsSync(logPath)) return null;
  const text = readFileSync(logPath, "utf8");
  const m = text.match(/wall_s=(\d+)/);
  if (m === null) return null;
  return Number(m[1]);
}

export function diagnoseDeckNodeOutput(): {
  missingRuns: boolean;
  md: string;
  payload: Record<string, unknown>;
} {
  const pinRaw: unknown = JSON.parse(
    readFileSync(resolve(DIAG, "opencourant-linux64-pin.json"), "utf8"),
  );
  if (!isRecord(pinRaw)) throw new Error("pin json");
  const zipSha = pinRaw["zipSha256"];
  const zipBytes = pinRaw["zipBytes"];
  const tag = pinRaw["tag"];
  const commit = pinRaw["engineCommit"];
  if (zipSha !== OPENCOURANT_ZIP_SHA256) throw new Error("pin sha drifted");
  if (zipBytes !== OPENCOURANT_ZIP_BYTES) throw new Error("pin size drifted");
  if (tag !== OPENCOURANT_TAG) throw new Error("pin tag drifted");
  if (commit !== OPENCOURANT_ENGINE_COMMIT) throw new Error("pin commit drifted");

  const toyMesh = loadShipMesh("A");
  const toyDiags = toyDiagonalsFromOrientedQuads(toyMesh.quads);
  const rest1554 = toyMesh.coords;

  const runStatus: { name: string; vtk: number; folder: string }[] = [];
  let anyMissing = false;
  for (const spec of DECKS) {
    const n = vtkFiles(resolve(ROOT, spec.folder, "run")).length;
    runStatus.push({ name: spec.tableName, vtk: n, folder: spec.folder });
    if (n === 0) anyMissing = true;
  }

  if (anyMissing) {
    const lines = [
      "# Four-deck node-output re-run — results not yet",
      "",
      "Plan was committed first. Animation frames are not in the run trees yet.",
      `OpenCourant ${OPENCOURANT_TAG} sha256 \`${OPENCOURANT_ZIP_SHA256}\` (${String(OPENCOURANT_ZIP_BYTES)} bytes), engine commit \`${OPENCOURANT_ENGINE_COMMIT}\`.`,
      "",
      ...runStatus.map((r) => `- ${r.name} (\`${r.folder}\`): ${String(r.vtk)} VTK files`),
    ];
    return {
      missingRuns: true,
      md: lines.join("\n"),
      payload: {
        kind: "deck-node-output-measurement",
        status: "plan-committed-results-not-yet-run",
        notAGate: true,
        package: {
          tag: OPENCOURANT_TAG,
          zipSha256: OPENCOURANT_ZIP_SHA256,
          zipBytes: OPENCOURANT_ZIP_BYTES,
          engineCommit: OPENCOURANT_ENGINE_COMMIT,
        },
        vtkCounts: runStatus,
      },
    };
  }

  const model = createInflateAModel();
  const toySolve = solveInflate(model, { maxWallMs: 600_000, continuePastWarn: true, recordPerStepEnergy: true });
  const ledger = toySolve.perStepEnergy;
  if (ledger === undefined) throw new Error("per-step ledger missing");
  const toyTimes = ledger.snapshots.map((s) => s.t);
  const bookkeeping: EnergyFrameInput[] = [];
  const volumeToy: SeriesPoint[] = [];
  const medianToy: SeriesPoint[] = [];
  const maxToy: SeriesPoint[] = [];
  const toyStrain: { t_ms: number; psi_J: number; interpolated: boolean }[] = [];
  for (const t_ms of DECK_NODE_REQUESTED_MS) {
    const idx = nearestIndex(toyTimes, t_ms / 1000);
    const snap = ledger.snapshots[idx];
    const histIdx = nearestIndex(toySolve.history.map((h) => h.t), t_ms / 1000);
    const coords = toySolve.meshHistory[histIdx];
    if (snap === undefined || coords === undefined) throw new Error(`toy hole at ${String(t_ms)} ms`);
    const field = stretchFromTris(
      coords,
      rest1554,
      toyDiags.flatMap((q) => {
        const a: [number, number, number] = [q.nodes[0], q.nodes[1], q.nodes[2]];
        const b: [number, number, number] = [q.nodes[0], q.nodes[2], q.nodes[3]];
        return [a, b];
      }),
    );
    bookkeeping.push({
      t_ms,
      pressureWork_J: snap.pressureWork_J,
      strain_J: snap.strain_J,
      kinetic_J: snap.kinetic_J,
      damping_J: snap.dampingLogged_J,
      interpolated: false,
    });
    toyStrain.push({ t_ms, psi_J: snap.strain_J, interpolated: false });
    volumeToy.push({ t_ms, y: (toySolve.volumeHistory[histIdx] ?? 0) * 1e6 });
    maxToy.push({ t_ms, y: toySolve.lambdaHistory[histIdx] ?? field.max });
    medianToy.push({ t_ms, y: field.median });
  }

  const deckTables: Record<string, FrameRow[]> = {};
  const splitNotes: string[] = [];
  const runTimes: { name: string; wall_s: number | null }[] = [];
  const volumeGold: SeriesPoint[] = [];
  const medianGold: SeriesPoint[] = [];
  const maxGold: SeriesPoint[] = [];
  let goldenStrain8: number | null = null;
  let goldenStrain16: number | null = null;
  let goldenStrain4: number | null = null;
  const deckStrainAt8: number[] = [];
  const deckStrainAt16: number[] = [];

  for (const spec of DECKS) {
    const starter = readFileSync(resolve(ROOT, spec.folder, "Ainflate_0000.rad"), "utf8");
    const plan = buildPlan(spec, toyDiags, starter);
    splitNotes.push(`${spec.tableName}: ${plan.note} (primary tris ${String(plan.primaryTris.length)}, sensitivity tris ${String(plan.sensitivityTris.length)})`);
    const runDir = resolve(ROOT, spec.folder, "run");
    runTimes.push({ name: spec.tableName, wall_s: engineWallS(resolve(runDir, "engine.log")) });
    const names = vtkFiles(runDir);
    const frames: { t: number; coords: Float64Array; vel: Float64Array | null }[] = [];
    let rest: Float64Array | null = null;
    for (const name of names) {
      const vtk = readFileSync(resolve(runDir, name), "utf8");
      const parsed = parseVtkAnimShells(vtk, spec.nNodes);
      const coords = scatterShellToNodeOrder(parsed, spec.nNodes);
      const vel =
        parsed.velocities === null
          ? null
          : scatterVelocitiesToNodeOrder(parsed.nodeIdByPoint, parsed.velocities, spec.nNodes);
      if (rest === null) rest = coords;
      frames.push({ t: parsed.t, coords, vel });
    }
    if (rest === null) throw new Error(`${spec.tableName}: no VTK`);
    const primaryRests = restsFromTris(rest, plan.primaryTris);
    const sensRests = restsFromTris(rest, plan.sensitivityTris);
    const masses = lumpedMassesFromRests(spec.nNodes, primaryRests);
    let th: ThRow[] = [];
    const csvPath = resolve(runDir, "Ainflate_T01.csv");
    if (existsSync(csvPath)) th = parseThCsv(readFileSync(csvPath, "utf8"));
    const rows: FrameRow[] = [];
    for (const t_ms of DECK_NODE_REQUESTED_MS) {
      const want = t_ms / 1000;
      if (spec.split === "triangle-committed" && t_ms > DECK_NODE_TRIANGLE_STOP_MS) {
        rows.push({
          requested_ms: t_ms,
          actual_vtk_ms: null,
          dt_ms: null,
          usable: false,
          interpolated: false,
          strainPrimary_J: null,
          strainSensitivity_J: null,
          strainDiffAbs_J: null,
          strainDiffRel: null,
          keFromNodes_J: null,
          engineInternal_J: null,
          engineKinetic_J: null,
          engineVsToyRel: null,
          medianStretch: null,
          maxStretch: null,
          volume_mL: null,
          velocitiesPresent: false,
          note: "triangle deck died ~11.5 ms; not a late-window reference",
        });
        continue;
      }
      if (frames.length === 0) {
        rows.push({
          requested_ms: t_ms,
          actual_vtk_ms: null,
          dt_ms: null,
          usable: false,
          interpolated: false,
          strainPrimary_J: null,
          strainSensitivity_J: null,
          strainDiffAbs_J: null,
          strainDiffRel: null,
          keFromNodes_J: null,
          engineInternal_J: null,
          engineKinetic_J: null,
          engineVsToyRel: null,
          medianStretch: null,
          maxStretch: null,
          volume_mL: null,
          velocitiesPresent: false,
          note: "no animation frames",
        });
        continue;
      }
      const idx = nearestIndex(frames.map((f) => f.t), want);
      const fr = frames[idx]!;
      const lastT = frames[frames.length - 1]!.t;
      if (want > lastT + 0.0004) {
        rows.push({
          requested_ms: t_ms,
          actual_vtk_ms: fr.t * 1000,
          dt_ms: (fr.t - want) * 1000,
          usable: false,
          interpolated: false,
          strainPrimary_J: null,
          strainSensitivity_J: null,
          strainDiffAbs_J: null,
          strainDiffRel: null,
          keFromNodes_J: null,
          engineInternal_J: null,
          engineKinetic_J: null,
          engineVsToyRel: null,
          medianStretch: null,
          maxStretch: null,
          volume_mL: null,
          velocitiesPresent: fr.vel !== null,
          note: "requested time is after the last real frame; not interpolated",
        });
        continue;
      }
      const psiP = strainEnergyFromRests(fr.coords, primaryRests);
      const psiS = strainEnergyFromRests(fr.coords, sensRests);
      const diff = psiS - psiP;
      const rel = Math.abs(diff) / Math.max(Math.abs(psiP), 1e-30);
      const keNodes = fr.vel === null ? null : kineticEnergyFromVelocities(fr.vel, masses);
      const thRow = thAt(th, want);
      const engineIe = thRow?.internal_J ?? null;
      const engineKe = thRow?.kinetic_J ?? null;
      const engineVsToy =
        engineIe === null ? null : Math.abs(psiP - engineIe) / Math.max(Math.abs(engineIe), Math.abs(psiP), 1e-30);
      const stretch = stretchFromTris(fr.coords, rest, plan.primaryTris);
      const vol = enclosedVolume(fr.coords, [], packTris(plan.primaryTris)) * 1e6;
      rows.push({
        requested_ms: t_ms,
        actual_vtk_ms: fr.t * 1000,
        dt_ms: (fr.t - want) * 1000,
        usable: true,
        interpolated: false,
        strainPrimary_J: psiP,
        strainSensitivity_J: psiS,
        strainDiffAbs_J: diff,
        strainDiffRel: rel,
        keFromNodes_J: keNodes,
        engineInternal_J: engineIe,
        engineKinetic_J: engineKe,
        engineVsToyRel: engineVsToy,
        medianStretch: stretch.median,
        maxStretch: stretch.max,
        volume_mL: vol,
        velocitiesPresent: fr.vel !== null,
        note: "real frame, not interpolated",
      });
    }
    deckTables[spec.tableName] = rows;
    const at = (ms: number): FrameRow | undefined => rows.find((r) => r.requested_ms === ms);
    if (spec.tableName === "golden Belytschko quad") {
      for (const row of rows) {
        if (!row.usable || row.volume_mL === null || row.medianStretch === null || row.maxStretch === null) continue;
        volumeGold.push({ t_ms: row.requested_ms, y: row.volume_mL });
        medianGold.push({ t_ms: row.requested_ms, y: row.medianStretch });
        maxGold.push({ t_ms: row.requested_ms, y: row.maxStretch });
      }
      goldenStrain4 = at(4)?.strainPrimary_J ?? null;
      goldenStrain8 = at(8)?.strainPrimary_J ?? null;
      goldenStrain16 = at(16)?.strainPrimary_J ?? null;
    }
    const s8 = at(8);
    const s16 = at(16);
    if (s8?.usable === true && s8.strainPrimary_J !== null) deckStrainAt8.push(s8.strainPrimary_J);
    if (s16?.usable === true && s16.strainPrimary_J !== null) deckStrainAt16.push(s16.strainPrimary_J);
  }

  const score = scoreStretchDiagnostics({
    bookkeeping,
    toyStrain,
    goldenStrain: {
      at8_J: goldenStrain8,
      at16_J: goldenStrain16,
      at4_J: goldenStrain4,
      fromToyFunctionOnNodePositions: goldenStrain8 !== null && goldenStrain16 !== null,
      note: "toy cstSample on golden node positions, primary i0–i2 split",
    },
    deckStrainAt8,
    deckStrainAt16,
    volumeToy,
    volumeGold,
    medianToy,
    medianGold,
    maxToy,
    maxGold,
  });

  const md: string[] = [
    "# Four-deck node-output re-run (measurement, not a gate)",
    "",
    `The golden’s engine commit \`${OPENCOURANT_ENGINE_COMMIT}\``,
    "is pinned only to the OpenCourant copy, not the original OpenRadioss",
    "tree. Plan was committed first in `deck-node-output-prediction.md`",
    "and was not changed after this run.",
    "",
    "## Package",
    "",
    `- OpenCourant linux64 tag \`${OPENCOURANT_TAG}\``,
    `- zip sha256 \`${OPENCOURANT_ZIP_SHA256}\``,
    `- zip bytes ${String(OPENCOURANT_ZIP_BYTES)}`,
    `- engine commit \`${OPENCOURANT_ENGINE_COMMIT}\``,
    "",
    "## Quad split (locked before the run)",
    "",
    ...splitNotes.map((n) => `- ${n}`),
    "",
    "Sensitivity is the other diagonal. It decides nothing.",
    "",
    "## Derived table",
    "",
    "Each row is a **real** animation frame (nearest VTK TIME to the requested",
    "time). Node coordinates are not interpolated. 10, 12 and 14 ms are real.",
    "Deciding rows stay 4, 8 and 16 ms.",
    "",
  ];

  for (const spec of DECKS) {
    const rows = deckTables[spec.tableName];
    if (rows === undefined) continue;
    md.push(`### ${spec.tableName}`, "");
    md.push(
      "requested ms | actual VTK ms | toy-function strain (J, primary) | sensitivity strain (J) | |Δ| (J) | |Δ| rel | node kinetic (J) | engine internal (J) | engine kinetic (J) | engine vs toy-function rel | median stretch | max stretch | volume (mL) | velocities | note",
    );
    for (const row of rows) {
      md.push(
        `${String(row.requested_ms)} | ${fmt(row.actual_vtk_ms, 4)} | ${fmt(row.strainPrimary_J)} | ${fmt(row.strainSensitivity_J)} | ${fmt(row.strainDiffAbs_J)} | ${pct(row.strainDiffRel)} | ${fmt(row.keFromNodes_J)} | ${fmt(row.engineInternal_J)} | ${fmt(row.engineKinetic_J)} | ${pct(row.engineVsToyRel)} | ${fmt(row.medianStretch, 6)} | ${fmt(row.maxStretch, 6)} | ${fmt(row.volume_mL, 3)} | ${row.velocitiesPresent ? "yes" : "no"} | ${row.note}`,
      );
    }
    md.push("");
  }

  md.push("## Engine-versus-toy-function energy gap (convention, not toy evidence)", "");
  for (const spec of DECKS) {
    const rows = deckTables[spec.tableName];
    if (rows === undefined) continue;
    const used = rows.filter((r) => r.usable && r.engineVsToyRel !== null);
    if (used.length === 0) {
      md.push(`- ${spec.tableName}: engine internal energy not readable, or no usable frames.`);
      continue;
    }
    let worst = used[0]!;
    for (const r of used) {
      if ((r.engineVsToyRel ?? 0) > (worst.engineVsToyRel ?? 0)) worst = r;
    }
    md.push(
      `- ${spec.tableName}: worst |engine internal − toy-function strain| / denom = ${pct(worst.engineVsToyRel)} at requested ${String(worst.requested_ms)} ms. If they disagree, that is a convention difference in how the decks account for energy, not evidence about the toy.`,
    );
  }
  md.push("");

  md.push("## Quad-split sensitivity (other diagonal; decides nothing)", "");
  for (const spec of DECKS) {
    const rows = deckTables[spec.tableName];
    if (rows === undefined) continue;
    const used = rows.filter((r) => r.usable && r.strainDiffRel !== null);
    if (used.length === 0) {
      md.push(`- ${spec.tableName}: sensitivity not computed.`);
      continue;
    }
    let worst = used[0]!;
    for (const r of used) {
      if ((r.strainDiffRel ?? 0) > (worst.strainDiffRel ?? 0)) worst = r;
    }
    md.push(
      `- ${spec.tableName}: largest |primary − other diagonal| / primary = ${pct(worst.strainDiffRel)} (${fmt(worst.strainDiffAbs_J)} J) at requested ${String(worst.requested_ms)} ms.`,
    );
  }
  md.push("");

  md.push("## Run times", "");
  for (const r of runTimes) {
    md.push(`- ${r.name}: ${r.wall_s === null ? "wall time not in engine.log" : `${String(r.wall_s)} s`}`);
  }
  md.push("");

  md.push("## Locked Chiron/Themis score (per-step energy gate already closed under 3%)", "");
  md.push(`Bookkeeping worst relative (this toy re-solve, per-step): ${pct(score.bookkeepingWorstRel)} (bar ${pct(BOOKKEEPING_REL)}).`);
  md.push(
    `Energy at 4 ms: toy ${fmt(score.energyAt4.toy)} J vs golden ${fmt(score.energyAt4.golden)} J (rel ${pct(score.energyAt4.rel)}).`,
  );
  md.push(
    `Energy at 8 ms: toy ${fmt(score.energyAt8.toy)} J vs golden ${fmt(score.energyAt8.golden)} J (rel ${pct(score.energyAt8.rel)}).`,
  );
  md.push(
    `Energy at 16 ms: toy ${fmt(score.energyAt16.toy)} J vs golden ${fmt(score.energyAt16.golden)} J (rel ${pct(score.energyAt16.rel)}).`,
  );
  md.push(
    `Median strain at 8 ms: toy ${fmt(score.medianStrainAt8.toy)} vs golden ${fmt(score.medianStrainAt8.golden)} (rel ${pct(score.medianStrainAt8.rel)}).`,
  );
  md.push(
    `Median strain at 16 ms: toy ${fmt(score.medianStrainAt16.toy)} vs golden ${fmt(score.medianStrainAt16.golden)} (rel ${pct(score.medianStrainAt16.rel)}).`,
  );
  md.push(
    `Shifts (ms, diagnostic only, never applied): volume ${fmt(score.shift.volume_ms, 3)}, median stretch ${fmt(score.shift.median_ms, 3)}, maximum stretch ${fmt(score.shift.max_ms, 3)}. ${score.shift.note}`,
  );
  md.push(
    `Booleans: energy-agrees=${String(score.energyAgrees)} energy-low=${String(score.energyLow)} one-shift-fits=${String(score.oneShiftFits)} median-agrees=${String(score.medianAgrees)} energy-comparable=${String(score.energyComparable)} bookkeeping-ok=${String(score.bookkeepingOk)}`,
  );
  md.push("");
  md.push(score.verdictLine);

  const pageBody = md.slice(md.indexOf("## Derived table")).join("\n");
  const payload: Record<string, unknown> = {
    kind: "deck-node-output-measurement",
    status: "run",
    notAGate: true,
    package: {
      tag: OPENCOURANT_TAG,
      zipSha256: OPENCOURANT_ZIP_SHA256,
      zipBytes: OPENCOURANT_ZIP_BYTES,
      engineCommit: OPENCOURANT_ENGINE_COMMIT,
    },
    splitNotes,
    runTimes,
    decks: deckTables,
    score,
    verdictLine: score.verdictLine,
    pageBody,
    bookkeepingWorstRel: score.bookkeepingWorstRel,
  };
  return { missingRuns: false, md: md.join("\n"), payload };
}

function main(): void {
  const out = diagnoseDeckNodeOutput();
  if (out.missingRuns) {
    console.log(out.md);
    console.log("Run scripts/run-deck-node-output.sh first. Not writing a results table.");
    return;
  }
  writeFileSync(resolve(DIAG, "deck-node-output-results.md"), `${out.md}\n`);
  writeFileSync(resolve(DIAG, "deck-node-output-results.json"), `${JSON.stringify(out.payload, null, 2)}\n`);
  writeFileSync(
    resolve(ROOT, "src/oracle/deck-node-output-results.json"),
    `${JSON.stringify(
      {
        kind: "deck-node-output-measurement",
        status: "run",
        notAGate: true,
        package: out.payload["package"],
        verdictLine: out.payload["verdictLine"],
        pageBody: out.payload["pageBody"],
      },
      null,
      2,
    )}\n`,
  );
  console.log(out.md);
}

main();
