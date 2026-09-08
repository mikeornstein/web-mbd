import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { exportTaylorRadiossDecks } from "../src/oracle/exportRadioss.js";
import { alignedCoordGap, compareToOracle, nearestNeighborGap } from "../src/oracle/compare.js";
import { shapeFromSta } from "../src/oracle/shapeFromSta.js";
import { openRadiossAvailable } from "../src/cli/openRadiossRunner.js";

/**
 * Under a shared fixed DT ≪ CFL, independent TS vs gfortran truncation shrinks
 * (~1e-6 relative / ~0.05 μm). Proves the remaining CFL=0.9 adaptive residual is
 * primarily step-size truncation, not a missing constitutive/contact term.
 * Object.is still needs a shared force kernel. Compare uses float64 `.sta`.
 */
describe("taylor fine-DT OpenRadioss parity", () => {
  it.skipIf(!openRadiossAvailable())(
    "closes toward truncation floor at fixed DT=2.5e-8 (float64 .sta)",
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
/STATE/DT/ALL
${tEnd.toExponential(10).padStart(20)}${tEnd.toExponential(10).padStart(20)}
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

      const sta = readdirSync(workDir)
        .filter((f) => f.endsWith(".sta"))
        .sort()
        .at(-1);
      expect(sta).toBeTruthy();
      const orShape = shapeFromSta(
        readFileSync(join(workDir, sta!), "utf8"),
        model.reference.length0,
        model.reference.radius0,
        { expectedNodes: model.mesh.coords.length / 3 },
      );
      const web = solveExplicit(model, { maxWallMs: 600_000 });
      const cmp = compareToOracle(web.metrics, orShape, {
        lengthRatioRel: 5e-6,
        radiusRatioRel: 5e-6,
      });
      const nn = nearestNeighborGap(web.coords, orShape.coords);
      const aligned = alignedCoordGap(web.coords, orShape.coords);

      expect(cmp.ok).toBe(true);
      expect(nn.max).toBeLessThan(1e-7); // 0.1 μm
      expect(aligned.max).toBeLessThan(1e-7);
      // Still not bitwise at CFL-scale or fine DT without a shared force kernel.
      expect(cmp.bitwiseEqual).toBe(false);
      expect(aligned.bitwiseEqual).toBe(false);
    },
    600_000,
  );
});
