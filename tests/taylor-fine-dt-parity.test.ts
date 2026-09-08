import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { exportTaylorRadiossDecks } from "../src/oracle/exportRadioss.js";
import { compareToOracle, nearestNeighborGap } from "../src/oracle/compare.js";
import { parseVtkPoints, shapeFromVtk } from "../src/oracle/shapeFromVtk.js";
import { openRadiossAvailable } from "../src/cli/openRadiossRunner.js";

/**
 * Under a shared fixed DT ≪ CFL, independent TS vs gfortran truncation shrinks
 * toward the anim float32 floor (~1e-6 relative / ~0.05 μm NN). Proves the
 * remaining CFL=0.9 adaptive residual is primarily step-size truncation, not a
 * missing constitutive/contact term. Object.is still needs a shared force kernel.
 */
describe("taylor fine-DT OpenRadioss parity", () => {
  it.skipIf(!openRadiossAvailable())(
    "closes toward float32 floor at fixed DT=2.5e-8",
    () => {
      const fixedDt = 2.5e-8;
      const tEnd = 80e-6;
      const model = createTaylorBarModel();
      model.controls.endTime = tEnd;
      model.controls.fixedDt = fixedDt;
      model.controls.adaptiveDt = false;

      const decks = exportTaylorRadiossDecks(model);
      const engine = `#RADIOSS ENGINE
/RUN/${decks.root}/1
${(tEnd * 1.01).toExponential(10).padStart(20)}
/DTIX
${fixedDt.toExponential(10).padStart(20)}${fixedDt.toExponential(10).padStart(20)}
/DT
${(1.0).toExponential(10).padStart(20)}${(0).toExponential(10).padStart(20)}
/ANIM/DT
${(0).toExponential(10).padStart(20)}${tEnd.toExponential(10).padStart(20)}
/ANIM/NODA/DT
/PRINT/1000/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;
      const workDir = join(process.cwd(), "artifacts", "oracle-taylor-fine-dt");
      mkdirSync(workDir, { recursive: true });
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
      const starter = spawnSync(
        join(orPath, "exec/starter_linux64_gf"),
        ["-i", join(workDir, `${decks.root}_0000.rad`), "-np", "1", "-nt", "1"],
        { cwd: workDir, env, encoding: "utf8", maxBuffer: 32 << 20 },
      );
      expect(starter.status).toBe(0);
      const engineRun = spawnSync(
        join(orPath, "exec/engine_linux64_gf"),
        ["-i", join(workDir, `${decks.root}_0001.rad`), "-nt", "1"],
        { cwd: workDir, env, encoding: "utf8", maxBuffer: 32 << 20 },
      );
      expect(engineRun.status).toBe(0);

      const anim = readdirSync(workDir)
        .filter((f) => /A\d{3}$/.test(f))
        .sort()
        .at(-1);
      expect(anim).toBeTruthy();
      const conv = spawnSync(join(orPath, "exec/anim_to_vtk_linux64_gf"), [join(workDir, anim!)], {
        cwd: workDir,
        env,
        encoding: "utf8",
        maxBuffer: 64 << 20,
      });
      expect(conv.status).toBe(0);
      writeFileSync(join(workDir, `${anim}.vtk`), conv.stdout);

      const orShape = shapeFromVtk(conv.stdout, model.reference.length0, model.reference.radius0, {
        expectedNodes: model.mesh.coords.length / 3,
      });
      const web = solveExplicit(model, { maxWallMs: 600_000 });
      const cmp = compareToOracle(web.metrics, orShape, {
        lengthRatioRel: 5e-6,
        radiusRatioRel: 5e-6,
      });
      const nn = nearestNeighborGap(
        web.coords,
        parseVtkPoints(conv.stdout, { expectedNodes: model.mesh.coords.length / 3 }),
      );

      expect(cmp.ok).toBe(true);
      expect(nn.max).toBeLessThan(1e-7); // 0.1 μm
      // Still not bitwise at CFL-scale or fine DT without a shared force kernel.
      expect(cmp.bitwiseEqual).toBe(false);
    },
    600_000,
  );
});
