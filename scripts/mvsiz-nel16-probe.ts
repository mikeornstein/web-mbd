/**
 * PoC: multi-NEL (NEL=16) OR force path vs one-hex OR-ABI vs TS vs live .f64bin.
 * Coarse Taylor 2×2×4, fixed Δt=2.5e-8, steps 1..5.
 *
 *   OPENRADIOSS_PATH=... WMBD_OR_CALL_S8E=1 pnpm exec tsx scripts/mvsiz-nel16-probe.ts
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  assembleInternalForcesOrMesh,
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { exportTaylorRadiossDecks, formatRadiossF20 } from "../src/oracle/exportRadioss.js";
import { shapeFromF64bin, scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";

const fixedDt = 2.5e-8;
const maxSteps = Number(process.argv[2] ?? 5);
const nSide = 2;
const nZ = 4;

function f20(v: number): string {
  return formatRadiossF20(v);
}

function countDiffs(a: Float64Array, b: Float64Array): { n: number; maxAbs: number } {
  let n = 0;
  let maxAbs = 0;
  for (let i = 0; i < a.length; i++) {
    if (Object.is(a[i], b[i])) continue;
    n++;
    maxAbs = Math.max(maxAbs, Math.abs(a[i]! - b[i]!));
  }
  return { n, maxAbs };
}

function firstDiffs(ours: Float64Array, live: Float64Array, limit = 4) {
  const out: { i: number; node: number; dof: string; abs: number }[] = [];
  const names = ["x", "y", "z"];
  for (let i = 0; i < ours.length; i++) {
    if (Object.is(ours[i], live[i])) continue;
    out.push({
      i,
      node: Math.floor(i / 3),
      dof: names[i % 3]!,
      abs: Math.abs(ours[i]! - live[i]!),
    });
    if (out.length >= limit) break;
  }
  return out;
}

if (!loadOrForceKernel()) {
  console.error("libwmbd_or_hex.so missing — run relink-or-hex.sh");
  process.exit(2);
}
process.env["WMBD_OR_CALL_S8E"] = "1";

const orPath = process.env["OPENRADIOSS_PATH"];
if (!orPath) {
  console.error("OPENRADIOSS_PATH required");
  process.exit(2);
}

const results: unknown[] = [];

for (let steps = 1; steps <= maxSteps; steps++) {
  const endTime = fixedDt * steps;
  const make = () => {
    const m = createTaylorBarModel({ nSide, nZ });
    m.controls.endTime = endTime;
    m.controls.runToEnd = true;
    m.controls.fixedDt = fixedDt;
    m.controls.adaptiveDt = false;
    return m;
  };

  const ts = solveExplicit(make(), { maxWallMs: 120_000 });

  resetOrElementState();
  const or1 = solveExplicit(make(), {
    maxWallMs: 120_000,
    hexForce: (a) => hexInternalForcesOr(a),
  });

  resetOrElementState();
  let or16Error: string | null = null;
  let or16: ReturnType<typeof solveExplicit> | null = null;
  try {
    or16 = solveExplicit(make(), {
      maxWallMs: 120_000,
      assembleForces: (a) => assembleInternalForcesOrMesh(a),
    });
  } catch (e) {
    or16Error = e instanceof Error ? e.message : String(e);
  }

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
  const workDir = `/tmp/or-mvsiz-s${steps}`;
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
  if (r.status !== 0) throw new Error(`starter: ${(r.stdout ?? "").slice(-600)}`);
  r = spawnSync(join(orPath, "exec/engine_linux64_gf"), ["-i", join(workDir, `${decks.root}_0001.rad`), "-nt", "1"], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 32 << 20,
  });
  if (r.status !== 0) throw new Error(`engine: ${(r.stdout ?? "").slice(-600)}`);

  const staName = readdirSync(workDir)
    .filter((f) => f.endsWith(".sta"))
    .sort()[0];
  if (!staName) throw new Error("no .sta");
  const f64Path = join(workDir, staName.replace(/\.sta$/i, ".f64bin"));
  if (!existsSync(f64Path)) throw new Error(`missing ${f64Path}`);
  const live = shapeFromF64bin(readFileSync(f64Path), model.reference.length0, model.reference.radius0, {
    expectedNodes: model.mesh.coords.length / 3,
  });
  const liveScrub = scrubNearZeros(live.coords);

  const summarize = (label: string, ours: ReturnType<typeof solveExplicit>) => {
    const scrub = scrubNearZeros(ours.coords);
    const cmp = compareToOracle(ours.metrics, live);
    const al = alignedCoordGap(scrub, liveScrub);
    const diffs = countDiffs(scrub, liveScrub);
    return {
      label,
      metricsBitwise: cmp.bitwiseEqual,
      coordsBitwise: al.bitwiseEqual,
      alignedMax: al.max,
      diffs,
      first: firstDiffs(scrub, liveScrub),
      nSteps: ours.metrics.nSteps,
    };
  };

  const row = {
    steps,
    endTime,
    ts: summarize("ts", ts),
    orNel1: summarize("orNel1", or1),
    orNel16: or16 ? summarize("orNel16", or16) : { error: or16Error },
    tsVsOr16:
      or16 != null
        ? countDiffs(scrubNearZeros(ts.coords), scrubNearZeros(or16.coords))
        : null,
    or1VsOr16:
      or16 != null
        ? countDiffs(scrubNearZeros(or1.coords), scrubNearZeros(or16.coords))
        : null,
  };
  results.push(row);
  console.log(JSON.stringify(row, null, 2));
}

const outPath = process.argv[3] ?? "/tmp/mvsiz-nel16-probe.json";
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.error(`wrote ${outPath}`);
