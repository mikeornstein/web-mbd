import {
  mkdirSync,
  readdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { ModelIR } from "../ir/types.js";
import { exportTaylorRadiossDecks } from "../oracle/exportRadioss.js";
import { shapeFromF64bin } from "../oracle/shapeFromF64bin.js";
import { shapeFromSta } from "../oracle/shapeFromSta.js";
import { parseVtkPoints, shapeFromVtk } from "../oracle/shapeFromVtk.js";

export interface OracleShapeMetrics {
  lengthRatio: number;
  radiusRatio: number;
  finalLength: number;
  finalMaxRadius: number;
  source: "openradioss";
  root: string;
  /**
   * Prefer host `.f64bin` (patched engine, Object.is-capable) over E20.13
   * `.sta`; anim VTK is float32 fallback.
   */
  coordSource: "f64bin" | "sta" | "vtk";
}

export interface OracleRunResult {
  metrics: OracleShapeMetrics;
  /** Final nodal XYZ (ID-sorted when from `.sta` / `.f64bin`). */
  coords: Float64Array;
  workDir: string;
  starterLog: string;
  engineLog: string;
  staFile?: string;
  f64binFile?: string;
  vtkFile?: string;
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

/** Remove prior OR artifacts so stale A00x / .sta cannot poison selection. */
function clearOracleArtifacts(workDir: string, root: string): void {
  if (!existsSync(workDir)) return;
  for (const f of readdirSync(workDir)) {
    if (
      f.startsWith(root) ||
      f.endsWith(".sta") ||
      f.endsWith(".f64bin") ||
      f.endsWith(".vtk") ||
      f.endsWith(".rst") ||
      /A\d{3}$/.test(f)
    ) {
      try {
        unlinkSync(join(workDir, f));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Prefer the `.sta` written at fixture endTime.
 *
 * Decks use `/STATE/DT/ALL` with Tstart=endTime, so the first numbered dump
 * (`_0001.sta`) is the endTime state. OpenRadioss also force-writes a final
 * `.sta` after TSTOP; with `/DTIX` equal to TSTOP it may take one extra cycle
 * past endTime, so matching the *last* anim VTK selects that overshoot and
 * breaks short-horizon Object.is. Always take the earliest sorted dump.
 *
 * `animVtkText` is retained for call-site compatibility; it is not used.
 */
export function selectEndTimeSta(
  staNames: string[],
  workDir: string,
  length0: number,
  radius0: number,
  expectedNodes: number,
  _animVtkText?: string,
): { name: string; shape: ReturnType<typeof shapeFromSta> } {
  if (staNames.length === 0) throw new Error("no .sta files to select");
  const sorted = [...staNames].sort();
  const name = sorted[0]!;
  return {
    name,
    shape: shapeFromSta(readFileSync(join(workDir, name), "utf8"), length0, radius0, {
      expectedNodes,
    }),
  };
}

function convertLastAnim(
  workDir: string,
  animToVtk: string,
  env: NodeJS.ProcessEnv,
): { anim: string; vtkText: string; vtkPath: string } | undefined {
  const animFiles = readdirSync(workDir)
    .filter((f) => /A\d{3}$/.test(f) && !f.includes("."))
    .sort();
  const lastAnim = animFiles[animFiles.length - 1];
  if (!lastAnim) return undefined;
  const conv = spawnSync(animToVtk, [join(workDir, lastAnim)], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (conv.status !== 0 || !conv.stdout.includes("POINTS")) return undefined;
  const vtkPath = join(workDir, `${lastAnim}.vtk`);
  writeFileSync(vtkPath, conv.stdout);
  return { anim: lastAnim, vtkText: conv.stdout, vtkPath };
}

/**
 * Run OpenRadioss starter+engine on the exported Taylor deck.
 * Prefer host `.f64bin` (patched engine) when present beside the selected
 * `.sta`; else float64 `.sta` (`/STATE/DT/ALL`); else anim→VTK (float32).
 */
export function runOpenRadiossTaylorOracle(
  model: ModelIR,
  workDir: string,
): OracleRunResult {
  const orPath = requireEnv("OPENRADIOSS_PATH");
  const decks = exportTaylorRadiossDecks(model);
  mkdirSync(workDir, { recursive: true });
  clearOracleArtifacts(workDir, decks.root);
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

  const expectedNodes = model.mesh.coords.length / 3;
  const anim = convertLastAnim(workDir, animToVtk, env);
  const staFiles = readdirSync(workDir)
    .filter((f) => f.endsWith(".sta"))
    .sort();

  if (staFiles.length > 0) {
    const picked = selectEndTimeSta(
      staFiles,
      workDir,
      model.reference.length0,
      model.reference.radius0,
      expectedNodes,
      anim?.vtkText,
    );
    const staPath = join(workDir, picked.name);
    const f64Path = join(workDir, picked.name.replace(/\.sta$/i, ".f64bin"));
    if (existsSync(f64Path)) {
      const shape = shapeFromF64bin(
        readFileSync(f64Path),
        model.reference.length0,
        model.reference.radius0,
        { expectedNodes },
      );
      return {
        metrics: {
          finalLength: shape.finalLength,
          finalMaxRadius: shape.finalMaxRadius,
          lengthRatio: shape.lengthRatio,
          radiusRatio: shape.radiusRatio,
          source: "openradioss",
          root: decks.root,
          coordSource: "f64bin",
        },
        coords: shape.coords,
        workDir,
        starterLog: starter.stdout,
        engineLog: engine.stdout,
        staFile: staPath,
        f64binFile: f64Path,
        ...(anim?.vtkPath ? { vtkFile: anim.vtkPath } : {}),
      };
    }
    return {
      metrics: {
        finalLength: picked.shape.finalLength,
        finalMaxRadius: picked.shape.finalMaxRadius,
        lengthRatio: picked.shape.lengthRatio,
        radiusRatio: picked.shape.radiusRatio,
        source: "openradioss",
        root: decks.root,
        coordSource: "sta",
      },
      coords: picked.shape.coords,
      workDir,
      starterLog: starter.stdout,
      engineLog: engine.stdout,
      staFile: staPath,
      ...(anim?.vtkPath ? { vtkFile: anim.vtkPath } : {}),
    };
  }

  if (!anim) {
    throw new Error(`no .sta or animation files in ${workDir}: ${readdirSync(workDir).join(", ")}`);
  }
  const shape = shapeFromVtk(anim.vtkText, model.reference.length0, model.reference.radius0, {
    expectedNodes,
  });
  return {
    metrics: { ...shape, source: "openradioss", root: decks.root, coordSource: "vtk" },
    coords: parseVtkPoints(anim.vtkText, { expectedNodes }),
    workDir,
    starterLog: starter.stdout,
    engineLog: engine.stdout,
    vtkFile: anim.vtkPath,
  };
}
