import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const soPath = join(process.cwd(), "native/force-kernel/or-extract/build/libor_h8c.so");
const smokeSrc = join(process.cwd(), "native/force-kernel/or-extract/smoke_symbols.c");

describe("OpenRadioss libor_h8c extract", () => {
  it.skipIf(!existsSync(soPath))(
    "dlopens shared engine and resolves s8eforc3_ / m2law_",
    () => {
      const bin = join(process.cwd(), "native/force-kernel/or-extract/smoke_symbols");
      const build = spawnSync("cc", ["-O2", "-o", bin, smokeSrc, "-ldl"], { encoding: "utf8" });
      expect(build.status, build.stderr).toBe(0);
      const run = spawnSync(bin, [soPath], { encoding: "utf8" });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("s8eforc3_");
      expect(run.stdout).toContain("m2law_");
    },
  );
});
