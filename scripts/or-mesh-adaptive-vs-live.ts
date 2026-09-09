/**
 * Native adaptive CFL with OR mesh SCUMU3 assemble vs live `.f64bin`.
 * Usage: pnpm exec tsx scripts/or-mesh-adaptive-vs-live.ts [endTime] [nSide] [nZ]
 *
 * Env:
 *   WMBD_OR_LIVE_MS=1 — inject live NODES%MS from wmbd_postforint_0 (isolates
 *   FORINT path; production 6×6×16 reaches Object.is with this).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

const endTime = Number(process.argv[2] ?? 80e-6);
const nSide = Number(process.argv[3] ?? 2);
const nZ = Number(process.argv[4] ?? 4);
const useLiveMs = process.env["WMBD_OR_LIVE_MS"] === "1";

function parseLiveMs(dir: string): Float64Array | undefined {
  const path = join(dir, "wmbd_postforint_0.f64bin");
  if (!existsSync(path)) return undefined;
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 4;
  const numnod = view.getInt32(o, true);
  o += 4 + 24;
  const ms = new Float64Array(numnod);
  const ids = new Int32Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4 + 72;
    ms[i] = view.getFloat64(o, true);
    o += 8;
  }
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  return Float64Array.from(order, (i) => ms[i]!);
}

if (!loadOrForceKernel()) {
  console.error("OR kernel missing");
  process.exit(2);
}

const make = () => {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.endTime = endTime;
  m.controls.runToEnd = true;
  m.controls.adaptiveDt = true;
  m.controls.fixedDt = undefined;
  return m;
};

process.env["WMBD_OR_CALL_S8E"] = "1";
const liveDir = `/tmp/or-mesh-adapt-${nSide}x${nZ}-${endTime}`;
const live = runOpenRadiossTaylorOracle(make(), liveDir);
const liveMs = useLiveMs ? parseLiveMs(liveDir) : undefined;
resetOrElementState();
const orMesh = solveExplicit(make(), {
  maxWallMs: 600_000,
  assembleForces: (a) => assembleInternalForcesOrMesh(a),
  ...(liveMs ? { nodalMasses: liveMs } : {}),
});
const ts = solveExplicit(make(), { maxWallMs: 600_000 });

const liveCoords = scrubNearZeros(live.coords);
const out = {
  endTime,
  mesh: { nSide, nZ },
  liveMsInjected: Boolean(liveMs),
  live: {
    Lf: live.metrics.lengthRatio,
    Rf: live.metrics.radiusRatio,
    coordSource: live.metrics.coordSource,
  },
  orMesh: {
    steps: orMesh.metrics.nSteps,
    vsLive: {
      ...compareToOracle(orMesh.metrics, live.metrics),
      ...alignedCoordGap(scrubNearZeros(orMesh.coords), liveCoords),
      LfObjectIs: Object.is(orMesh.metrics.lengthRatio, live.metrics.lengthRatio),
      RfObjectIs: Object.is(orMesh.metrics.radiusRatio, live.metrics.radiusRatio),
    },
  },
  ts: {
    steps: ts.metrics.nSteps,
    vsLive: {
      ...compareToOracle(ts.metrics, live.metrics),
      ...alignedCoordGap(scrubNearZeros(ts.coords), liveCoords),
    },
  },
};
console.log(JSON.stringify(out, null, 2));
