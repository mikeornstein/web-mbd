import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { ModelIR } from "../ir/types.js";
import { exportTaylorRadiossDecks } from "../oracle/exportRadioss.js";
import { shapeFromVtk } from "../oracle/shapeFromVtk.js";

export interface OracleShapeMetrics {
  lengthRatio: number;
  radiusRatio: number;
  finalLength: number;
  finalMaxRadius: number;
  source: "openradioss";
  root: string;
}

export interface OracleRunResult {
  metrics: OracleShapeMetrics;
  workDir: string;
  starterLog: string;
  engineLog: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function openRadiossAvailable(): boolean {
  const path = process.env["OPENRADIOSS_PATH"];
  if (!path) return false;
  return existsSync(join(path, "exec/starter_linux64_gf"));
}

/**
 * Run OpenRadioss starter+engine on the exported Taylor deck and extract final
 * shape metrics from the last anim→VTK conversion.
 */
export function runOpenRadiossTaylorOracle(
  model: ModelIR,
  workDir: string,
): OracleRunResult {
  const orPath = requireEnv("OPENRADIOSS_PATH");
  const decks = exportTaylorRadiossDecks(model);
  mkdirSync(workDir, { recursive: true });
  const starterFile = join(workDir, `${decks.root}_0000.rad`);
  const engineFile = join(workDir, `${decks.root}_0001.rad`);
  writeFileSync(starterFile, decks.starter);
  writeFileSync(engineFile, decks.engine);

  const env = {
    ...process.env,
    OPENRADIOSS_PATH: orPath,
    RAD_CFG_PATH: join(orPath, "hm_cfg_files"),
    RAD_H3D_PATH: join(orPath, "extlib/h3d/lib/linux64"),
    OMP_STACKSIZE: "400m",
    OMP_NUM_THREADS: process.env["OMP_NUM_THREADS"] ?? "1",
    LD_LIBRARY_PATH: [
      join(orPath, "extlib/hm_reader/linux64"),
      join(orPath, "extlib/h3d/lib/linux64"),
      process.env["LD_LIBRARY_PATH"] ?? "",
    ].join(":"),
  };

  const starterBin = join(orPath, "exec/starter_linux64_gf");
  const engineBin = join(orPath, "exec/engine_linux64_gf");
  const animToVtk = join(orPath, "exec/anim_to_vtk_linux64_gf");

  const starter = spawnSync(starterBin, ["-i", starterFile, "-np", "1", "-nt", "1"], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (starter.status !== 0) {
    throw new Error(`OpenRadioss starter failed:\n${starter.stdout}\n${starter.stderr}`);
  }

  const engine = spawnSync(engineBin, ["-i", engineFile, "-nt", "1"], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (engine.status !== 0) {
    throw new Error(`OpenRadioss engine failed:\n${engine.stdout}\n${engine.stderr}`);
  }

  const animFiles = readdirSync(workDir)
    .filter((f) => /A\d{3}$/.test(f) && !f.includes("."))
    .sort();
  const lastAnim = animFiles[animFiles.length - 1];
  if (!lastAnim) {
    throw new Error(`no animation files in ${workDir}: ${readdirSync(workDir).join(", ")}`);
  }

  const conv = spawnSync(animToVtk, [join(workDir, lastAnim)], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (conv.status !== 0 || !conv.stdout.includes("POINTS")) {
    throw new Error(
      `anim_to_vtk failed for ${lastAnim}: status=${String(conv.status)}\n${conv.stdout}\n${conv.stderr}\nfiles=${readdirSync(workDir).join(",")}`,
    );
  }
  const produced = join(workDir, `${lastAnim}.vtk`);
  writeFileSync(produced, conv.stdout);
  const vtkText = conv.stdout;

  const shape = shapeFromVtk(vtkText, model.reference.length0, model.reference.radius0, {
    expectedNodes: model.mesh.coords.length / 3,
  });
  return {
    metrics: { ...shape, source: "openradioss", root: decks.root },
    workDir,
    starterLog: starter.stdout,
    engineLog: engine.stdout,
  };
}
