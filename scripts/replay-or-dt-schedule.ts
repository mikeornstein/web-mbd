/**
 * Replay live OpenRadioss host DT schedule (`TAYLOR_dt.f64bin`) in web-mbd.
 * Requires patched engine (`ecrit.F` dump) + `.f64bin` nodes.
 *
 * Usage:
 *   OPENRADIOSS_PATH=... WMBD_OR_CALL_S8E=1 pnpm exec tsx scripts/replay-or-dt-schedule.ts
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

const DT_REC = 4 + 8 + 8; // int32 NCYCLE + f64 TT + f64 DT2

function parseDtSchedule(buf: Buffer): { ncycle: number; tt: number; dt2: number }[] {
  if (buf.byteLength % DT_REC !== 0) {
    throw new Error(`TAYLOR_dt.f64bin size ${buf.byteLength} not multiple of ${DT_REC}`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rows = [];
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

const nSide = Number(process.argv[2] ?? 2);
const nZ = Number(process.argv[3] ?? 4);
const wd = `/tmp/or-dt-replay-${nSide}x${nZ}`;
const model = createTaylorBarModel({ nSide, nZ });
model.controls.runToEnd = true;

const live = runOpenRadiossTaylorOracle(model, wd);
const dtPath = join(wd, "TAYLOR_dt.f64bin");
if (!existsSync(dtPath)) {
  console.error("missing TAYLOR_dt.f64bin — need patched ecrit.F engine");
  console.error("files:", readdirSync(wd).join(", "));
  process.exit(1);
}
const rows = parseDtSchedule(readFileSync(dtPath));
const schedule = rows.map((r) => r.dt2);
const useOr = process.env["WMBD_OR_CALL_S8E"] === "1" && loadOrForceKernel();

function run(label: string, sched: number[], orAbi: boolean) {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.runToEnd = true;
  m.controls.adaptiveDt = false;
  resetOrElementState();
  const ours = solveExplicit(m, {
    maxWallMs: 600_000,
    dtSchedule: sched,
    ...(orAbi ? { hexForce: (a) => hexInternalForcesOr(a) } : {}),
  });
  const cmp = compareToOracle(ours.metrics, live.metrics);
  const al = alignedCoordGap(scrubNearZeros(ours.coords), live.coords);
  return {
    label,
    steps: ours.metrics.nSteps,
    schedLen: sched.length,
    relLf: cmp.lengthRelError,
    relRf: cmp.radiusRelError,
    metricsBitwise: cmp.bitwiseEqual,
    LfObjectIs: Object.is(ours.metrics.lengthRatio, live.metrics.lengthRatio),
    RfObjectIs: Object.is(ours.metrics.radiusRatio, live.metrics.radiusRatio),
    alignedMax: al.max,
    coordsBitwise: al.bitwiseEqual,
  };
}

const results = [
  run("ts-all", schedule, false),
  ...(useOr ? [run("orAbi-all", schedule, true)] : []),
];

console.log(
  JSON.stringify(
    {
      mesh: { nSide, nZ },
      live: {
        coordSource: live.metrics.coordSource,
        Lf: live.metrics.lengthRatio,
        Rf: live.metrics.radiusRatio,
      },
      dtRecords: rows.length,
      first: rows[0],
      last: rows[rows.length - 1],
      results,
    },
    null,
    2,
  ),
);
