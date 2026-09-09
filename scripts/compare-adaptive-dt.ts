/**
 * Bit-compare web-mbd adaptive DT2 schedule vs live `TAYLOR_dt.f64bin`.
 *
 *   OPENRADIOSS_PATH=... pnpm exec tsx scripts/compare-adaptive-dt.ts
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { exportTaylorRadiossDecks, formatRadiossF20 } from "../src/oracle/exportRadioss.js";
import { shapeFromF64bin, scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";

const DT_REC = 4 + 8 + 8;
const endTime = 80e-6;
const nSide = 2;
const nZ = 4;
const orPath = process.env.OPENRADIOSS_PATH;
if (!orPath) throw new Error("OPENRADIOSS_PATH required");

function f20(v: number): string {
  return formatRadiossF20(v);
}

function parseDt(buf: Buffer) {
  if (buf.byteLength % DT_REC !== 0) {
    throw new Error(`TAYLOR_dt.f64bin size ${buf.byteLength}`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rows: { ncycle: number; tt: number; dt2: number }[] = [];
  for (let i = 0; i < buf.byteLength / DT_REC; i++) {
    const off = i * DT_REC;
    rows.push({
      ncycle: view.getInt32(off, true),
      tt: view.getFloat64(off + 4, true),
      dt2: view.getFloat64(off + 12, true),
    });
  }
  return rows;
}

function make() {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.endTime = endTime;
  m.controls.runToEnd = true;
  m.controls.adaptiveDt = true;
  m.controls.fixedDt = undefined;
  return m;
}

function runLive() {
  const model = make();
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
  const workDir = `/tmp/or-adaptive-dt-${nSide}x${nZ}`;
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
  const dtPath = join(workDir, "TAYLOR_dt.f64bin");
  if (!existsSync(dtPath)) throw new Error(`missing ${dtPath}`);
  const f64 = readdirSync(workDir).filter((f) => f.endsWith(".f64bin") && f !== "TAYLOR_dt.f64bin").sort()[0]!;
  return {
    workDir,
    rows: parseDt(readFileSync(dtPath)),
    shape: shapeFromF64bin(
      readFileSync(join(workDir, f64)),
      model.reference.length0,
      model.reference.radius0,
    ),
  };
}

const live = runLive();
const ts = solveExplicit(make(), { maxWallMs: 120_000, recordDtHistory: true });
const ours = ts.dtHistory!;
const liveDt = live.rows.map((r) => r.dt2);

let firstMismatch = -1;
let firstAbs = 0;
const n = Math.min(ours.length, liveDt.length);
for (let i = 0; i < n; i++) {
  if (!Object.is(ours[i], liveDt[i])) {
    firstMismatch = i;
    firstAbs = Math.abs(ours[i]! - liveDt[i]!);
    break;
  }
}

const cmp = compareToOracle(ts.metrics, live.shape);
const al = alignedCoordGap(scrubNearZeros(ts.coords), scrubNearZeros(live.shape.coords));

const report = {
  mesh: { nSide, nZ },
  endTime,
  liveRows: live.rows.length,
  oursSteps: ours.length,
  dt0ObjectIs: Object.is(ours[0], liveDt[0]),
  dt0: { ours: ours[0], live: liveDt[0] },
  firstMismatch,
  firstMismatchDetail:
    firstMismatch >= 0
      ? {
          i: firstMismatch,
          ncycleLive: live.rows[firstMismatch]?.ncycle,
          ttLive: live.rows[firstMismatch]?.tt,
          ours: ours[firstMismatch],
          live: liveDt[firstMismatch],
          abs: firstAbs,
          rel: firstAbs / Math.max(Math.abs(liveDt[firstMismatch]!), 1e-30),
          oursPrev: firstMismatch > 0 ? ours[firstMismatch - 1] : null,
          livePrev: firstMismatch > 0 ? liveDt[firstMismatch - 1] : null,
        }
      : null,
  nMatchPrefix: firstMismatch < 0 ? n : firstMismatch,
  lenEqual: ours.length === liveDt.length,
  shape: {
    metricsBitwise: cmp.bitwiseEqual,
    lengthRelError: cmp.lengthRelError,
    radiusRelError: cmp.radiusRelError,
    coordsBitwise: al.bitwiseEqual,
    alignedMax: al.max,
    LfObjectIs: Object.is(ts.metrics.lengthRatio, live.shape.lengthRatio),
    RfObjectIs: Object.is(ts.metrics.radiusRatio, live.shape.radiusRatio),
  },
};

writeFileSync("docs/research/adaptive-dt-compare.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
