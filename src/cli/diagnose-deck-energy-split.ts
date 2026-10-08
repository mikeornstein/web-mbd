/**
 * Energy and damping split. Measurement, not a gate.
 * Plan is locked in deck-energy-split-prediction.md (committed first).
 * Do not change that file after seeing numbers. Do not add a verdict row.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
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
  ENERGY_SPLIT_COL_CONTACT_DAMP,
  ENERGY_SPLIT_COL_EXTERNAL,
  ENERGY_SPLIT_COL_HOURGLASS,
  ENERGY_SPLIT_COL_INTERNAL,
  ENERGY_SPLIT_COL_KINETIC,
  ENERGY_SPLIT_HOW_DECKS,
  ENERGY_SPLIT_HOW_TOY,
  ENERGY_SPLIT_NOT_A_GATE,
  ENERGY_SPLIT_REQUESTED_MS,
  ENERGY_SPLIT_T01_FILE,
  ENERGY_SPLIT_T01_STEP,
  NO_VERDICT_ROW,
  PAGE_WORDING_ENERGY_BAR,
  PAGE_WORDING_LAG,
  PAGE_WORDING_MAX_STRETCH,
  PAGE_WORDING_NO_CANVAS,
  PAGE_WORDING_NODES,
} from "../oracle/deckEnergySplitRules.js";
import { scoreEnergySplit, type SharePoint } from "../oracle/deckEnergySplitScore.js";
import { parseVtkAnimShells } from "../oracle/vtkAnim.js";

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

function vtkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^Ainflate_A\d+\.vtk$/.test(n))
    .sort();
}

function vtkTimes(dir: string, nNodes: number): number[] {
  const out: number[] = [];
  for (const name of vtkFiles(dir)) {
    const parsed = parseVtkAnimShells(readFileSync(resolve(dir, name), "utf8"), nNodes);
    out.push(parsed.t);
  }
  return out;
}

interface ThRow {
  t_s: number;
  external_J: number | null;
  internal_J: number | null;
  kinetic_J: number | null;
  hourglass_J: number | null;
  contactDamp_J: number | null;
  missing: string[];
}

function headerKey(h: string): string {
  return h.trim().replace(/^"|"$/g, "").replace(/\s+/g, " ").toLowerCase();
}

function colIndex(headers: readonly string[], want: string): number {
  const w = headerKey(want);
  return headers.findIndex((h) => headerKey(h) === w);
}

function parseThCsv(text: string): { rows: ThRow[]; headers: string[]; note: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], headers: [], note: "csv empty" };
  let headerIdx = 0;
  while (headerIdx < lines.length && lines[headerIdx]!.startsWith("#") && !/[A-Za-z]/.test(lines[headerIdx]!)) {
    headerIdx += 1;
  }
  const headerLine = lines[headerIdx]!.replace(/^#/, "");
  const headers = headerLine.split(/[,;\t]/).map((h) => h.trim().replace(/^"|"$/g, ""));
  const timeIdx = colIndex(headers, "time");
  const extIdx = colIndex(headers, ENERGY_SPLIT_COL_EXTERNAL);
  const ieIdx = colIndex(headers, ENERGY_SPLIT_COL_INTERNAL);
  const keIdx = colIndex(headers, ENERGY_SPLIT_COL_KINETIC);
  const hgIdx = colIndex(headers, ENERGY_SPLIT_COL_HOURGLASS);
  const cdIdx = colIndex(headers, ENERGY_SPLIT_COL_CONTACT_DAMP);
  if (timeIdx < 0) return { rows: [], headers, note: "no time column" };
  const missingHeader: string[] = [];
  if (extIdx < 0) missingHeader.push(ENERGY_SPLIT_COL_EXTERNAL);
  if (ieIdx < 0) missingHeader.push(ENERGY_SPLIT_COL_INTERNAL);
  if (keIdx < 0) missingHeader.push(ENERGY_SPLIT_COL_KINETIC);
  if (hgIdx < 0) missingHeader.push(`${ENERGY_SPLIT_COL_HOURGLASS} (information only)`);
  if (cdIdx < 0) missingHeader.push(`${ENERGY_SPLIT_COL_CONTACT_DAMP} (information only)`);
  const rows: ThRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("#")) continue;
    const tok = line.split(/[,;\t]/);
    const t = Number(tok[timeIdx]);
    if (!Number.isFinite(t)) continue;
    const num = (idx: number): number | null => {
      if (idx < 0) return null;
      const v = Number(tok[idx]);
      return Number.isFinite(v) ? v : null;
    };
    const missing: string[] = [];
    if (extIdx < 0 || num(extIdx) === null) missing.push(ENERGY_SPLIT_COL_EXTERNAL);
    if (ieIdx < 0 || num(ieIdx) === null) missing.push(ENERGY_SPLIT_COL_INTERNAL);
    if (keIdx < 0 || num(keIdx) === null) missing.push(ENERGY_SPLIT_COL_KINETIC);
    rows.push({
      t_s: t,
      external_J: num(extIdx),
      internal_J: num(ieIdx),
      kinetic_J: num(keIdx),
      hourglass_J: num(hgIdx),
      contactDamp_J: num(cdIdx),
      missing,
    });
  }
  const note =
    missingHeader.length === 0
      ? `columns present: ${ENERGY_SPLIT_COL_EXTERNAL}, ${ENERGY_SPLIT_COL_INTERNAL}, ${ENERGY_SPLIT_COL_KINETIC}, ${ENERGY_SPLIT_COL_HOURGLASS}, ${ENERGY_SPLIT_COL_CONTACT_DAMP}`
      : `missing columns: ${missingHeader.join(", ")}`;
  return { rows, headers, note };
}

function thAt(rows: readonly ThRow[], t_s: number): ThRow | null {
  if (rows.length === 0) return null;
  return rows[nearestIndex(rows.map((r) => r.t_s), t_s)] ?? null;
}

interface EnergySnap {
  t: number;
  pressureWork_J: number;
  strain_J: number;
  kinetic_J: number;
}

function lerpSnap(snaps: readonly EnergySnap[], t: number): EnergySnap {
  if (snaps.length === 0) throw new Error("toy energy ledger empty");
  const first = snaps[0]!;
  if (t <= first.t) return first;
  const last = snaps[snaps.length - 1]!;
  if (t >= last.t) return last;
  let lo = 0;
  for (let i = 1; i < snaps.length; i++) {
    if (snaps[i]!.t >= t) {
      lo = i - 1;
      break;
    }
  }
  const a = snaps[lo]!;
  const b = snaps[lo + 1]!;
  if (b.t === a.t) return a;
  const w = (t - a.t) / (b.t - a.t);
  return {
    t,
    pressureWork_J: a.pressureWork_J + w * (b.pressureWork_J - a.pressureWork_J),
    strain_J: a.strain_J + w * (b.strain_J - a.strain_J),
    kinetic_J: a.kinetic_J + w * (b.kinetic_J - a.kinetic_J),
  };
}

function share(part: number | null, ext: number | null): number | null {
  if (part === null || ext === null) return null;
  if (ext === 0) return null;
  return part / ext;
}

function dissipated(ext: number | null, ie: number | null, ke: number | null): number | null {
  if (ext === null || ie === null || ke === null) return null;
  return ext - ie - ke;
}

interface DeckSpec {
  key: "golden" | "ishell" | "fine" | "triangle";
  tableName: string;
  folder: string;
  nNodes: number;
}

const DECKS: readonly DeckSpec[] = [
  { key: "golden", tableName: "golden Belytschko quad", folder: GOLDEN_DECK_FOLDER, nNodes: 1554 },
  { key: "ishell", tableName: "Ishell 24 ismstr 2", folder: ISHELL24_DECK_FOLDER, nNodes: 1554 },
  { key: "fine", tableName: "fine re-oriented", folder: FINE_DECK_FOLDER, nNodes: 6216 },
  { key: "triangle", tableName: "triangle /SH3N", folder: TRIANGLE_DECK_FOLDER, nNodes: 1554 },
];

interface FrameRow {
  requested_ms: number;
  actual_vtk_ms: number | null;
  t01_ms: number | null;
  external_J: number | null;
  internal_J: number | null;
  kinetic_J: number | null;
  dissipated_J: number | null;
  externalShare: number | null;
  internalShare: number | null;
  kineticShare: number | null;
  dissipatedShare: number | null;
  hourglass_J: number | null;
  contactDamp_J: number | null;
  hourglassOfDissip: number | null;
  contactDampOfDissip: number | null;
  source: string;
  note: string;
}

export function diagnoseDeckEnergySplit(): { missingRuns: boolean; md: string; payload: Record<string, unknown> } {
  const pinRaw: unknown = JSON.parse(readFileSync(resolve(DIAG, "opencourant-linux64-pin.json"), "utf8"));
  if (!isRecord(pinRaw)) throw new Error("pin json");
  if (pinRaw["zipSha256"] !== OPENCOURANT_ZIP_SHA256) throw new Error("pin sha drifted");
  if (pinRaw["zipBytes"] !== OPENCOURANT_ZIP_BYTES) throw new Error("pin size drifted");
  if (pinRaw["tag"] !== OPENCOURANT_TAG) throw new Error("pin tag drifted");
  if (pinRaw["engineCommit"] !== OPENCOURANT_ENGINE_COMMIT) throw new Error("pin commit drifted");

  const runStatus: { name: string; vtk: number; t01: boolean; folder: string }[] = [];
  let anyMissing = false;
  for (const spec of DECKS) {
    const runDir = resolve(ROOT, spec.folder, "run");
    const n = vtkFiles(runDir).length;
    const t01 = existsSync(resolve(runDir, ENERGY_SPLIT_T01_FILE)) || existsSync(resolve(runDir, "Ainflate_T01.csv"));
    runStatus.push({ name: spec.tableName, vtk: n, t01, folder: spec.folder });
    if (n === 0) anyMissing = true;
  }
  if (anyMissing) {
    const lines = [
      "# Energy and damping split — results not yet",
      "",
      "Plan was committed first. Animation frames or time-history files are not in the run trees yet.",
      ENERGY_SPLIT_NOT_A_GATE,
      `OpenCourant ${OPENCOURANT_TAG} sha256 \`${OPENCOURANT_ZIP_SHA256}\`.`,
      "",
      ...runStatus.map(
        (r) => `- ${r.name} (\`${r.folder}\`): ${String(r.vtk)} VTK files; T01 ${r.t01 ? "present" : "missing"}`,
      ),
    ];
    return {
      missingRuns: true,
      md: lines.join("\n"),
      payload: {
        kind: "deck-energy-split-measurement",
        status: "plan-committed-results-not-yet-run",
        notAGate: true,
      },
    };
  }

  const model = createInflateAModel();
  const toySolve = solveInflate(model, {
    maxWallMs: 600_000,
    continuePastWarn: true,
    recordPerStepEnergy: true,
  });
  const ledger = toySolve.perStepEnergy;
  if (ledger === undefined) throw new Error("per-step energy ledger missing");
  const snaps: EnergySnap[] = ledger.snapshots.map((s) => ({
    t: s.t,
    pressureWork_J: s.pressureWork_J,
    strain_J: s.strain_J,
    kinetic_J: s.kinetic_J,
  }));

  const goldenTimes = vtkTimes(resolve(ROOT, GOLDEN_DECK_FOLDER, "run"), 1554);
  if (goldenTimes.length === 0) throw new Error("golden VTK missing");

  const tables: Record<string, FrameRow[]> = {};
  const sourceNotes: string[] = [];

  for (const spec of DECKS) {
    const runDir = resolve(ROOT, spec.folder, "run");
    const times = vtkTimes(runDir, spec.nNodes);
    let csvPath: string | null = null;
    for (const name of [ENERGY_SPLIT_T01_FILE, "Ainflate_T01.csv"]) {
      const p = resolve(runDir, name);
      if (existsSync(p) && readFileSync(p, "utf8").includes("INTERNAL ENERGY")) {
        csvPath = p;
        break;
      }
    }
    const parsed =
      csvPath === null
        ? { rows: [] as ThRow[], headers: [] as string[], note: "no AinflateT01.csv" }
        : parseThCsv(readFileSync(csvPath, "utf8"));
    const csvName = csvPath === null ? "missing" : csvPath.slice(csvPath.lastIndexOf("/") + 1);
    sourceNotes.push(
      `${spec.tableName}: scored from \`${spec.folder}/run/${csvName}\`; ${parsed.note}; ${ENERGY_SPLIT_T01_STEP}.`,
    );
    const rows: FrameRow[] = [];
    for (const t_ms of ENERGY_SPLIT_REQUESTED_MS) {
      if (spec.key === "triangle" && t_ms > DECK_NODE_TRIANGLE_STOP_MS) {
        rows.push({
          requested_ms: t_ms,
          actual_vtk_ms: null,
          t01_ms: null,
          external_J: null,
          internal_J: null,
          kinetic_J: null,
          dissipated_J: null,
          externalShare: null,
          internalShare: null,
          kineticShare: null,
          dissipatedShare: null,
          hourglass_J: null,
          contactDamp_J: null,
          hourglassOfDissip: null,
          contactDampOfDissip: null,
          source: "none",
          note: "triangle deck died ~11.5 ms; not a late-window reference; no 16 ms row; not inferred",
        });
        continue;
      }
      if (times.length === 0) {
        rows.push({
          requested_ms: t_ms,
          actual_vtk_ms: null,
          t01_ms: null,
          external_J: null,
          internal_J: null,
          kinetic_J: null,
          dissipated_J: null,
          externalShare: null,
          internalShare: null,
          kineticShare: null,
          dissipatedShare: null,
          hourglass_J: null,
          contactDamp_J: null,
          hourglassOfDissip: null,
          contactDampOfDissip: null,
          source: "none",
          note: "no animation TIME; not inferred",
        });
        continue;
      }
      const vtkT = times[nearestIndex(times, t_ms / 1000)]!;
      const th = thAt(parsed.rows, vtkT);
      if (th === null) {
        rows.push({
          requested_ms: t_ms,
          actual_vtk_ms: vtkT * 1000,
          t01_ms: null,
          external_J: null,
          internal_J: null,
          kinetic_J: null,
          dissipated_J: null,
          externalShare: null,
          internalShare: null,
          kineticShare: null,
          dissipatedShare: null,
          hourglass_J: null,
          contactDamp_J: null,
          hourglassOfDissip: null,
          contactDampOfDissip: null,
          source: csvName,
          note: `no time-history sample; ${ENERGY_SPLIT_T01_STEP}; not inferred`,
        });
        continue;
      }
      const diss = dissipated(th.external_J, th.internal_J, th.kinetic_J);
      const missing = th.missing.length > 0 ? ` missing ${th.missing.join(", ")}; not inferred.` : "";
      rows.push({
        requested_ms: t_ms,
        actual_vtk_ms: vtkT * 1000,
        t01_ms: th.t_s * 1000,
        external_J: th.external_J,
        internal_J: th.internal_J,
        kinetic_J: th.kinetic_J,
        dissipated_J: diss,
        externalShare: share(th.external_J, th.external_J),
        internalShare: share(th.internal_J, th.external_J),
        kineticShare: share(th.kinetic_J, th.external_J),
        dissipatedShare: share(diss, th.external_J),
        hourglass_J: th.hourglass_J,
        contactDamp_J: th.contactDamp_J,
        hourglassOfDissip: share(th.hourglass_J, diss),
        contactDampOfDissip: share(th.contactDamp_J, diss),
        source: `${csvName} ${ENERGY_SPLIT_COL_EXTERNAL}/${ENERGY_SPLIT_COL_INTERNAL}/${ENERGY_SPLIT_COL_KINETIC}`,
        note: `${ENERGY_SPLIT_T01_STEP}.${missing}`,
      });
    }
    tables[spec.key] = rows;
  }

  const toyRows: FrameRow[] = [];
  for (const t_ms of ENERGY_SPLIT_REQUESTED_MS) {
    const vtkT = goldenTimes[nearestIndex(goldenTimes, t_ms / 1000)]!;
    const snap = lerpSnap(snaps, vtkT);
    const diss = dissipated(snap.pressureWork_J, snap.strain_J, snap.kinetic_J);
    toyRows.push({
      requested_ms: t_ms,
      actual_vtk_ms: vtkT * 1000,
      t01_ms: snap.t * 1000,
      external_J: snap.pressureWork_J,
      internal_J: snap.strain_J,
      kinetic_J: snap.kinetic_J,
      dissipated_J: diss,
      externalShare: share(snap.pressureWork_J, snap.pressureWork_J),
      internalShare: share(snap.strain_J, snap.pressureWork_J),
      kineticShare: share(snap.kinetic_J, snap.pressureWork_J),
      dissipatedShare: share(diss, snap.pressureWork_J),
      hourglass_J: null,
      contactDamp_J: null,
      hourglassOfDissip: null,
      contactDampOfDissip: null,
      source: "toy per-step pressure work / strain / kinetic",
      note: `${ENERGY_SPLIT_HOW_TOY} interpolated to golden VTK TIME ${fmt(vtkT * 1000, 4)} ms.`,
    });
  }

  const asShare = (rows: readonly FrameRow[]): SharePoint[] =>
    rows.map((r) => ({
      t_ms: r.requested_ms,
      dissipatedShare: r.dissipatedShare,
      kineticShare: r.kineticShare,
    }));

  const decksAt4: SharePoint[] = [];
  const decksAt8: SharePoint[] = [];
  for (const spec of DECKS) {
    const rows = tables[spec.key] ?? [];
    const r4 = rows.find((r) => r.requested_ms === 4);
    const r8 = rows.find((r) => r.requested_ms === 8);
    if (r4 !== undefined && r4.dissipatedShare !== null && r4.kineticShare !== null) {
      decksAt4.push({ t_ms: 4, dissipatedShare: r4.dissipatedShare, kineticShare: r4.kineticShare });
    }
    if (r8 !== undefined && r8.dissipatedShare !== null && r8.kineticShare !== null) {
      decksAt8.push({ t_ms: 8, dissipatedShare: r8.dissipatedShare, kineticShare: r8.kineticShare });
    }
  }
  const score = scoreEnergySplit({ toy: asShare(toyRows), decksAt4, decksAt8 });

  const pageWording = [
    PAGE_WORDING_MAX_STRETCH,
    PAGE_WORDING_LAG,
    PAGE_WORDING_NODES,
    PAGE_WORDING_ENERGY_BAR,
    PAGE_WORDING_NO_CANVAS,
  ].join("\n");

  const md: string[] = [
    "# Energy and damping split (measurement, not a gate)",
    "",
    "Plan was committed first in `deck-energy-split-prediction.md` and was not",
    "changed after this run. No bar was widened. No time shift was applied.",
    "No verdict row was added. Compare:inflate is not this job.",
    "",
    `OpenCourant ${OPENCOURANT_TAG} sha256 \`${OPENCOURANT_ZIP_SHA256}\`, engine commit \`${OPENCOURANT_ENGINE_COMMIT}\`.`,
    "",
    ENERGY_SPLIT_HOW_DECKS,
    ENERGY_SPLIT_T01_STEP,
    ENERGY_SPLIT_HOW_TOY,
    ENERGY_SPLIT_NOT_A_GATE,
    NO_VERDICT_ROW,
    "",
    "## Sources",
    "",
    ...sourceNotes.map((s) => `- ${s}`),
    "",
    "## Table — joules and shares of external work",
    "",
  ];

  const printTable = (title: string, rows: readonly FrameRow[]): void => {
    md.push(`### ${title}`);
    md.push("");
    md.push(
      "requested ms | actual VTK ms | time-history ms | external work (J) | internal (J) | kinetic (J) | dissipated (J) | external share | internal share | kinetic share | dissipated share | hourglass (J, info) | contact damping (J, info) | hourglass / dissipated | contact damping / dissipated | source | note",
    );
    for (const r of rows) {
      md.push(
        `${String(r.requested_ms)} | ${fmt(r.actual_vtk_ms, 4)} | ${fmt(r.t01_ms, 4)} | ${fmt(r.external_J)} | ${fmt(r.internal_J)} | ${fmt(r.kinetic_J)} | ${fmt(r.dissipated_J)} | ${pct(r.externalShare)} | ${pct(r.internalShare)} | ${pct(r.kineticShare)} | ${pct(r.dissipatedShare)} | ${fmt(r.hourglass_J)} | ${fmt(r.contactDamp_J)} | ${pct(r.hourglassOfDissip)} | ${pct(r.contactDampOfDissip)} | ${r.source} | ${r.note}`,
      );
    }
    md.push("");
  };

  printTable("toy (this solve, interpolated to golden VTK TIME)", toyRows);
  for (const spec of DECKS) printTable(spec.tableName, tables[spec.key] ?? []);

  const rangeLine = (label: string, r: { min: number; max: number; n: number } | null): string => {
    if (r === null) return `${label}: no deck share`;
    return `${label}: min ${pct(r.min)} max ${pct(r.max)} (n=${String(r.n)})`;
  };

  md.push("## Shares at 4 ms and 8 ms (decide a / b / c)");
  md.push("");
  md.push(`Toy dissipated share: 4 ms ${pct(score.toyDissip4)}; 8 ms ${pct(score.toyDissip8)}.`);
  md.push(rangeLine("Deck dissipated-share range at 4 ms", score.dissipRange4));
  md.push(rangeLine("Deck dissipated-share range at 8 ms", score.dissipRange8));
  md.push(`Toy kinetic share: 4 ms ${pct(score.toyKinetic4)}; 8 ms ${pct(score.toyKinetic8)}.`);
  md.push(rangeLine("Deck kinetic-share range at 4 ms", score.kineticRange4));
  md.push(rangeLine("Deck kinetic-share range at 8 ms", score.kineticRange8));
  md.push(
    `Booleans: dissipated-above 4 ${String(score.dissipAbove4)} 8 ${String(score.dissipAbove8)}; kinetic-outside 4 ${String(score.kineticOutside4)} 8 ${String(score.kineticOutside8)}; dissipated-inside 4 ${String(score.dissipInside4)} 8 ${String(score.dissipInside8)}; kinetic-inside 4 ${String(score.kineticInside4)} 8 ${String(score.kineticInside8)}; fires (a)=${String(score.firesA)} (b)=${String(score.firesB)} (c)=${String(score.firesC)}. 2 ms and 16 ms are in the table and do not decide.`,
  );
  md.push("");
  md.push(`Outcome: ${score.outcomeLine}`);
  md.push("");
  md.push("Hourglass and contact damping are information only and do not rescore the outcome.");
  md.push("");
  md.push("## Page wording (text, no numbers or bars changed; clearly separated)");
  md.push("");
  md.push(pageWording);
  md.push("");
  md.push("No verdict row was added.");

  const pageBody = [
    `Toy dissipated share 4 ms ${pct(score.toyDissip4)} 8 ms ${pct(score.toyDissip8)}; kinetic share 4 ms ${pct(score.toyKinetic4)} 8 ms ${pct(score.toyKinetic8)}.`,
    score.outcomeLine,
    "No verdict row was added.",
  ].join("\n");

  return {
    missingRuns: false,
    md: md.join("\n"),
    payload: {
      kind: "deck-energy-split-measurement",
      status: "run",
      notAGate: true,
      package: {
        tag: OPENCOURANT_TAG,
        zipSha256: OPENCOURANT_ZIP_SHA256,
        zipBytes: OPENCOURANT_ZIP_BYTES,
        engineCommit: OPENCOURANT_ENGINE_COMMIT,
      },
      sourceNotes,
      toy: toyRows,
      decks: tables,
      score,
      outcomeLine: score.outcomeLine,
      pageBody,
      pageWording,
    },
  };
}

function main(): void {
  const out = diagnoseDeckEnergySplit();
  if (out.missingRuns) {
    console.log(out.md);
    console.log("Animation frames or time-history missing. Not writing a results table.");
    return;
  }
  writeFileSync(resolve(DIAG, "deck-energy-split-results.md"), `${out.md}\n`);
  writeFileSync(resolve(DIAG, "deck-energy-split-results.json"), `${JSON.stringify(out.payload, null, 2)}\n`);
  writeFileSync(
    resolve(ROOT, "src/oracle/deck-energy-split-results.json"),
    `${JSON.stringify(
      {
        kind: "deck-energy-split-measurement",
        status: "run",
        notAGate: true,
        outcomeLine: out.payload["outcomeLine"],
        pageBody: out.payload["pageBody"],
        pageWording: out.payload["pageWording"],
      },
      null,
      2,
    )}\n`,
  );
  console.log(out.md);
}

main();
