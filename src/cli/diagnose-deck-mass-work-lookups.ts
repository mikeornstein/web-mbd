/**
 * Film mass, p ΔV work, and kinetic ringing lookups. Measurement, not a gate.
 * Plan is locked in deck-mass-and-work-lookups-plan.md (committed first).
 * Do not change that file after seeing numbers. Do not add a verdict row.
 * Do not propose a fix.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { buildCstRest, splitQuadCsts } from "../fe/membraneCst.js";
import { H0, RHO } from "../inflate/constants.js";
import { enclosedVolume } from "../inflate/meshA.js";
import type { InflateModelIR } from "../inflate/types.js";
import {
  FINE_DECK_FOLDER,
  GOLDEN_DECK_FOLDER,
  ISHELL24_DECK_FOLDER,
  OPENCOURANT_ENGINE_COMMIT,
  OPENCOURANT_TAG,
  OPENCOURANT_ZIP_BYTES,
  OPENCOURANT_ZIP_SHA256,
  TRIANGLE_DECK_FOLDER,
} from "../oracle/deckNodeOutputRules.js";
import {
  parseRadiossShellBlock,
  parseRadiossStarterNodes,
  toZeroBased,
} from "../oracle/deckNodeEnergy.js";
import {
  LOOKUP_COL_EXTERNAL,
  LOOKUP_COL_KINETIC,
  LOOKUP_COL_MASS,
  LOOKUP_DECIDING_MS,
  LOOKUP_HOW_MASS,
  LOOKUP_HOW_PRESSURE_DECK,
  LOOKUP_HOW_VOLUME_DECK,
  LOOKUP_HOW_WORK,
  LOOKUP_KE_WINDOW_MS,
  LOOKUP_MASS_REL,
  LOOKUP_NOT_A_GATE,
  LOOKUP_OSCILLATION,
  LOOKUP_T01_FILE,
  LOOKUP_T01_STEP,
  NO_FIX,
  NO_VERDICT_ROW,
} from "../oracle/deckMassWorkLookupRules.js";
import { scoreMassWorkLookups, type KineticSample, type MassRow } from "../oracle/deckMassWorkLookupScore.js";
import { parseVtkAnimShells, scatterShellToNodeOrder } from "../oracle/vtkAnim.js";

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
  return `${(100 * v).toFixed(4)}%`;
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

function headerKey(h: string): string {
  return h.trim().replace(/^"|"$/g, "").replace(/\s+/g, " ").toLowerCase();
}

function colIndex(headers: readonly string[], want: string): number {
  const w = headerKey(want);
  return headers.findIndex((h) => headerKey(h) === w);
}

interface ThRow {
  t_s: number;
  external_J: number | null;
  kinetic_J: number | null;
  mass_kg: number | null;
  volume_m3: number | null;
  pressure_Pa: number | null;
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
  const extIdx = colIndex(headers, LOOKUP_COL_EXTERNAL);
  const keIdx = colIndex(headers, LOOKUP_COL_KINETIC);
  const massIdx = colIndex(headers, LOOKUP_COL_MASS);
  const volIdx = headers.findIndex((h) => headerKey(h) === "volume" || headerKey(h) === "vol");
  const pIdx = headers.findIndex((h) => headerKey(h) === "pressure");
  if (timeIdx < 0) return { rows: [], headers, note: "no time column" };
  const missing: string[] = [];
  if (extIdx < 0) missing.push(LOOKUP_COL_EXTERNAL);
  if (keIdx < 0) missing.push(LOOKUP_COL_KINETIC);
  if (volIdx < 0) missing.push("volume (none)");
  if (pIdx < 0) missing.push("pressure (none)");
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
    rows.push({
      t_s: t,
      external_J: num(extIdx),
      kinetic_J: num(keIdx),
      mass_kg: num(massIdx),
      volume_m3: num(volIdx),
      pressure_Pa: num(pIdx),
    });
  }
  return {
    rows,
    headers,
    note: missing.length === 0 ? "all looked-up columns present" : `T01: ${missing.join("; ")}`,
  };
}

function thAt(rows: readonly ThRow[], t_s: number): ThRow | null {
  if (rows.length === 0) return null;
  return rows[nearestIndex(rows.map((r) => r.t_s), t_s)] ?? null;
}

function parseRhoI(starter: string): { value: number; source: string } {
  const idx = starter.indexOf("/MAT/LAW42/1");
  if (idx < 0) throw new Error("starter missing /MAT/LAW42/1");
  const lines = starter.slice(idx, idx + 1200).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.includes("RHO_I")) continue;
    const next = lines[i + 1];
    if (next === undefined) break;
    const v = Number(next.trim().split(/\s+/)[0]);
    if (!Number.isFinite(v)) throw new Error("RHO_I is not a number");
    return { value: v, source: "/MAT/LAW42/1 field RHO_I" };
  }
  throw new Error("RHO_I not found");
}

function parseThick(starter: string): { value: number; source: string } {
  const idx = starter.indexOf("/PROP/SHELL/1");
  if (idx < 0) throw new Error("starter missing /PROP/SHELL/1");
  const lines = starter.slice(idx, idx + 1200).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/\bThick\b/i.test(lines[i]!)) continue;
    const next = lines[i + 1];
    if (next === undefined) break;
    const tok = next.trim().split(/\s+/);
    const v = Number(tok[1]);
    if (!Number.isFinite(v)) throw new Error("Thick is not a number");
    return { value: v, source: "/PROP/SHELL/1 field Thick" };
  }
  throw new Error("Thick not found");
}

function parseFunct1(starter: string): { t: number; y: number }[] {
  const idx = starter.indexOf("/FUNCT/1");
  if (idx < 0) throw new Error("starter missing /FUNCT/1");
  const rest = starter.slice(idx + "/FUNCT/1".length);
  const endRel = rest.search(/\n\/[A-Z]/);
  const block = endRel < 0 ? rest : rest.slice(0, endRel);
  const pts: { t: number; y: number }[] = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || /[A-Za-z]/.test(t)) continue;
    const tok = t.split(/\s+/);
    if (tok.length < 2) continue;
    const x = Number(tok[0]);
    const y = Number(tok[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pts.push({ t: x, y });
  }
  if (pts.length < 2) throw new Error("/FUNCT/1 has fewer than two points");
  return pts;
}

function parsePloadFscale(starter: string): number {
  const idx = starter.indexOf("/PLOAD/1");
  if (idx < 0) throw new Error("starter missing /PLOAD/1");
  const rest = starter.slice(idx + "/PLOAD/1".length);
  const endRel = rest.search(/\n\/[A-Z]/);
  const block = endRel < 0 ? rest : rest.slice(0, endRel);
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || /[A-Za-z]/.test(t)) continue;
    const tok = t.split(/\s+/);
    const last = Number(tok[tok.length - 1]);
    if (!Number.isFinite(last)) throw new Error("/PLOAD Fscale_y is not a number");
    return last;
  }
  throw new Error("/PLOAD Fscale_y not found");
}

function evalFunct(pts: readonly { t: number; y: number }[], t: number): number {
  const first = pts[0]!;
  if (t <= first.t) return first.y;
  const last = pts[pts.length - 1]!;
  if (t >= last.t) return last.y;
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i]!;
    if (t <= b.t) {
      const a = pts[i - 1]!;
      if (b.t === a.t) return a.y;
      const w = (t - a.t) / (b.t - a.t);
      return a.y + w * (b.y - a.y);
    }
  }
  return last.y;
}

function restAreaFromMesh(
  coords: ArrayLike<number>,
  shells: readonly { nodes: number[] }[],
  kind: "quad" | "tri",
): number {
  let area = 0;
  for (const s of shells) {
    const zb = toZeroBased(s.nodes);
    if (kind === "tri") {
      if (zb.length < 3) continue;
      const rest = buildCstRest(coords, zb[0]!, zb[1]!, zb[2]!);
      if (rest) area += rest.A0;
      continue;
    }
    if (zb.length < 4) continue;
    const pair = splitQuadCsts(coords, zb[0]!, zb[1]!, zb[2]!, zb[3]!);
    if (pair) area += pair.a.A0 + pair.b.A0;
  }
  return area;
}

function toyRestArea(model: InflateModelIR): number {
  let area = 0;
  const { coords, quads, tris, nQuads, nTris } = model.mesh;
  for (let e = 0; e < nQuads; e++) {
    const pair = splitQuadCsts(
      coords,
      quads[e * 4]!,
      quads[e * 4 + 1]!,
      quads[e * 4 + 2]!,
      quads[e * 4 + 3]!,
    );
    if (pair) area += pair.a.A0 + pair.b.A0;
  }
  for (let e = 0; e < nTris; e++) {
    const rest = buildCstRest(coords, tris[e * 3]!, tris[e * 3 + 1]!, tris[e * 3 + 2]!);
    if (rest) area += rest.A0;
  }
  return area;
}

function packQuads(shells: readonly { nodes: number[] }[]): number[] {
  const q: number[] = [];
  for (const s of shells) {
    const zb = toZeroBased(s.nodes);
    if (zb.length !== 4) continue;
    q.push(zb[0]!, zb[1]!, zb[2]!, zb[3]!);
  }
  return q;
}

function packTris(shells: readonly { nodes: number[] }[]): number[] {
  const t: number[] = [];
  for (const s of shells) {
    const zb = toZeroBased(s.nodes);
    if (zb.length !== 3) continue;
    t.push(zb[0]!, zb[1]!, zb[2]!);
  }
  return t;
}

function lerpSeries(times: readonly number[], values: readonly number[], t: number): number {
  if (times.length === 0 || values[0] === undefined) throw new Error("series empty");
  if (t <= times[0]!) return values[0];
  const lastT = times[times.length - 1]!;
  const lastV = values[values.length - 1];
  if (lastV === undefined) throw new Error("series hole");
  if (t >= lastT) return lastV;
  let lo = 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i]! >= t) {
      lo = i - 1;
      break;
    }
  }
  const a = values[lo]!;
  const b = values[lo + 1]!;
  const t0 = times[lo]!;
  const t1 = times[lo + 1]!;
  if (t1 === t0) return a;
  const w = (t - t0) / (t1 - t0);
  return a + w * (b - a);
}

interface DeckSpec {
  key: "golden" | "ishell" | "fine" | "triangle";
  tableName: string;
  folder: string;
  nNodes: number;
  split: "quad" | "tri";
}

const DECKS: readonly DeckSpec[] = [
  { key: "golden", tableName: "golden Belytschko quad", folder: GOLDEN_DECK_FOLDER, nNodes: 1554, split: "quad" },
  { key: "ishell", tableName: "Ishell 24 ismstr 2", folder: ISHELL24_DECK_FOLDER, nNodes: 1554, split: "quad" },
  { key: "fine", tableName: "fine re-oriented", folder: FINE_DECK_FOLDER, nNodes: 6216, split: "quad" },
  { key: "triangle", tableName: "triangle /SH3N", folder: TRIANGLE_DECK_FOLDER, nNodes: 1554, split: "tri" },
];

function findT01(runDir: string): string | null {
  for (const name of [LOOKUP_T01_FILE, "Ainflate_T01.csv"]) {
    const p = resolve(runDir, name);
    if (existsSync(p) && readFileSync(p, "utf8").includes("INTERNAL ENERGY")) return p;
  }
  return null;
}

function keChartSvg(
  toy: readonly KineticSample[],
  decks: readonly { name: string; color: string; samples: KineticSample[] }[],
): string {
  const w = 900;
  const h = 420;
  const padL = 72;
  const padR = 16;
  const padT = 28;
  const padB = 48;
  const t0 = LOOKUP_KE_WINDOW_MS.from / 1000;
  const t1 = LOOKUP_KE_WINDOW_MS.to / 1000;
  let y1 = 0;
  for (const s of toy) if (s.kinetic_J > y1) y1 = s.kinetic_J;
  for (const d of decks) for (const s of d.samples) if (s.kinetic_J > y1) y1 = s.kinetic_J;
  if (!(y1 > 0)) y1 = 1;
  const sx = (t: number): number => padL + ((t - t0) / (t1 - t0)) * (w - padL - padR);
  const sy = (ke: number): number => padT + (1 - ke / y1) * (h - padT - padB);
  const toyPts = toy
    .filter((s) => s.t_s + 1e-18 >= t0 && s.t_s - 1e-18 <= t1)
    .map((s) => `${sx(s.t_s).toFixed(1)},${sy(s.kinetic_J).toFixed(1)}`)
    .join(" ");
  const deckMarks: string[] = [];
  for (const d of decks) {
    for (const s of d.samples) {
      if (s.t_s + 1e-18 < t0 || s.t_s - 1e-18 > t1) continue;
      deckMarks.push(
        `<circle cx="${sx(s.t_s).toFixed(1)}" cy="${sy(s.kinetic_J).toFixed(1)}" r="3.5" fill="${d.color}"/>`,
      );
    }
  }
  const legend = decks
    .map((d, i) => `<text x="${padL + 8}" y="${padT + 32 + i * 14}" font-size="11" font-family="sans-serif" fill="${d.color}">${d.name}</text>`)
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${w / 2}" y="18" text-anchor="middle" font-size="14" font-family="sans-serif">Kinetic energy 4–8 ms (lookup, not a gate)</text>
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="#333"/>
  <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#333"/>
  <text x="${w / 2}" y="${h - 12}" text-anchor="middle" font-size="12" font-family="sans-serif">time (ms)</text>
  <text x="16" y="${h / 2}" text-anchor="middle" font-size="12" font-family="sans-serif" transform="rotate(-90 16 ${h / 2})">kinetic energy (J)</text>
  <text x="${padL}" y="${h - padB + 16}" font-size="11" font-family="sans-serif">4</text>
  <text x="${w - padR - 8}" y="${h - padB + 16}" font-size="11" font-family="sans-serif" text-anchor="end">8</text>
  <polyline fill="none" stroke="#1d4ed8" stroke-width="1.5" points="${toyPts}"/>
  ${deckMarks.join("\n  ")}
  <text x="${padL + 8}" y="${padT + 16}" font-size="11" font-family="sans-serif" fill="#1d4ed8">toy every step</text>
  ${legend}
</svg>
`;
}

export function diagnoseDeckMassWorkLookups(): {
  missingRuns: boolean;
  md: string;
  payload: Record<string, unknown>;
  csv: string;
  svg: string;
} {
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
    const t01 = findT01(runDir) !== null;
    runStatus.push({ name: spec.tableName, vtk: n, t01, folder: spec.folder });
    if (n === 0) anyMissing = true;
  }
  if (anyMissing) {
    const lines = [
      "# Film mass, work, and ringing lookups — results not yet",
      "",
      "Plan was committed first. Animation frames or time-history files are not in the run trees yet.",
      LOOKUP_NOT_A_GATE,
      "",
      ...runStatus.map((r) => `- ${r.name} (\`${r.folder}\`): ${String(r.vtk)} VTK files; T01 ${r.t01 ? "present" : "missing"}`),
    ];
    return {
      missingRuns: true,
      md: lines.join("\n"),
      payload: { kind: "deck-mass-work-lookups", status: "plan-committed-results-not-yet-run", notAGate: true },
      csv: "# not yet\n",
      svg: keChartSvg([], []),
    };
  }

  const base = createInflateAModel();
  const lookupModel: InflateModelIR = {
    ...base,
    controls: { ...base.controls, endTime: 0.0085, historyInterval: 1e-9 },
  };
  const toySolve = solveInflate(lookupModel, {
    maxWallMs: 600_000,
    continuePastWarn: true,
    recordPerStepEnergy: true,
  });
  const toyTimes = toySolve.history.map((h) => h.t);
  const toyKeHist = toySolve.history.map((h) => h.kinetic);
  const toyVolHist = toySolve.volumeHistory;
  const toyPHist = toySolve.pressureHistory;
  const ledger = toySolve.perStepEnergy;
  if (ledger === undefined) throw new Error("per-step energy ledger missing");
  const toyWorkTimes = ledger.snapshots.map((s) => s.t);
  const toyWorkVals = ledger.snapshots.map((s) => s.pressureWork_J);

  const toyArea = toyRestArea(base);
  const toyMass = RHO * H0 * toyArea;
  const toyMassRow: MassRow = {
    name: "toy",
    mass_kg: toyMass,
    density_kg_m3: RHO,
    thickness_m: H0,
    restArea_m2: toyArea,
  };
  const toyVolRest = toyVolHist[0];
  if (toyVolRest === undefined) throw new Error("toy rest volume missing");

  const goldenRun = resolve(ROOT, GOLDEN_DECK_FOLDER, "run");
  const goldenVtk = vtkFiles(goldenRun).map((name) => {
    const parsed = parseVtkAnimShells(readFileSync(resolve(goldenRun, name), "utf8"), 1554);
    return parsed.t;
  });
  if (goldenVtk.length === 0) throw new Error("golden VTK missing");

  const massRows: {
    name: string;
    mass_kg: number;
    density_kg_m3: number;
    thickness_m: number;
    restArea_m2: number;
    densitySource: string;
    thicknessSource: string;
    areaSource: string;
    massVsToy: number;
    engineMass_kg: number | null;
    engineMassNote: string;
  }[] = [
    {
      name: "toy",
      mass_kg: toyMass,
      density_kg_m3: RHO,
      thickness_m: H0,
      restArea_m2: toyArea,
      densitySource: "src/inflate/constants.ts RHO (Desmopan 85085A, 1130 kg/m³)",
      thicknessSource: "src/inflate/constants.ts H0 = 0.015 × 0.0254 m",
      areaSource: "sum of rest triangle areas on loadShipMesh after outward orient, splitQuadCsts first-to-third diagonal",
      massVsToy: 0,
      engineMass_kg: null,
      engineMassNote: "n/a (toy; not an engine MASS channel)",
    },
  ];

  const workRows: {
    name: string;
    requested_ms: number;
    actual_ms: number | null;
    dV_m3: number | null;
    p_Pa: number | null;
    pDeltaV_J: number | null;
    external_J: number | null;
    volumeSource: string;
    pressureSource: string;
    workSource: string;
  }[] = [];

  const deckKe: { name: string; color: string; samples: KineticSample[] }[] = [];
  const deckColors = ["#b45309", "#15803d", "#7c3aed", "#be123c"] as const;
  const scoreDecks: MassRow[] = [];

  for (let di = 0; di < DECKS.length; di++) {
    const spec = DECKS[di]!;
    const starterPath = resolve(ROOT, spec.folder, "Ainflate_0000.rad");
    const starter = readFileSync(starterPath, "utf8");
    const rho = parseRhoI(starter);
    const thick = parseThick(starter);
    const nodes = parseRadiossStarterNodes(starter);
    const card = spec.split === "tri" ? "/SH3N/1" : "/SHELL/1";
    const shells = parseRadiossShellBlock(starter, card);
    const area = restAreaFromMesh(nodes.coords, shells, spec.split);
    const mass = rho.value * thick.value * area;
    const runDir = resolve(ROOT, spec.folder, "run");
    const t01Path = findT01(runDir);
    const parsed =
      t01Path === null
        ? { rows: [] as ThRow[], headers: [] as string[], note: "no AinflateT01.csv" }
        : parseThCsv(readFileSync(t01Path, "utf8"));
    const engineMass = parsed.rows[0]?.mass_kg ?? null;
    massRows.push({
      name: spec.tableName,
      mass_kg: mass,
      density_kg_m3: rho.value,
      thickness_m: thick.value,
      restArea_m2: area,
      densitySource: `${spec.folder}/Ainflate_0000.rad ${rho.source}`,
      thicknessSource: `${spec.folder}/Ainflate_0000.rad ${thick.source}`,
      areaSource: `${spec.folder}/Ainflate_0000.rad /NODE plus ${card} rest areas, ${spec.split === "tri" ? "written triangles" : "first-to-third diagonal split"}`,
      massVsToy: toyMass === 0 ? 0 : (mass - toyMass) / toyMass,
      engineMass_kg: engineMass,
      engineMassNote:
        engineMass === null
          ? "T01 MASS column absent; not inferred"
          : "T01 column MASS (engine reported; information only, not the scored mass)",
    });
    scoreDecks.push({
      name: spec.tableName,
      mass_kg: mass,
      density_kg_m3: rho.value,
      thickness_m: thick.value,
      restArea_m2: area,
    });

    const funct = parseFunct1(starter);
    const fscale = parsePloadFscale(starter);
    const names = vtkFiles(runDir);
    const frames: { t: number; coords: Float64Array; name: string }[] = [];
    for (const name of names) {
      const parsedV = parseVtkAnimShells(readFileSync(resolve(runDir, name), "utf8"), spec.nNodes);
      frames.push({ t: parsedV.t, coords: scatterShellToNodeOrder(parsedV, spec.nNodes), name });
    }
    const quads = spec.split === "quad" ? packQuads(shells) : [];
    const tris = spec.split === "tri" ? packTris(shells) : [];
    let restVol: number | null = null;
    let restVolSource = "no animation frame; not inferred";
    if (frames[0] !== undefined) {
      restVol = enclosedVolume(frames[0].coords, quads, tris);
      restVolSource = `first animation frame ${frames[0].name} TIME ${fmt(frames[0].t * 1000, 4)} ms; T01 has no volume column`;
    } else {
      restVol = enclosedVolume(nodes.coords, quads, tris);
      restVolSource = `starter /NODE rest; first animation frame missing; T01 has no volume column`;
    }

    for (const t_ms of LOOKUP_DECIDING_MS) {
      if (frames.length === 0) {
        workRows.push({
          name: spec.tableName,
          requested_ms: t_ms,
          actual_ms: null,
          dV_m3: null,
          p_Pa: null,
          pDeltaV_J: null,
          external_J: null,
          volumeSource: "no animation TIME; not inferred",
          pressureSource: LOOKUP_HOW_PRESSURE_DECK,
          workSource: parsed.note,
        });
        continue;
      }
      const fr = frames[nearestIndex(frames.map((f) => f.t), t_ms / 1000)]!;
      const vol = enclosedVolume(fr.coords, quads, tris);
      const dV = restVol === null ? null : vol - restVol;
      const pCard = fscale * evalFunct(funct, fr.t);
      const th = thAt(parsed.rows, fr.t);
      const pMeas = th?.pressure_Pa ?? null;
      const p = pCard;
      const implied = dV === null ? null : p * dV;
      const volNote =
        th?.volume_m3 !== null && th?.volume_m3 !== undefined
          ? `T01 volume column at ${fmt((th.t_s ?? fr.t) * 1000, 4)} ms`
          : `T01 has no volume column; nearest animation frame ${fr.name} TIME ${fmt(fr.t * 1000, 4)} ms; rest from ${restVolSource}`;
      const pNote =
        pMeas === null
          ? `${spec.folder}/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=${fmt(fscale, 0)} Pa at TIME ${fmt(fr.t * 1000, 4)} ms; T01 has no pressure column`
          : `T01 pressure column ${fmt(pMeas, 4)} Pa (information); lookup uses /FUNCT/1 × Fscale_y`;
      workRows.push({
        name: spec.tableName,
        requested_ms: t_ms,
        actual_ms: fr.t * 1000,
        dV_m3: dV,
        p_Pa: p,
        pDeltaV_J: implied,
        external_J: th?.external_J ?? null,
        volumeSource: volNote,
        pressureSource: pNote,
        workSource:
          th?.external_J === null || th === null
            ? `${parsed.note}; ${LOOKUP_T01_STEP}; not inferred`
            : `${spec.folder}/run/${LOOKUP_T01_FILE} ${LOOKUP_COL_EXTERNAL} at ${fmt(th.t_s * 1000, 4)} ms; ${LOOKUP_T01_STEP}`,
      });
    }

    const keSamples: KineticSample[] = [];
    for (const row of parsed.rows) {
      if (row.kinetic_J === null) continue;
      if (row.t_s + 1e-18 < LOOKUP_KE_WINDOW_MS.from / 1000) continue;
      if (row.t_s - 1e-18 > LOOKUP_KE_WINDOW_MS.to / 1000) continue;
      keSamples.push({ t_s: row.t_s, kinetic_J: row.kinetic_J });
    }
    deckKe.push({ name: spec.tableName, color: deckColors[di]!, samples: keSamples });
  }

  for (const t_ms of LOOKUP_DECIDING_MS) {
    const tWant = goldenVtk[nearestIndex(goldenVtk, t_ms / 1000)]!;
    const vol = lerpSeries(toyTimes, toyVolHist, tWant);
    const p = lerpSeries(toyTimes, toyPHist, tWant);
    const ext = lerpSeries(toyWorkTimes, toyWorkVals, tWant);
    const dV = vol - toyVolRest;
    workRows.unshift({
      name: "toy",
      requested_ms: t_ms,
      actual_ms: tWant * 1000,
      dV_m3: dV,
      p_Pa: p,
      pDeltaV_J: p * dV,
      external_J: ext,
      volumeSource: `toy enclosedVolume at golden VTK TIME ${fmt(tWant * 1000, 4)} ms; rest from first solver step`,
      pressureSource: `toy committed ramp P_MAX × unit function of time (src/inflate/constants.ts; same /FUNCT/1 shape)`,
      workSource: `toy per-step trapezoid of pressure times volume change, interpolated to golden VTK TIME ${fmt(tWant * 1000, 4)} ms`,
    });
  }
  // unshift 8 then 4 if we loop 4,8 — actually loop is 4 then 8, unshift 4 then 8 puts 8 first.
  // Fix order: collect toy rows separately. I already unshifted in loop order 4 then 8, so last unshift is 8 at front.
  // Re-sort toy+deck later when printing.

  const toyKe: KineticSample[] = [];
  for (let i = 0; i < toyTimes.length; i++) {
    const t = toyTimes[i]!;
    if (t + 1e-18 < LOOKUP_KE_WINDOW_MS.from / 1000) continue;
    if (t - 1e-18 > LOOKUP_KE_WINDOW_MS.to / 1000) continue;
    toyKe.push({ t_s: t, kinetic_J: toyKeHist[i]! });
  }

  const score = scoreMassWorkLookups({
    toy: toyMassRow,
    decks: scoreDecks,
    toyKinetic: toyKe,
    windowFrom_s: LOOKUP_KE_WINDOW_MS.from / 1000,
    windowTo_s: LOOKUP_KE_WINDOW_MS.to / 1000,
  });

  const csvLines = ["t_s,kinetic_J,source"];
  for (const s of toyKe) csvLines.push(`${s.t_s.toExponential(12)},${s.kinetic_J.toExponential(12)},toy every solver step`);
  const csv = `${csvLines.join("\n")}\n`;
  const svg = keChartSvg(toyKe, deckKe);

  const ringingLine = score.oscillates
    ? "The toy kinetic-energy curve in 4–8 ms rises and falls (ringing)."
    : "The toy kinetic-energy curve in 4–8 ms does not oscillate (stays high / monotonic in this window).";

  const md: string[] = [
    "# Film mass, p ΔV work, and kinetic ringing (lookup, not a gate)",
    "",
    "Plan was committed first in `deck-mass-and-work-lookups-plan.md` and was not",
    "changed after this run. No bar was widened. No time shift was applied.",
    "No verdict row was added. No fix was proposed. Compare:inflate is not this job.",
    "",
    `OpenCourant ${OPENCOURANT_TAG} sha256 \`${OPENCOURANT_ZIP_SHA256}\`, engine commit \`${OPENCOURANT_ENGINE_COMMIT}\`.`,
    "",
    LOOKUP_NOT_A_GATE,
    LOOKUP_HOW_MASS,
    LOOKUP_HOW_WORK,
    LOOKUP_HOW_VOLUME_DECK,
    LOOKUP_HOW_PRESSURE_DECK,
    LOOKUP_OSCILLATION,
    NO_VERDICT_ROW,
    NO_FIX,
    "",
    "## Lookup 1 — film mass",
    "",
    "name | mass (kg) | density (kg/m³) | thickness (m) | rest area (m²) | vs toy | density source | thickness source | area source | engine MASS (info)",
  ];
  for (const r of massRows) {
    md.push(
      `${r.name} | ${fmt(r.mass_kg, 8)} | ${fmt(r.density_kg_m3, 1)} | ${fmt(r.thickness_m, 9)} | ${fmt(r.restArea_m2, 8)} | ${pct(r.massVsToy)} | ${r.densitySource} | ${r.thicknessSource} | ${r.areaSource} | ${r.engineMass_kg === null ? r.engineMassNote : `${fmt(r.engineMass_kg, 8)} (${r.engineMassNote})`}`,
    );
  }
  md.push("");
  md.push(`Mass match bar is ${fmt(100 * LOOKUP_MASS_REL, 0)}%. Max |deck − toy| / toy = ${pct(score.maxAbsMassRel)}.`);
  md.push("");
  md.push("## Lookup 2 — work at 4 ms and 8 ms");
  md.push("");
  md.push(
    "name | requested ms | actual ms | ΔV from rest (m³) | ΔV (mL) | applied p (Pa) | p × ΔV (J) | recorded external work (J) | volume source | pressure source | external-work source",
  );
  const workOrdered = [...workRows].sort((a, b) => {
    if (a.requested_ms !== b.requested_ms) return a.requested_ms - b.requested_ms;
    if (a.name === "toy") return -1;
    if (b.name === "toy") return 1;
    return a.name.localeCompare(b.name);
  });
  for (const r of workOrdered) {
    md.push(
      `${r.name} | ${fmt(r.requested_ms, 0)} | ${fmt(r.actual_ms, 4)} | ${fmt(r.dV_m3, 8)} | ${r.dV_m3 === null ? "n/a" : fmt(r.dV_m3 * 1e6, 4)} | ${fmt(r.p_Pa, 2)} | ${fmt(r.pDeltaV_J, 6)} | ${fmt(r.external_J, 6)} | ${r.volumeSource} | ${r.pressureSource} | ${r.workSource}`,
    );
  }
  md.push("");
  md.push("## Lookup 3 — kinetic energy 4–8 ms");
  md.push("");
  md.push(ringingLine);
  md.push(
    `Toy samples in window: ${String(toyKe.length)} (every solver step; CSV is the every-step table). Plot: \`deck-mass-work-lookups-ke-4-to-8.svg\`.`,
  );
  md.push("");
  md.push("name | time-history ms | kinetic (J) | source");
  for (const d of deckKe) {
    if (d.samples.length === 0) {
      md.push(`${d.name} | n/a | n/a | no T01 KINETIC ENERGY sample in 4–8 ms; not inferred; ${LOOKUP_T01_STEP}`);
      continue;
    }
    for (const s of d.samples) {
      md.push(
        `${d.name} | ${fmt(s.t_s * 1000, 4)} | ${fmt(s.kinetic_J, 6)} | ${LOOKUP_T01_FILE} ${LOOKUP_COL_KINETIC}; ${LOOKUP_T01_STEP}`,
      );
    }
  }
  md.push("");
  md.push("Toy 4 ms and 8 ms kinetic (window ends, from the every-step series):");
  const toy4 = toyKe.length === 0 ? null : toyKe[0]!;
  const toy8 = toyKe.length === 0 ? null : toyKe[toyKe.length - 1]!;
  md.push(
    `toy | ${toy4 === null ? "n/a" : fmt(toy4.t_s * 1000, 4)} | ${toy4 === null ? "n/a" : fmt(toy4.kinetic_J, 6)} | every solver step ½ m |v|²`,
  );
  md.push(
    `toy | ${toy8 === null ? "n/a" : fmt(toy8.t_s * 1000, 4)} | ${toy8 === null ? "n/a" : fmt(toy8.kinetic_J, 6)} | every solver step ½ m |v|²`,
  );
  md.push("");
  md.push("## Reading-rule outcome");
  md.push("");
  md.push(
    `Booleans: mass-match ${String(score.massMatch)}; oscillates ${String(score.oscillates)}; fires (a) mass-difference ${String(score.firesMass)} (b) ringing ${String(score.firesRinging)} (c) open ${String(score.firesOpen)}. Differing input: ${score.differingInput}.`,
  );
  md.push(`Outcome: ${score.outcomeLine}`);
  md.push("");
  md.push(NO_VERDICT_ROW);
  md.push(NO_FIX);

  const pageBody = [
    massRows.map((r) => `${r.name} mass ${fmt(r.mass_kg, 6)} kg (${pct(r.massVsToy)} vs toy)`).join("; ") + ".",
    ringingLine,
    score.outcomeLine,
    NO_VERDICT_ROW,
  ].join("\n");

  const payload: Record<string, unknown> = {
    kind: "deck-mass-work-lookups",
    status: "run",
    notAGate: true,
    outcomeLine: score.outcomeLine,
    pageBody,
    score,
    massRows,
    workRows: workOrdered,
    toyKeCount: toyKe.length,
    oscillates: score.oscillates,
  };

  return { missingRuns: false, md: md.join("\n") + "\n", payload, csv, svg };
}

function main(): void {
  const out = diagnoseDeckMassWorkLookups();
  writeFileSync(resolve(DIAG, "deck-mass-and-work-lookups-results.md"), out.md);
  writeFileSync(resolve(DIAG, "deck-mass-and-work-lookups-results.json"), `${JSON.stringify(out.payload, null, 2)}\n`);
  writeFileSync(resolve(DIAG, "deck-mass-work-lookups-toy-ke-4-to-8.csv"), out.csv);
  writeFileSync(resolve(DIAG, "deck-mass-work-lookups-ke-4-to-8.svg"), out.svg);
  writeFileSync(
    resolve(ROOT, "src/oracle/deck-mass-work-lookups-results.json"),
    `${JSON.stringify({ kind: out.payload["kind"], status: out.payload["status"], notAGate: true, outcomeLine: out.payload["outcomeLine"], pageBody: out.payload["pageBody"] }, null, 2)}\n`,
  );
  console.log(out.md);
}

const argv1 = process.argv[1];
if (argv1 !== undefined && fileURLToPath(import.meta.url) === resolve(argv1)) {
  main();
}
