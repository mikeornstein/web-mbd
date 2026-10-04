/**
 * Quad-averaged stretch and node-distance measurement. Not a gate.
 * Plan is locked in deck-quad-averaged-prediction.md (committed first).
 * Do not change that file after seeing numbers.
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
  DECK_NODE_TRIANGLE_STOP_MS,
} from "../oracle/deckNodeOutputRules.js";
import {
  parseRadiossShellBlock,
  restsFromTris,
  splitPlanFor1554Quads,
  splitPlanForCommittedTriangles,
  splitPlanForFineLocal,
  strainEnergyFromRests,
  toyDiagonalsFromOrientedQuads,
} from "../oracle/deckNodeEnergy.js";
import {
  QUAD_AVG_REQUESTED_MS,
  RULE_A_CONVENTION_COLUMN,
} from "../oracle/deckQuadAveragedRules.js";
import { scoreQuadAveraged } from "../oracle/deckQuadAveragedScore.js";
import { nodePairDistance, ratio } from "../oracle/nodePairDistance.js";
import { quadAvgStatsFromRests, restsFromPackedQuads } from "../oracle/quadAveragedStretch.js";
import { lerpCoords } from "../oracle/stretchField.js";
import { type SeriesPoint } from "../oracle/stretchDiagnosticRules.js";
import { parseVtkAnimShells, scatterShellToNodeOrder } from "../oracle/vtkAnim.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const PARENT_NODES = 1554;

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

function vtkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^Ainflate_A\d+\.vtk$/.test(n))
    .sort();
}

interface ThRow {
  t_s: number;
  internal_J: number | null;
}

function parseThCsv(text: string): ThRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx]!.startsWith("#") && !/[A-Za-z]/.test(lines[headerIdx]!)) {
    headerIdx += 1;
  }
  const headerLine = lines[headerIdx]!.replace(/^#/, "");
  const headers = headerLine.split(/[,;\t]/).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const timeIdx = headers.findIndex((h) => h === "time" || h === "t" || h.includes("time"));
  const ieIdx = headers.findIndex((h) => h === "internal energy" || h.includes("internal"));
  if (timeIdx < 0) return [];
  const out: ThRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("#")) continue;
    const tok = line.split(/[,;\t]/);
    const t = Number(tok[timeIdx]);
    if (!Number.isFinite(t)) continue;
    const ie = ieIdx >= 0 ? Number(tok[ieIdx]) : NaN;
    out.push({ t_s: t, internal_J: Number.isFinite(ie) ? ie : null });
  }
  return out;
}

function thAt(rows: readonly ThRow[], t_s: number): number | null {
  if (rows.length === 0) return null;
  return rows[nearestIndex(rows.map((r) => r.t_s), t_s)]?.internal_J ?? null;
}

function toyCoordsAt(times: readonly number[], meshes: readonly Float64Array[], t: number): Float64Array {
  if (times.length === 0 || meshes[0] === undefined) throw new Error("toy history empty");
  if (t <= times[0]!) return Float64Array.from(meshes[0]);
  const lastT = times[times.length - 1]!;
  const lastM = meshes[meshes.length - 1];
  if (lastM === undefined) throw new Error("toy history hole");
  if (t >= lastT) return Float64Array.from(lastM);
  let lo = 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i]! >= t) {
      lo = i - 1;
      break;
    }
  }
  const hi = lo + 1;
  const a = meshes[lo];
  const b = meshes[hi];
  const t0 = times[lo]!;
  const t1 = times[hi]!;
  if (a === undefined || b === undefined) throw new Error("toy history hole");
  return lerpCoords(a, b, t0, t1, t);
}

interface DeckSpec {
  key: "golden" | "ishell" | "fine" | "triangle";
  tableName: string;
  folder: string;
  nNodes: number;
  split: "mapped-1554" | "fine-local" | "triangle-committed";
}

const DECKS: readonly DeckSpec[] = [
  { key: "golden", tableName: "golden Belytschko quad", folder: GOLDEN_DECK_FOLDER, nNodes: 1554, split: "mapped-1554" },
  { key: "ishell", tableName: "Ishell 24 ismstr 2", folder: ISHELL24_DECK_FOLDER, nNodes: 1554, split: "mapped-1554" },
  { key: "fine", tableName: "fine re-oriented", folder: FINE_DECK_FOLDER, nNodes: 6216, split: "fine-local" },
  { key: "triangle", tableName: "triangle /SH3N", folder: TRIANGLE_DECK_FOLDER, nNodes: 1554, split: "triangle-committed" },
];

interface FramePack {
  t: number;
  coords: Float64Array;
  parentCoords: Float64Array;
}

function parentSlice(coords: Float64Array, nNodes: number): Float64Array {
  if (nNodes === PARENT_NODES) return coords;
  const out = new Float64Array(PARENT_NODES * 3);
  out.set(coords.subarray(0, PARENT_NODES * 3));
  return out;
}

export function diagnoseDeckQuadAveraged(): {
  missingRuns: boolean;
  md: string;
  payload: Record<string, unknown>;
} {
  const pinRaw: unknown = JSON.parse(readFileSync(resolve(DIAG, "opencourant-linux64-pin.json"), "utf8"));
  if (!isRecord(pinRaw)) throw new Error("pin json");
  if (pinRaw["zipSha256"] !== OPENCOURANT_ZIP_SHA256) throw new Error("pin sha drifted");
  if (pinRaw["zipBytes"] !== OPENCOURANT_ZIP_BYTES) throw new Error("pin size drifted");
  if (pinRaw["tag"] !== OPENCOURANT_TAG) throw new Error("pin tag drifted");
  if (pinRaw["engineCommit"] !== OPENCOURANT_ENGINE_COMMIT) throw new Error("pin commit drifted");

  const toyMesh = loadShipMesh("A");
  const toyDiags = toyDiagonalsFromOrientedQuads(toyMesh.quads);
  const toyPacked = toyMesh.quads;
  const toyAvgRests = restsFromPackedQuads(toyMesh.coords, toyPacked);
  const toyPrimaryRests = restsFromTris(
    toyMesh.coords,
    toyDiags.flatMap((q) => [
      [q.nodes[0], q.nodes[1], q.nodes[2]] as const,
      [q.nodes[0], q.nodes[2], q.nodes[3]] as const,
    ]),
  );

  const runStatus: { name: string; vtk: number; folder: string }[] = [];
  let anyMissing = false;
  for (const spec of DECKS) {
    const n = vtkFiles(resolve(ROOT, spec.folder, "run")).length;
    runStatus.push({ name: spec.tableName, vtk: n, folder: spec.folder });
    if (n === 0) anyMissing = true;
  }
  if (anyMissing) {
    const lines = [
      "# Quad-averaged stretch and node-distance — results not yet",
      "",
      "Plan was committed first. Animation frames are not in the run trees yet.",
      "Engine internal energy is the primary energy column.",
      `OpenCourant ${OPENCOURANT_TAG} sha256 \`${OPENCOURANT_ZIP_SHA256}\`.`,
      "",
      ...runStatus.map((r) => `- ${r.name} (\`${r.folder}\`): ${String(r.vtk)} VTK files`),
    ];
    return {
      missingRuns: true,
      md: lines.join("\n"),
      payload: {
        kind: "deck-quad-averaged-measurement",
        status: "plan-committed-results-not-yet-run",
        notAGate: true,
        engineColumnPrimary: true,
      },
    };
  }

  const model = createInflateAModel();
  const toySolve = solveInflate(model, { maxWallMs: 600_000, continuePastWarn: true });
  const toyTimes = toySolve.history.map((h) => h.t);

  const deckFrames: Record<string, FramePack[]> = {};
  const deckEngine: Record<string, ThRow[]> = {};
  const deckAvgRests: Record<string, ReturnType<typeof restsFromPackedQuads>> = {};
  const deckToyFnRests: Record<string, ReturnType<typeof restsFromTris>> = {};

  for (const spec of DECKS) {
    const starter = readFileSync(resolve(ROOT, spec.folder, "Ainflate_0000.rad"), "utf8");
    const runDir = resolve(ROOT, spec.folder, "run");
    const names = vtkFiles(runDir);
    const frames: FramePack[] = [];
    let rest: Float64Array | null = null;
    for (const name of names) {
      const parsed = parseVtkAnimShells(readFileSync(resolve(runDir, name), "utf8"), spec.nNodes);
      const coords = scatterShellToNodeOrder(parsed, spec.nNodes);
      if (rest === null) rest = coords;
      frames.push({ t: parsed.t, coords, parentCoords: parentSlice(coords, spec.nNodes) });
    }
    if (rest === null) throw new Error(`${spec.tableName}: no VTK`);
    deckFrames[spec.key] = frames;
    let th: ThRow[] = [];
    for (const csvName of ["AinflateT01.csv", "Ainflate_T01.csv"]) {
      const p = resolve(runDir, csvName);
      if (!existsSync(p)) continue;
      const parsed = parseThCsv(readFileSync(p, "utf8"));
      if (parsed.length > 0) {
        th = parsed;
        break;
      }
    }
    deckEngine[spec.key] = th;
    switch (spec.split) {
      case "mapped-1554": {
        const plan = splitPlanFor1554Quads(toyDiags, parseRadiossShellBlock(starter, "/SHELL/1"));
        deckAvgRests[spec.key] = toyAvgRests;
        deckToyFnRests[spec.key] = restsFromTris(rest, plan.primaryTris);
        break;
      }
      case "triangle-committed": {
        const plan = splitPlanForCommittedTriangles(toyDiags, parseRadiossShellBlock(starter, "/SH3N/1"));
        deckAvgRests[spec.key] = toyAvgRests;
        deckToyFnRests[spec.key] = restsFromTris(rest, plan.primaryTris);
        break;
      }
      case "fine-local": {
        const plan = splitPlanForFineLocal(parseRadiossShellBlock(starter, "/SHELL/1"));
        const packed: number[] = [];
        for (const shell of parseRadiossShellBlock(starter, "/SHELL/1")) {
          packed.push(shell.nodes[0]! - 1, shell.nodes[1]! - 1, shell.nodes[2]! - 1, shell.nodes[3]! - 1);
        }
        deckAvgRests[spec.key] = restsFromPackedQuads(rest, packed);
        deckToyFnRests[spec.key] = restsFromTris(rest, plan.primaryTris);
        break;
      }
      default: {
        const _exhaustive: never = spec.split;
        throw new Error(`unhandled ${String(_exhaustive)}`);
      }
    }
  }

  const goldenFrames = deckFrames["golden"];
  const ishellFrames = deckFrames["ishell"];
  const fineFrames = deckFrames["fine"];
  const triFrames = deckFrames["triangle"];
  if (
    goldenFrames === undefined ||
    ishellFrames === undefined ||
    fineFrames === undefined ||
    triFrames === undefined
  ) {
    throw new Error("missing deck frames");
  }

  interface EnergyRow {
    requested_ms: number;
    actual_vtk_ms: number | null;
    engine_J: number | null;
    toyFnOnDeck_J: number | null;
    note: string;
  }
  interface DistRow {
    requested_ms: number;
    actual_vtk_ms: number | null;
    goldIshellRms: number | null;
    goldIshellP95: number | null;
    toyGoldRms: number | null;
    toyGoldP95: number | null;
    toyIshellRms: number | null;
    toyIshellP95: number | null;
    toyFineRms: number | null;
    toyFineP95: number | null;
    rmsRatio: number | null;
    p95Ratio: number | null;
    note: string;
  }
  interface StretchRow {
    requested_ms: number;
    actual_vtk_ms: number | null;
    median: number | null;
    p95: number | null;
    max: number | null;
    n: number | null;
    note: string;
  }

  const energyTables: Record<string, EnergyRow[]> = {};
  const stretchTables: Record<string, StretchRow[]> = {};
  const distRows: DistRow[] = [];
  const volumeToy: SeriesPoint[] = [];
  const volumeGold: SeriesPoint[] = [];
  const medianToy: SeriesPoint[] = [];
  const medianGold: SeriesPoint[] = [];
  const maxToy: SeriesPoint[] = [];
  const maxGold: SeriesPoint[] = [];
  let ishellMedian8: number | null = null;
  let ishellMedian16: number | null = null;
  let toyStrain4: number | null = null;
  let toyStrain8: number | null = null;
  let toyStrain16: number | null = null;
  let toyGoldRms4: number | null = null;
  let toyGoldRms8: number | null = null;
  let toyGoldRms16: number | null = null;
  let goldIshellRms4: number | null = null;
  let goldIshellRms8: number | null = null;
  let goldIshellRms16: number | null = null;
  const deckEngineAt8: number[] = [];
  const deckEngineAt16: number[] = [];

  for (const spec of DECKS) {
    energyTables[spec.key] = [];
    stretchTables[spec.key] = [];
  }

  for (const t_ms of QUAD_AVG_REQUESTED_MS) {
    const want = t_ms / 1000;
    const gIdx = nearestIndex(goldenFrames.map((f) => f.t), want);
    const g = goldenFrames[gIdx]!;
    const iIdx = nearestIndex(ishellFrames.map((f) => f.t), want);
    const iFr = ishellFrames[iIdx]!;
    const fIdx = nearestIndex(fineFrames.map((f) => f.t), want);
    const fFr = fineFrames[fIdx]!;
    const triangleDead = t_ms > DECK_NODE_TRIANGLE_STOP_MS;
    const toyAtG = toyCoordsAt(toyTimes, toySolve.meshHistory, g.t);
    const toyPsi = strainEnergyFromRests(toyAtG, toyPrimaryRests);
    const toyVol = enclosedVolume(toyAtG, toyMesh.quads, []) * 1e6;
    const toyAvg = quadAvgStatsFromRests(toyAtG, toyAvgRests);
    if (toyAvg === null) throw new Error("toy quad-avg empty");
    volumeToy.push({ t_ms, y: toyVol });
    medianToy.push({ t_ms, y: toyAvg.median });
    maxToy.push({ t_ms, y: toyAvg.max });
    if (t_ms === 4) toyStrain4 = toyPsi;
    if (t_ms === 8) toyStrain8 = toyPsi;
    if (t_ms === 16) toyStrain16 = toyPsi;

    const gi = nodePairDistance(g.parentCoords, iFr.parentCoords, PARENT_NODES);
    const tg = nodePairDistance(toyAtG, g.parentCoords, PARENT_NODES);
    const ti = nodePairDistance(toyAtG, iFr.parentCoords, PARENT_NODES);
    const tf = nodePairDistance(toyAtG, fFr.parentCoords, PARENT_NODES);
    distRows.push({
      requested_ms: t_ms,
      actual_vtk_ms: g.t * 1000,
      goldIshellRms: gi.rms,
      goldIshellP95: gi.p95,
      toyGoldRms: tg.rms,
      toyGoldP95: tg.p95,
      toyIshellRms: ti.rms,
      toyIshellP95: ti.p95,
      toyFineRms: tf.rms,
      toyFineP95: tf.p95,
      rmsRatio: ratio(tg.rms, gi.rms),
      p95Ratio: ratio(tg.p95, gi.p95),
      note: "real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554",
    });
    if (t_ms === 4) {
      toyGoldRms4 = tg.rms;
      goldIshellRms4 = gi.rms;
    }
    if (t_ms === 8) {
      toyGoldRms8 = tg.rms;
      goldIshellRms8 = gi.rms;
    }
    if (t_ms === 16) {
      toyGoldRms16 = tg.rms;
      goldIshellRms16 = gi.rms;
    }

    for (const spec of DECKS) {
      const frames = deckFrames[spec.key];
      const energyRows = energyTables[spec.key];
      const stretchRows = stretchTables[spec.key];
      const avgRests = deckAvgRests[spec.key];
      const fnRests = deckToyFnRests[spec.key];
      const th = deckEngine[spec.key];
      if (
        frames === undefined ||
        energyRows === undefined ||
        stretchRows === undefined ||
        avgRests === undefined ||
        fnRests === undefined ||
        th === undefined
      ) {
        throw new Error(`deck pack missing ${spec.key}`);
      }
      if (spec.key === "triangle" && triangleDead) {
        energyRows.push({
          requested_ms: t_ms,
          actual_vtk_ms: null,
          engine_J: null,
          toyFnOnDeck_J: null,
          note: "triangle deck died ~11.5 ms; not a late-window reference",
        });
        stretchRows.push({
          requested_ms: t_ms,
          actual_vtk_ms: null,
          median: null,
          p95: null,
          max: null,
          n: null,
          note: "triangle deck died ~11.5 ms; not a late-window reference",
        });
        continue;
      }
      const fr = frames[nearestIndex(frames.map((x) => x.t), want)]!;
      const engine = thAt(th, fr.t);
      const toyFn = strainEnergyFromRests(fr.coords, fnRests);
      energyRows.push({
        requested_ms: t_ms,
        actual_vtk_ms: fr.t * 1000,
        engine_J: engine,
        toyFnOnDeck_J: toyFn,
        note: `${RULE_A_CONVENTION_COLUMN}; engine column is primary`,
      });
      const avg = quadAvgStatsFromRests(fr.coords, avgRests);
      stretchRows.push({
        requested_ms: t_ms,
        actual_vtk_ms: fr.t * 1000,
        median: avg?.median ?? null,
        p95: avg?.p95 ?? null,
        max: avg?.max ?? null,
        n: avg?.n ?? null,
        note: "quad-centre stretch from four corners; real frame",
      });
      if (spec.key === "golden" && avg !== null) {
        const gVol = enclosedVolume(fr.parentCoords, toyMesh.quads, []) * 1e6;
        volumeGold.push({ t_ms, y: gVol });
        medianGold.push({ t_ms, y: avg.median });
        maxGold.push({ t_ms, y: avg.max });
      }
      if (spec.key === "ishell" && avg !== null) {
        if (t_ms === 8) ishellMedian8 = avg.median;
        if (t_ms === 16) ishellMedian16 = avg.median;
      }
      if (t_ms === 8 && engine !== null) deckEngineAt8.push(engine);
      if (t_ms === 16 && engine !== null) deckEngineAt16.push(engine);
    }
  }

  const goldenEnergy = energyTables["golden"] ?? [];
  const atE = (ms: number): EnergyRow | undefined => goldenEnergy.find((r) => r.requested_ms === ms);
  const score = scoreQuadAveraged({
    toyStrain4,
    toyStrain8,
    toyStrain16,
    goldenEngine4: atE(4)?.engine_J ?? null,
    goldenEngine8: atE(8)?.engine_J ?? null,
    goldenEngine16: atE(16)?.engine_J ?? null,
    deckEngineAt8,
    deckEngineAt16,
    volumeToy,
    volumeGold,
    medianToy,
    medianGold,
    maxToy,
    maxGold,
    ishellMedian8,
    ishellMedian16,
    toyGoldRms4,
    toyGoldRms8,
    toyGoldRms16,
    goldIshellRms4,
    goldIshellRms8,
    goldIshellRms16,
  });

  const md: string[] = [
    "# Quad-averaged stretch and node-distance (measurement, not a gate)",
    "",
    "Plan was committed first in `deck-quad-averaged-prediction.md` and was not",
    "changed after this run. Engine internal energy is the **primary** energy",
    "column. Toy-function energy on deck nodes is a convention difference, not",
    "evidence about the toy. No bar was widened. No time shift was applied.",
    "",
    `OpenCourant ${OPENCOURANT_TAG} sha256 \`${OPENCOURANT_ZIP_SHA256}\`, engine commit \`${OPENCOURANT_ENGINE_COMMIT}\`.`,
    "",
    "## Table A — engine energy (primary) vs toy-function on nodes (convention)",
    "",
  ];

  for (const spec of DECKS) {
    const rows = energyTables[spec.key] ?? [];
    md.push(`### ${spec.tableName}`);
    md.push("");
    md.push(
      `requested ms | actual VTK ms | engine internal (J, **primary**) | toy-function on nodes (J, ${RULE_A_CONVENTION_COLUMN}) | note`,
    );
    for (const r of rows) {
      md.push(
        `${String(r.requested_ms)} | ${fmt(r.actual_vtk_ms, 4)} | ${fmt(r.engine_J)} | ${fmt(r.toyFnOnDeck_J)} | ${r.note}`,
      );
    }
    md.push("");
  }

  md.push("Toy own strain energy (this solve, interpolated to the golden VTK TIME):");
  md.push(`4 ms ${fmt(toyStrain4)} J; 8 ms ${fmt(toyStrain8)} J; 16 ms ${fmt(toyStrain16)} J.`);
  md.push("");
  md.push("## Table B — node-to-node distance (no strain formula)");
  md.push("");
  md.push(
    "requested ms | actual VTK ms | golden–Ishell RMS (m) | golden–Ishell p95 (m) | toy–golden RMS (m) | toy–golden p95 (m) | toy–Ishell RMS (m) | toy–fine parent RMS (m) | RMS ratio toy–golden / golden–Ishell | p95 ratio | note",
  );
  for (const r of distRows) {
    const reportOnly = r.requested_ms === 2 || r.requested_ms === 6 ? " report only, decides nothing" : "";
    const deciding = r.requested_ms === 4 || r.requested_ms === 8 || r.requested_ms === 16 ? " bar frame (factor 1.0)" : "";
    md.push(
      `${String(r.requested_ms)} | ${fmt(r.actual_vtk_ms, 4)} | ${fmt(r.goldIshellRms, 8)} | ${fmt(r.goldIshellP95, 8)} | ${fmt(r.toyGoldRms, 8)} | ${fmt(r.toyGoldP95, 8)} | ${fmt(r.toyIshellRms, 8)} | ${fmt(r.toyFineRms, 8)} | ${fmt(r.rmsRatio, 4)} | ${fmt(r.p95Ratio, 4)} | ${r.note}${deciding}${reportOnly}`,
    );
  }
  md.push("");
  md.push("## Table C — quad-averaged stretch (four-corner centre, larger principal)");
  md.push("");
  md.push("Toy (this solve, interpolated to golden VTK TIME):");
  md.push("requested ms | median | p95 | max");
  for (const t_ms of QUAD_AVG_REQUESTED_MS) {
    const med = medianToy.find((p) => p.t_ms === t_ms);
    const mx = maxToy.find((p) => p.t_ms === t_ms);
    const toyAt = toyCoordsAt(toyTimes, toySolve.meshHistory, (goldenFrames[nearestIndex(goldenFrames.map((f) => f.t), t_ms / 1000)]!.t));
    const st = quadAvgStatsFromRests(toyAt, toyAvgRests);
    md.push(`${String(t_ms)} | ${fmt(med?.y ?? null)} | ${fmt(st?.p95 ?? null)} | ${fmt(mx?.y ?? null)}`);
  }
  md.push("");
  for (const spec of DECKS) {
    const rows = stretchTables[spec.key] ?? [];
    md.push(`### ${spec.tableName}`);
    md.push("");
    md.push("requested ms | actual VTK ms | median | p95 | max | n quads | note");
    for (const r of rows) {
      md.push(
        `${String(r.requested_ms)} | ${fmt(r.actual_vtk_ms, 4)} | ${fmt(r.median)} | ${fmt(r.p95)} | ${fmt(r.max)} | ${r.n === null ? "n/a" : String(r.n)} | ${r.note}`,
      );
    }
    md.push("");
  }

  md.push("## Bars");
  md.push("");
  md.push(
    `Rule A energy (engine column): 8 ms toy ${fmt(score.energyAt8.toy)} vs golden engine ${fmt(score.energyAt8.goldenEngine)} (rel ${pct(score.energyAt8.rel)}); 16 ms toy ${fmt(score.energyAt16.toy)} vs golden engine ${fmt(score.energyAt16.goldenEngine)} (rel ${pct(score.energyAt16.rel)}); 4 ms reported toy ${fmt(score.energyAt4.toy)} vs golden engine ${fmt(score.energyAt4.goldenEngine)} (rel ${pct(score.energyAt4.rel)}). energy-agrees=${String(score.energyAgrees)} energy-low=${String(score.energyLow)}.`,
  );
  md.push(
    `Rule B distance (factor 1.0 at 4, 8, 16 ms): 4 ms ratio ${fmt(score.distanceAt4.ratio, 4)} holds=${String(score.distanceAt4.holds)}; 8 ms ratio ${fmt(score.distanceAt8.ratio, 4)} holds=${String(score.distanceAt8.holds)}; 16 ms ratio ${fmt(score.distanceAt16.ratio, 4)} holds=${String(score.distanceAt16.holds)}. distance-bar-holds=${String(score.distanceBarHolds)}. 2 ms and 6 ms ratios are a report that decides nothing.`,
  );
  md.push(
    `Rule C median strain: 8 ms toy ${fmt(score.medianStrainAt8.toy)} vs golden ${fmt(score.medianStrainAt8.golden)} (rel ${pct(score.medianStrainAt8.relToGolden)}, bar ${fmt(score.medianStrainAt8.bar)}, Ishell ${fmt(score.medianStrainAt8.ishell)}); 16 ms toy ${fmt(score.medianStrainAt16.toy)} vs golden ${fmt(score.medianStrainAt16.golden)} (rel ${pct(score.medianStrainAt16.relToGolden)}, bar ${fmt(score.medianStrainAt16.bar)}, Ishell ${fmt(score.medianStrainAt16.ishell)}). median-agrees=${String(score.medianAgrees)}.`,
  );
  md.push(
    `Rule C shifts (ms, diagnostic only, never applied): volume ${fmt(score.shift.volume_ms, 3)}, median ${fmt(score.shift.median_ms, 3)}, maximum ${fmt(score.shift.max_ms, 3)}. ${score.shift.note} one-shift-fits=${String(score.oneShiftFits)}.`,
  );
  md.push("");
  md.push("## Verdict");
  md.push("");
  md.push(`Locked table: ${score.lockedLine}`);
  md.push(`Rule C outcome: ${score.ruleCLine}`);

  const pageBody = [
    "Engine internal energy is the primary energy column.",
    `energy-agrees=${String(score.energyAgrees)} energy-low=${String(score.energyLow)} median-agrees=${String(score.medianAgrees)} one-shift-fits=${String(score.oneShiftFits)} distance-bar-holds=${String(score.distanceBarHolds)}`,
    `Locked table: ${score.lockedLine}`,
    `Rule C outcome: ${score.ruleCLine}`,
  ].join("\n");

  return {
    missingRuns: false,
    md: md.join("\n"),
    payload: {
      kind: "deck-quad-averaged-measurement",
      status: "run",
      notAGate: true,
      engineColumnPrimary: true,
      package: {
        tag: OPENCOURANT_TAG,
        zipSha256: OPENCOURANT_ZIP_SHA256,
        zipBytes: OPENCOURANT_ZIP_BYTES,
        engineCommit: OPENCOURANT_ENGINE_COMMIT,
      },
      score,
      energyTables,
      distRows,
      stretchTables,
      verdictLine: score.lockedLine,
      ruleCLine: score.ruleCLine,
      pageBody,
    },
  };
}

function main(): void {
  const out = diagnoseDeckQuadAveraged();
  if (out.missingRuns) {
    console.log(out.md);
    console.log("Animation frames missing. Not writing a results table.");
    return;
  }
  writeFileSync(resolve(DIAG, "deck-quad-averaged-results.md"), `${out.md}\n`);
  writeFileSync(resolve(DIAG, "deck-quad-averaged-results.json"), `${JSON.stringify(out.payload, null, 2)}\n`);
  writeFileSync(
    resolve(ROOT, "src/oracle/deck-quad-averaged-results.json"),
    `${JSON.stringify(
      {
        kind: "deck-quad-averaged-measurement",
        status: "run",
        notAGate: true,
        engineColumnPrimary: true,
        verdictLine: out.payload["verdictLine"],
        ruleCLine: out.payload["ruleCLine"],
        pageBody: out.payload["pageBody"],
      },
      null,
      2,
    )}\n`,
  );
  console.log(out.md);
}

main();
