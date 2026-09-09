/**
 * Fixed-Δt OR-ABI (and TS jcvt:0) vs live OR host `.f64bin`.
 * Proves whether removing E20.13 unlocks Object.is on short horizons.
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { exportTaylorRadiossDecks } from "../src/oracle/exportRadioss.js";
import { shapeFromF64bin, scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import { shapeFromSta } from "../src/oracle/shapeFromSta.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { formatRadiossF20 } from "../src/oracle/exportRadioss.js";

function f20(v: number): string {
  return formatRadiossF20(v);
}

const fixedDt = Number(process.argv[2] ?? 2.5e-8);
const endTime = Number(process.argv[3] ?? 10e-6);
const nSide = Number(process.argv[4] ?? 2);
const nZ = Number(process.argv[5] ?? 4);

if (!loadOrForceKernel()) {
  console.error("libwmbd_or_hex.so missing");
  process.exit(2);
}

const make = () => {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.endTime = endTime;
  m.controls.runToEnd = true;
  m.controls.fixedDt = fixedDt;
  m.controls.adaptiveDt = false;
  return m;
};

resetOrElementState();
const orAbi = solveExplicit(make(), {
  maxWallMs: 600_000,
  hexForce: (a) => hexInternalForcesOr(a),
});
const ts0 = solveExplicit(make(), { maxWallMs: 600_000 });

const model = make();
const decks = exportTaylorRadiossDecks(model);
const engine = `#RADIOSS ENGINE
/RUN/${decks.root}/1
${f20(endTime)}
/DTIX
${f20(fixedDt)}${f20(fixedDt)}
/DT
${f20(1.0)}${f20(0)}
/ANIM/DT
${f20(0)}${f20(endTime)}
/ANIM/NODA/DT
/STATE/DT/ALL
${f20(endTime)}${f20(endTime)}
/PRINT/-1/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;
const workDir = `/tmp/or-f64-fixed-${endTime}`;
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

const orPath = process.env["OPENRADIOSS_PATH"]!;
const env = {
  ...process.env,
  RAD_CFG_PATH: join(orPath, "hm_cfg_files"),
  RAD_H3D_PATH: join(orPath, "extlib/h3d/lib/linux64"),
  OMP_STACKSIZE: "400m",
  OMP_NUM_THREADS: "1",
  LD_LIBRARY_PATH: [
    join(orPath, "extlib/hm_reader/linux64"),
    join(orPath, "extlib/h3d/lib/linux64"),
    process.env["LD_LIBRARY_PATH"] ?? "",
  ].join(":"),
};
let r = spawnSync(
  join(orPath, "exec/starter_linux64_gf"),
  ["-i", join(workDir, `${decks.root}_0000.rad`), "-np", "1", "-nt", "1"],
  { cwd: workDir, env, encoding: "utf8", maxBuffer: 32 << 20 },
);
if (r.status !== 0) throw new Error(`starter: ${r.stdout.slice(-800)}`);
r = spawnSync(join(orPath, "exec/engine_linux64_gf"), ["-i", join(workDir, `${decks.root}_0001.rad`), "-nt", "1"], {
  cwd: workDir,
  env,
  encoding: "utf8",
  maxBuffer: 32 << 20,
});
if (r.status !== 0) throw new Error(`engine: ${r.stdout.slice(-800)}`);

const staName = readdirSync(workDir)
  .filter((f) => f.endsWith(".sta"))
  .sort()[0];
if (!staName) throw new Error(`no .sta in ${workDir}: ${readdirSync(workDir).join(",")}`);
const f64Path = join(workDir, staName.replace(/\.sta$/i, ".f64bin"));
if (!existsSync(f64Path)) throw new Error(`missing ${f64Path}`);

const live = shapeFromF64bin(
  readFileSync(f64Path),
  model.reference.length0,
  model.reference.radius0,
  { expectedNodes: model.mesh.coords.length / 3 },
);
const sta = shapeFromSta(
  readFileSync(join(workDir, staName), "utf8"),
  model.reference.length0,
  model.reference.radius0,
);

const orVsLive = compareToOracle(orAbi.metrics, live);
const orAl = alignedCoordGap(scrubNearZeros(orAbi.coords), live.coords);
const tsVsLive = compareToOracle(ts0.metrics, live);
const tsAl = alignedCoordGap(scrubNearZeros(ts0.coords), live.coords);
const staVsF64 = alignedCoordGap(sta.coords, live.coords);

console.log(
  JSON.stringify(
    {
      fixedDt,
      endTime,
      steps: { orAbi: orAbi.metrics.nSteps, ts0: ts0.metrics.nSteps },
      live: { Lf: live.lengthRatio, Rf: live.radiusRatio },
      staVsF64: { alignedMax: staVsF64.max, bitwise: staVsF64.bitwiseEqual },
      orAbiVsF64: {
        relLf: orVsLive.lengthRelError,
        relRf: orVsLive.radiusRelError,
        metricsBitwise: orVsLive.bitwiseEqual,
        alignedMax: orAl.max,
        coordsBitwise: orAl.bitwiseEqual,
      },
      ts0VsF64: {
        relLf: tsVsLive.lengthRelError,
        relRf: tsVsLive.radiusRelError,
        metricsBitwise: tsVsLive.bitwiseEqual,
        alignedMax: tsAl.max,
        coordsBitwise: tsAl.bitwiseEqual,
      },
    },
    null,
    2,
  ),
);
