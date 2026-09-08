/**
 * Write a binary golden and verify the C force kernel matches TypeScript
 * hexInternalForces bit-for-bit (Object.is / memcmp on IEEE doubles).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { gatherHex, hexInternalForces, createHexGpStates } from "../src/fe/hex.js";
import { KERNEL_DIR, makeForceKernel } from "./forceKernelBuild.js";

function packDoubles(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 8);
  for (let i = 0; i < values.length; i++) buf.writeDoubleLE(values[i]!, i * 8);
  return buf;
}

describe("native force kernel ↔ TypeScript", () => {
  it("Object.is-matches hex0 force eval (build + C golden harness)", () => {
    const model = createTaylorBarModel();
    const conn = model.mesh.hexes.slice(0, 8);
    const x = new Float64Array(24);
    const v = new Float64Array(24);
    gatherHex(model.mesh.coords, conn, x);
    for (let a = 0; a < 8; a++) {
      v[a * 3] = 0;
      v[a * 3 + 1] = 0;
      v[a * 3 + 2] = -227 * (1 - x[a * 3 + 2]! / model.reference.length0);
    }
    const statesIn = createHexGpStates(Float64Array.from(x));
    const vol0_in = statesIn.map((s) => s.vol0);
    const stress_in = statesIn.flatMap((s) => Array.from(s.stress));
    const eqps_in = statesIn.map((s) => s.eqPlasticStrain);

    const states = createHexGpStates(Float64Array.from(x));
    const fOut = new Float64Array(24);
    const dt = 7.815479988515705e-8;
    const dU = hexInternalForces({
      x,
      v,
      states,
      mat: model.material,
      dt,
      fOut,
      options: { jcvt: 0 },
    });

    const doubles: number[] = [
      dt,
      model.material.density,
      model.material.young,
      model.material.poisson,
      model.material.yieldStress,
      model.material.hardeningModulus,
      ...Array.from(x),
      ...Array.from(v),
      ...stress_in,
      ...eqps_in,
      ...vol0_in,
      ...Array.from(fOut),
      dU,
      ...states.flatMap((s) => Array.from(s.stress)),
      ...states.map((s) => s.eqPlasticStrain),
      ...states.map((s) => s.vol0),
    ];

    mkdirSync(join(KERNEL_DIR, "goldens"), { recursive: true });
    const goldenPath = join(KERNEL_DIR, "goldens/hex0_step1.dbl");
    writeFileSync(goldenPath, packDoubles(doubles));
    writeFileSync(
      join(KERNEL_DIR, "goldens/hex0_step1.json"),
      JSON.stringify(
        {
          dt,
          dU,
          fOut: Array.from(fOut),
          nDoubles: doubles.length,
        },
        null,
        2,
      ),
    );

    const build = makeForceKernel("golden-test");
    expect(build.status, build.stderr + build.stdout).toBe(0);

    const run = spawnSync(join(KERNEL_DIR, "force_kernel_golden"), [goldenPath], {
      cwd: KERNEL_DIR,
      encoding: "utf8",
      env: { ...process.env, LD_LIBRARY_PATH: KERNEL_DIR },
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain("PASS");
  });
});
