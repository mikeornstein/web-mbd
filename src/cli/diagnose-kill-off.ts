import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solveInflate } from "../fe/inflateSolver.js";
import { INFLATE_BANDS } from "../oracle/compareInflate.js";
import {
  compareKillOffRun,
  firstStretchGe2,
  type KillOffFrame,
  type KillOffRunCompare,
  nearestFrame,
  stretchMovedToward,
} from "../oracle/killOffCompare.js";
import {
  buildKillOffModel,
  parseKillEnv,
  parseKillSwitch,
  parseMeshKind,
  type KillOffMeshKind,
  type KillSwitch,
} from "../oracle/killOffModel.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const DEFAULT_JSON = resolve(DIAG, "kill-off-results.json");
const DEFAULT_MD = resolve(DIAG, "kill-off-results.md");

type RadiossTapeName = "oriented-ismstr2-metrics.json" | "unoriented-opencourant-metrics.json";

interface ToyHistoryLock {
  frames: KillOffFrame[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`kill-off: bad ${label}`);
  return v;
}

function parseToyHistoryLock(raw: unknown): ToyHistoryLock {
  if (!isRecord(raw)) throw new Error("kill-off: toy-history.json is not an object");
  const framesRaw = raw["frames"];
  if (!Array.isArray(framesRaw)) throw new Error("kill-off: toy-history frames missing");
  const frames: KillOffFrame[] = framesRaw.map((row, i) => {
    if (!isRecord(row)) throw new Error(`kill-off: toy-history[${String(i)}] not an object`);
    return {
      frame: num(row["frame"], `toy-history[${String(i)}].frame`),
      t: num(row["t"], `toy-history[${String(i)}].t`),
      lambdaMax: num(row["lambdaMax"], `toy-history[${String(i)}].lambdaMax`),
      p_Pa: num(row["p_Pa"], `toy-history[${String(i)}].p_Pa`),
      V_mL: num(row["V_mL"], `toy-history[${String(i)}].V_mL`),
    };
  });
  return { frames };
}

function parseRadiossTape(raw: unknown, label: string): KillOffFrame[] {
  if (!Array.isArray(raw)) throw new Error(`kill-off: ${label} is not an array`);
  return raw.map((row, i) => {
    if (!isRecord(row)) throw new Error(`kill-off: ${label}[${String(i)}] not an object`);
    return {
      frame: num(row["frame"], `${label}[${String(i)}].frame`),
      t: num(row["t"], `${label}[${String(i)}].t`),
      lambdaMax: num(row["lam_max"], `${label}[${String(i)}].lam_max`),
      p_Pa: num(row["p_Pa"], `${label}[${String(i)}].p_Pa`),
      V_mL: num(row["V_mL"], `${label}[${String(i)}].V_mL`),
    };
  });
}

function loadRadioss(name: RadiossTapeName): KillOffFrame[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(DIAG, name), "utf8"));
  return parseRadiossTape(raw, name);
}

function loadLockedOrientedKillOn(): KillOffFrame[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(DIAG, "toy-history.json"), "utf8"));
  return parseToyHistoryLock(raw).frames;
}

function toyFramesFromSolve(lambdaHistory: number[], pressureHistory: number[], volumeHistory: number[], historyT: number[]): KillOffFrame[] {
  const n = lambdaHistory.length;
  if (pressureHistory.length !== n || volumeHistory.length !== n || historyT.length !== n) {
    throw new Error("kill-off: history arrays length mismatch");
  }
  const frames: KillOffFrame[] = [];
  for (let i = 0; i < n; i++) {
    frames.push({
      frame: i,
      t: historyT[i]!,
      lambdaMax: lambdaHistory[i]!,
      p_Pa: pressureHistory[i]!,
      V_mL: volumeHistory[i]! * 1e6,
    });
  }
  return frames;
}

function pct(rel: number | null): string {
  if (rel === null) return "n/a";
  return `${(100 * rel).toFixed(2)}%`;
}

