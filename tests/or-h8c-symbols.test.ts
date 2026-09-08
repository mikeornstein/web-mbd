import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const extractDir = join(process.cwd(), "native/force-kernel/or-extract");
const soH8c = join(extractDir, "build/libor_h8c.so");
const soHex = join(extractDir, "build/libwmbd_or_hex.so");

describe("OpenRadioss libor_h8c extract", () => {
  it.skipIf(!existsSync(soH8c))(
    "dlopens shared engine and resolves s8eforc3_ / m2law_",
    () => {
      const bin = join(extractDir, "smoke_symbols");
      const build = spawnSync(
        "cc",
        ["-O2", "-o", bin, join(extractDir, "smoke_symbols.c"), "-ldl"],
        { encoding: "utf8" },
      );
      expect(build.status, build.stderr).toBe(0);
      const run = spawnSync(bin, [soH8c], { encoding: "utf8" });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("s8eforc3_");
      expect(run.stdout).toContain("m2law_");
    },
  );

  it.skipIf(!existsSync(soHex))(
    "BIND(C) wmbd_hex_internal_forces_or shares /COM08/ DT1 (stub rc=-1)",
    () => {
      const bin = join(extractDir, "build/smoke_or_hex");
      const build = spawnSync(
        "cc",
        ["-O2", "-o", bin, join(extractDir, "smoke_or_hex.c"), "-ldl"],
        { encoding: "utf8" },
      );
      expect(build.status, build.stderr).toBe(0);
      const run = spawnSync(bin, [soHex], { encoding: "utf8" });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("PASS");
    },
  );
});
