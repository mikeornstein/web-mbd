/**
 * Fixed-Δt Object.is sweep steps 1..5 (TS jcvt:0 vs live `.f64bin`).
 *
 *   OPENRADIOSS_PATH=... pnpm exec tsx scripts/step1-5-object-is.ts
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { exportTaylorRadiossDecks, formatRadiossF20 } from "../src/oracle/exportRadioss.js";
import { shapeFromF64bin, scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";

const fixedDt = 2.5e-8;
const f20 = (v: number) => formatRadiossF20(v);
const orPath = process.env.OPENRADIOSS_PATH;
if (!orPath) throw new Error("OPENRADIOSS_PATH required");

function make(steps: number) {
  const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
  m.controls.endTime = fixedDt * steps;
  m.controls.runToEnd = true;
  m.controls.fixedDt = fixedDt;
  m.controls.adaptiveDt = false;
  return m;
}

function runLive(steps: number) {
  const model = make(steps);
  const decks = exportTaylorRadiossDecks(model);
  const engine = `#RADIOSS ENGINE
/RUN/${decks.root}/1
${f20(fixedDt * steps)}
/DTIX
${f20(fixedDt)}${f20(fixedDt)}
/DT
${f20(1.0)}${f20(0)}
/ANIM/DT
${f20(0)}${f20(fixedDt * steps)}
/ANIM/NODA/DT
/STATE/DT/ALL
${f20(fixedDt * steps)}${f20(fixedDt * steps)}
/PRINT/-1/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;
  const workDir = `/tmp/or-step15-s${steps}`;
  mkdirSync(workDir, { recursive: true });
  for (const f of readdirSync(workDir)) {
    try {
      unlinkSync(join(workDir, f));
    } catch {
      /* */
    }
  }
  writeFileSync(join(workDir, `${decks.root}_0000.rad`), decks.starter);
  writeFileSync(join(workDir, `${decks.root}_0001.rad`), engine);
  const starter = join(orPath, "exec/starter_linux64_gf");
  const engineBin = join(orPath, "exec/engine_linux64_gf");
  let r = spawnSync(starter, ["-i", `${decks.root}_0000.rad`], {
    cwd: workDir,
    encoding: "utf8",
    maxBuffer: 32 << 20,
  });
  if (r.status) throw new Error(`starter: ${(r.stderr || r.stdout).slice(-800)}`);
  r = spawnSync(engineBin, ["-i", `${decks.root}_0001.rad`], {
    cwd: workDir,
    encoding: "utf8",
    maxBuffer: 32 << 20,
  });
  if (r.status) throw new Error(`engine: ${(r.stderr || r.stdout).slice(-800)}`);
  const f64 = readdirSync(workDir).filter((f) => f.endsWith(".f64bin")).sort()[0]!;
  return shapeFromF64bin(
    readFileSync(join(workDir, f64)),
    model.reference.length0,
    model.reference.radius0,
  );
}

const rows = [];
for (const steps of [1, 2, 3, 4, 5]) {
  const live = runLive(steps);
  const ts = solveExplicit(make(steps), { maxWallMs: 60_000 });
  const liveScrub = scrubNearZeros(live.coords);
  const tsScrub = scrubNearZeros(ts.coords);
  const gap = alignedCoordGap(tsScrub, liveScrub);
  const met = compareToOracle(ts.metrics, live);
  let n = 0;
  let maxAbs = 0;
  let maxI = -1;
  for (let i = 0; i < tsScrub.length; i++) {
    if (Object.is(tsScrub[i], liveScrub[i])) continue;
    n++;
    const d = Math.abs(tsScrub[i]! - liveScrub[i]!);
    if (d > maxAbs) {
      maxAbs = d;
      maxI = i;
    }
  }
  const row = {
    steps,
    coordsObjectIs: gap.bitwiseEqual,
    metricsObjectIs: met.bitwiseEqual,
    nDiff: n,
    maxAbs,
    maxNode: maxI >= 0 ? Math.floor(maxI / 3) : null,
    lengthRelError: met.lengthRelError,
    radiusRelError: met.radiusRelError,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}

const out = {
  fixedDt,
  note: "TS jcvt:0 vs live .f64bin after s8edefo3 GradN·v + engineering D4",
  rows,
};
writeFileSync("docs/research/step1-5-object-is.json", JSON.stringify(out, null, 2));
console.log("wrote docs/research/step1-5-object-is.json");