function fmt(n: number | null | undefined, digits: number): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function rowMarkdown(row: KillOffRunCompare["table"][number], label: string): string {
  const toyLam = row.toy?.lambdaMax ?? null;
  const radLam = row.radioss?.lambdaMax ?? null;
  const toyV = row.toy?.V_mL ?? null;
  const radV = row.radioss?.V_mL ?? null;
  const toyP = row.toy?.p_Pa ?? null;
  const radP = row.radioss?.p_Pa ?? null;
  const band =
    row.insideBands === null ? "Radioss missing or toy missing" : row.insideBands ? "inside" : "outside";
  return `| ${label} | ${fmt(toyLam, 3)} | ${fmt(radLam, 3)} | ${pct(row.lambdaRel)} | ${fmt(toyV, 1)} | ${fmt(radV, 1)} | ${pct(row.volumeRel)} | ${fmt(toyP === null ? null : toyP / 1000, 2)} | ${fmt(radP === null ? null : radP / 1000, 2)} | ${pct(row.pressureRel)} | ${band} |`;
}

interface RunSpec {
  id: "A" | "B" | "C";
  title: string;
  mesh: KillOffMeshKind;
  kill: KillSwitch;
  radiossName: RadiossTapeName;
}

const ALL_RUNS: RunSpec[] = [
  {
    id: "A",
    title: "oriented mesh, velocity kill off",
    mesh: "oriented",
    kill: "off",
    radiossName: "oriented-ismstr2-metrics.json",
  },
  {
    id: "B",
    title: "unoriented mesh, velocity kill off",
    mesh: "unoriented",
    kill: "off",
    radiossName: "unoriented-opencourant-metrics.json",
  },
  {
    id: "C",
    title: "unoriented mesh, velocity kill on (baseline)",
    mesh: "unoriented",
    kill: "on",
    radiossName: "unoriented-opencourant-metrics.json",
  },
];

interface RunResult {
  spec: RunSpec;
  meshFingerprint: string;
  nSteps: number;
  elapsedMs: number;
  frames: KillOffFrame[];
  compare: KillOffRunCompare;
}

function solveOne(spec: RunSpec): RunResult {
  const model = buildKillOffModel({ mesh: spec.mesh, kill: spec.kill });
  const result = solveInflate(model, {
    maxWallMs: 600_000,
    continuePastWarn: true,
    signedRestVolume: spec.mesh === "unoriented",
  });
  const frames = toyFramesFromSolve(
    result.lambdaHistory,
    result.pressureHistory,
    result.volumeHistory,
    result.history.map((s) => s.t),
  );
  const radioss = loadRadioss(spec.radiossName);
  return {
    spec,
    meshFingerprint: result.metrics.meshFingerprint,
    nSteps: result.metrics.nSteps,
    elapsedMs: result.metrics.elapsedMs,
    frames,
    compare: compareKillOffRun(frames, radioss),
  };
}

function parseArgs(argv: string[]): {
  all: boolean;
  mesh: KillOffMeshKind | null;
  kill: KillSwitch | null;
  jsonPath: string;
  mdPath: string;
} {
  let all = false;
  let mesh: KillOffMeshKind | null = null;
  let kill: KillSwitch | null = parseKillEnv(process.env);
  let jsonPath = DEFAULT_JSON;
  let mdPath = DEFAULT_MD;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--all") {
      all = true;
      continue;
    }
    if (a === "--mesh") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error("--mesh needs oriented or unoriented");
      mesh = parseMeshKind(v);
      i += 1;
      continue;
    }
    if (a === "--kill") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error("--kill needs on or off");
      kill = parseKillSwitch(v);
      i += 1;
      continue;
    }
    if (a === "--out") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error("--out needs a json path");
      jsonPath = resolve(v);
      i += 1;
      continue;
    }
    if (a === "--md") {
      const v = argv[i + 1];
      if (v === undefined) throw new Error("--md needs a markdown path");
      mdPath = resolve(v);
      i += 1;
      continue;
    }
    throw new Error(`unknown argument ${a}`);
  }
  return { all, mesh, kill, jsonPath, mdPath };
}

