import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { exportTaylorRadiossDecks } from "../src/oracle/exportRadioss.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { selectEndTimeSta } from "../src/cli/openRadiossRunner.js";

function f20(v: number): string {
  return v.toExponential(10).padStart(20);
}

function runAtEndTime(tEnd: number, label: string): void {
  const model = createTaylorBarModel();
  model.controls.endTime = tEnd;
  const fixedDt = 2.5e-8;
  model.controls.fixedDt = fixedDt;
  model.controls.adaptiveDt = false;

  const decks = exportTaylorRadiossDecks(model);
  const engine = `#RADIOSS ENGINE
/RUN/${decks.root}/1
${f20(tEnd)}
/DTIX
${f20(fixedDt)}${f20(fixedDt)}
/DT
${f20(1.0)}${f20(0)}
/ANIM/DT
${f20(0)}${f20(tEnd)}
/ANIM/NODA/DT
/STATE/DT/ALL
${f20(tEnd)}${f20(tEnd)}
/PRINT/-1/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;
  const workDir = join("/tmp", `sta-step-${label}`);
  mkdirSync(workDir, { recursive: true });
  for (const f of readdirSync(workDir)) {
    try {
      unlinkSync(join(workDir, f));
    } catch {
      /* ignore */
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
  if (r.status !== 0) throw new Error(`starter ${label}: ${r.stdout.slice(-500)}`);
  r = spawnSync(join(orPath, "exec/engine_linux64_gf"), ["-i", join(workDir, `${decks.root}_0001.rad`), "-nt", "1"], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 32 << 20,
  });
  if (r.status !== 0) throw new Error(`engine ${label}: ${r.stdout.slice(-800)}`);

  const staNames = readdirSync(workDir)
    .filter((f) => f.endsWith(".sta"))
    .sort();
  const picked = selectEndTimeSta(
    staNames,
    workDir,
    model.reference.length0,
    model.reference.radius0,
    model.mesh.coords.length / 3,
    undefined,
  );
  const web = solveExplicit(model, { maxWallMs: 600_000 });
  const cmp = compareToOracle(web.metrics, picked.shape);
  const al = alignedCoordGap(web.coords, picked.shape.coords);
  let mismatch = 0;
  for (let i = 0; i < web.coords.length; i++) {
    if (!Object.is(web.coords[i], picked.shape.coords[i])) mismatch += 1;
  }
  console.log(
    JSON.stringify({
      label,
      tEnd,
      nSteps: web.metrics.nSteps,
      sta: picked.name,
      lengthRel: cmp.lengthRelError,
      radiusRel: cmp.radiusRelError,
      alignedMax: al.max,
      coordsBitwise: al.bitwiseEqual,
      coordMismatchDoubles: mismatch,
      webLf: web.metrics.lengthRatio,
      orLf: picked.shape.lengthRatio,
    }),
  );
}

const cases: Array<[number, string]> = [
  [2.5e-8, "1step"],
  [2.5e-7, "10step"],
  [2.5e-6, "100step"],
  [8e-6, "early"],
  [20e-6, "20us"],
];
for (const [t, lab] of cases) runAtEndTime(t, lab);
