/**
 * Production adaptive (6×16) metrics vs live .f64bin after THIRD/ACCELE fixes.
 *   OPENRADIOSS_PATH=... pnpm exec tsx scripts/compare-adaptive-prod.ts
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { exportTaylorRadiossDecks, formatRadiossF20 } from "../src/oracle/exportRadioss.js";
import { shapeFromF64bin, scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";

const orPath = process.env.OPENRADIOSS_PATH;
if (!orPath) throw new Error("OPENRADIOSS_PATH required");
const f20 = (v: number) => formatRadiossF20(v);
const endTime = 80e-6;
const model = createTaylorBarModel();
model.controls.endTime = endTime;
model.controls.runToEnd = true;
model.controls.adaptiveDt = true;

const decks = exportTaylorRadiossDecks(model);
const engine = `#RADIOSS ENGINE
/RUN/${decks.root}/1
${f20(endTime)}
/DT
${f20(model.controls.cfl)}${f20(0)}
/ANIM/DT
${f20(0)}${f20(endTime)}
/ANIM/NODA/DT
/STATE/DT/ALL
${f20(endTime)}${f20(endTime)}
/PRINT/-1/1
/MON/ON
/PARITH/OFF
/VERS/2023
`;
const workDir = "/tmp/or-adaptive-prod";
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
let r = spawnSync(join(orPath, "exec/starter_linux64_gf"), ["-i", `${decks.root}_0000.rad`], {
  cwd: workDir,
  encoding: "utf8",
  maxBuffer: 64 << 20,
});
if (r.status) throw new Error("starter " + (r.stderr || r.stdout).slice(-500));
r = spawnSync(join(orPath, "exec/engine_linux64_gf"), ["-i", `${decks.root}_0001.rad`], {
  cwd: workDir,
  encoding: "utf8",
  maxBuffer: 64 << 20,
});
if (r.status) throw new Error("engine " + (r.stderr || r.stdout).slice(-500));
const f64 = readdirSync(workDir)
  .filter((f) => f.endsWith(".f64bin") && !f.includes("_dt") && !f.startsWith("wmbd"))
  .sort()[0]!;
const live = shapeFromF64bin(
  readFileSync(join(workDir, f64)),
  model.reference!.length0,
  model.reference!.radius0,
);
const ts = solveExplicit(model);
const cmp = compareToOracle(ts.metrics, live);
const al = alignedCoordGap(scrubNearZeros(ts.coords), scrubNearZeros(live.coords));
const out = {
  mesh: { nSide: 6, nZ: 16 },
  f64,
  metricsBitwise: cmp.bitwiseEqual,
  lengthRelError: cmp.lengthRelError,
  radiusRelError: cmp.radiusRelError,
  coordsBitwise: al.bitwiseEqual,
  alignedMax: al.max,
  LfObjectIs: Object.is(ts.metrics.lengthRatio, live.lengthRatio),
  RfObjectIs: Object.is(ts.metrics.radiusRatio, live.radiusRatio),
  lengthRatio: { ours: ts.metrics.lengthRatio, live: live.lengthRatio },
  radiusRatio: { ours: ts.metrics.radiusRatio, live: live.radiusRatio },
};
writeFileSync("docs/research/adaptive-prod-after-third.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