function serializeCompare(cmp: KillOffRunCompare): unknown {
  return {
    table: cmp.table,
    firstStretchGe2: cmp.firstStretchGe2,
    maxLambdaRel: cmp.maxLambdaRel,
    maxVolumeRel: cmp.maxVolumeRel,
    maxPressureRel: cmp.maxPressureRel,
    overlappingFrames: cmp.overlappingFrames,
    wholeRunInsideBands: cmp.wholeRunInsideBands,
  };
}

function writeMarkdown(runs: RunResult[], lockedOrientedKillOn: KillOffFrame[], predictionSha: string): string {
  const orientedRadioss = loadRadioss("oriented-ismstr2-metrics.json");
  const unorientedRadioss = loadRadioss("unoriented-opencourant-metrics.json");
  const lockedOnVsOriented = compareKillOffRun(lockedOrientedKillOn, orientedRadioss);
  const runA = runs.find((r) => r.spec.id === "A");
  const runB = runs.find((r) => r.spec.id === "B");
  const runC = runs.find((r) => r.spec.id === "C");
  if (runA === undefined || runB === undefined || runC === undefined) {
    throw new Error("kill-off: expected runs A, B, and C");
  }

  const rad2 = nearestFrame(orientedRadioss, 0.002);
  const locked2 = nearestFrame(lockedOrientedKillOn, 0.002);
  const a2 = nearestFrame(runA.frames, 0.002);
  if (rad2 === null || locked2 === null || a2 === null) {
    throw new Error("kill-off: missing 2 ms samples");
  }
  const moved = stretchMovedToward(locked2.lambdaMax, a2.lambdaMax, rad2.lambdaMax);
  const wholeOk = runA.compare.wholeRunInsideBands;
  const baseline2 = nearestFrame(unorientedRadioss, 0.002);
  const cWarn = runC.compare.firstStretchGe2;
  const baselineHeld =
    cWarn.insideBands === true &&
    cWarn.lambdaRel !== null &&
    cWarn.lambdaRel <= 0.01 &&
    cWarn.volumeRel !== null &&
    cWarn.volumeRel <= 0.01 &&
    cWarn.pressureRel !== null &&
    cWarn.pressureRel <= 0.01;

  const killDeltaOriented2 = a2.lambdaMax - locked2.lambdaMax;
  const b2 = nearestFrame(runB.frames, 0.002);
  const c2 = nearestFrame(runC.frames, 0.002);
  const killDeltaUnoriented2 =
    b2 !== null && c2 !== null ? b2.lambdaMax - c2.lambdaMax : null;
  const meshDeltaKillOn2 = c2 !== null ? c2.lambdaMax - locked2.lambdaMax : null;
  const meshDeltaKillOff2 = b2 !== null ? b2.lambdaMax - a2.lambdaMax : null;

  const predictionSupported = moved && wholeOk;
  const predictionRefuted = !predictionSupported;

  const lines: string[] = [
    "# Kill-off experiment results",
    "",
    "Diagnosis only. Default toy still uses the 0.18 velocity kill. Bands stay",
    "2% / 5% / 5%. Shear modulus and the load law were not touched.",
    "",
    `Prediction file was committed first at \`${predictionSha}\`.`,
    "",
    "## Verdict",
    "",
  ];

  if (predictionRefuted) {
    lines.push(
      "**The prediction is refuted.** Switching the 0.18 velocity kill off does not make stretch, volume, and pressure stay inside 2% / 5% / 5% of Radioss over the whole overlapping run.",
    );
  } else {
    lines.push(
      "**The prediction is supported** on this tape: 2 ms stretch moved toward Radioss, and the overlapping run stayed inside the bands. No scale number was fitted.",
    );
  }
  lines.push("");
  lines.push(
    `- Oriented 2 ms stretch with kill **on** (locked default): **${locked2.lambdaMax.toFixed(3)}** vs Radioss **${rad2.lambdaMax.toFixed(3)}**.`,
  );
  lines.push(
    `- Oriented 2 ms stretch with kill **off** (run A): **${a2.lambdaMax.toFixed(3)}**. Moved toward Radioss: **${moved ? "yes" : "no"}**.`,
  );
  lines.push(
    `- Run A whole overlapping run inside 2/5/5: **${wholeOk ? "yes" : "no"}** (max stretch error ${pct(runA.compare.maxLambdaRel)}, volume ${pct(runA.compare.maxVolumeRel)}, pressure ${pct(runA.compare.maxPressureRel)} over ${String(runA.compare.overlappingFrames)} frames).`,
  );
  lines.push(
    `- Unoriented kill **on** baseline (run C) still matches the old tape at first stretch of 2 or more: **${baselineHeld ? "yes" : "no"}** (stretch error ${pct(cWarn.lambdaRel)}, volume ${pct(cWarn.volumeRel)}, pressure ${pct(cWarn.pressureRel)}).`,
  );
  lines.push("");
  lines.push("Matching a single frame does not count. No scale number was picked afterward.");
  lines.push("");
  lines.push("## How much is the kill vs the mesh");
  lines.push("");
  lines.push("Stretch at 2 ms:");
  lines.push("");
  lines.push(
    `- Kill off vs on, **oriented** mesh: ${killDeltaOriented2 >= 0 ? "+" : ""}${killDeltaOriented2.toFixed(3)} (this is the kill's effect on the new mesh).`,
  );
  if (killDeltaUnoriented2 !== null) {
    lines.push(
      `- Kill off vs on, **unoriented** mesh: ${killDeltaUnoriented2 >= 0 ? "+" : ""}${killDeltaUnoriented2.toFixed(3)} (same kill, old mesh).`,
    );
  }
  if (meshDeltaKillOn2 !== null) {
    lines.push(
      `- Unoriented vs oriented, kill **on**: ${meshDeltaKillOn2 >= 0 ? "+" : ""}${meshDeltaKillOn2.toFixed(3)} (mesh orientation, default kill).`,
    );
  }
  if (meshDeltaKillOff2 !== null) {
    lines.push(
      `- Unoriented vs oriented, kill **off**: ${meshDeltaKillOff2 >= 0 ? "+" : ""}${meshDeltaKillOff2.toFixed(3)} (mesh orientation, kill off).`,
    );
  }
  if (baseline2) {
    lines.push(
      `- Radioss itself at 2 ms: oriented ${rad2.lambdaMax.toFixed(3)}, unoriented ${baseline2.lambdaMax.toFixed(3)} (mesh orientation in the engine tape).`,
    );
  }
  lines.push("");

  const header =
    "| time | toy stretch | Radioss stretch | stretch error | toy volume (mL) | Radioss volume (mL) | volume error | toy p (kPa) | Radioss p (kPa) | pressure error | bands |";
  const sep = "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |";

  for (const run of runs) {
    lines.push(`## Run ${run.spec.id}: ${run.spec.title}`);
    lines.push("");
    lines.push(
      `Mesh fingerprint \`${run.meshFingerprint}\`. Steps ${String(run.nSteps)}. Wall ${run.elapsedMs.toFixed(0)} ms.`,
    );
    lines.push("");
    lines.push(header);
    lines.push(sep);
    for (const row of run.compare.table) {
      lines.push(rowMarkdown(row, `${row.t_ms.toFixed(0)} ms`));
    }
    const warnLabel =
      run.compare.firstStretchGe2.radioss !== null
        ? `first Radioss stretch ≥ 2 (${(run.compare.firstStretchGe2.radioss.t * 1e3).toFixed(1)} ms)`
        : "first stretch ≥ 2";
    lines.push(rowMarkdown(run.compare.firstStretchGe2, warnLabel));
    lines.push("");
    lines.push(
      `Maximum error over ${String(run.compare.overlappingFrames)} overlapping frames: stretch ${pct(run.compare.maxLambdaRel)}, volume ${pct(run.compare.maxVolumeRel)}, pressure ${pct(run.compare.maxPressureRel)}. Whole run inside 2/5/5: **${run.compare.wholeRunInsideBands ? "yes" : "no"}**.`,
    );
    const toyWarn = firstStretchGe2(run.frames);
    if (toyWarn !== null) {
      lines.push(
        `Toy first stretch ≥ 2: frame ${String(toyWarn.frame)}, t = ${(toyWarn.t * 1e3).toFixed(2)} ms, stretch ${toyWarn.lambdaMax.toFixed(3)}, ${toyWarn.V_mL.toFixed(1)} mL, ${(toyWarn.p_Pa / 1000).toFixed(2)} kPa.`,
      );
    } else {
      lines.push("Toy never reached stretch 2.");
    }
    lines.push("");
  }

  lines.push("## Locked default (oriented, kill on) — not re-run");
  lines.push("");
  lines.push("From `toy-history.json`, versus the oriented Radioss tape. Default behavior.");
  lines.push("");
  lines.push(header);
  lines.push(sep);
  for (const row of lockedOnVsOriented.table) {
    lines.push(rowMarkdown(row, `${row.t_ms.toFixed(0)} ms`));
  }
  lines.push(rowMarkdown(lockedOnVsOriented.firstStretchGe2, "first Radioss stretch ≥ 2"));
  lines.push("");
  lines.push(
    `Maximum error over ${String(lockedOnVsOriented.overlappingFrames)} overlapping frames: stretch ${pct(lockedOnVsOriented.maxLambdaRel)}, volume ${pct(lockedOnVsOriented.maxVolumeRel)}, pressure ${pct(lockedOnVsOriented.maxPressureRel)}.`,
  );
  lines.push("");
  lines.push("Bands used: stretch 2%, volume 5%, pressure 5%. They were not widened.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const specs = args.all
    ? ALL_RUNS
    : [
        {
          id: "A" as const,
          title: "single diagnostic run",
          mesh: args.mesh ?? "oriented",
          kill: args.kill ?? "off",
          radiossName:
            (args.mesh ?? "oriented") === "unoriented"
              ? ("unoriented-opencourant-metrics.json" as const)
              : ("oriented-ismstr2-metrics.json" as const),
        },
      ];
  if (!args.all && args.mesh === null && args.kill === null) {
    console.log("No --mesh/--kill/--all. Refusing to guess. Default toy is unchanged.");
    process.exit(2);
  }

  console.log("kill-off diagnosis: default createInflateAModel is not used as the compare:inflate path.");
  console.log(`runs: ${specs.map((s) => `${s.mesh}/kill-${s.kill}`).join(", ")}`);

  const runs = specs.map((spec) => {
    console.log(`solving ${spec.id}: mesh ${spec.mesh}, kill ${spec.kill}`);
    const run = solveOne(spec);
    console.log(
      `  fingerprint ${run.meshFingerprint}, steps ${String(run.nSteps)}, max stretch error ${pct(run.compare.maxLambdaRel)}`,
    );
    return run;
  });

  if (!args.all) {
    console.log(JSON.stringify({ run: runs[0], compare: serializeCompare(runs[0]!.compare) }, null, 2));
    return;
  }

  const lockedOrientedKillOn = loadLockedOrientedKillOn();
  const predictionSha = "69566c72ea2ccbae5b7125223c481b0e52d6e045";
  const payload = {
    kind: "kill-off-diagnosis",
    predictionFile: "docs/diag-pr18-openradioss-control/kill-off-prediction.md",
    predictionCommit: predictionSha,
    bands: INFLATE_BANDS,
    defaultToyUnchanged: {
      kineticDamping: true,
      kineticDampingScale: 0.18,
      note: "createInflateAModel and compare:inflate were not pointed at these runs",
    },
    runs: runs.map((run) => ({
      id: run.spec.id,
      title: run.spec.title,
      mesh: run.spec.mesh,
      kill: run.spec.kill,
      meshFingerprint: run.meshFingerprint,
      nSteps: run.nSteps,
      elapsedMs: run.elapsedMs,
      frames: run.frames,
      compare: serializeCompare(run.compare),
    })),
  };
  mkdirSync(dirname(args.jsonPath), { recursive: true });
  writeFileSync(args.jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(args.mdPath, writeMarkdown(runs, lockedOrientedKillOn, predictionSha));
  console.log(`wrote ${args.jsonPath}`);
  console.log(`wrote ${args.mdPath}`);
}

main();
