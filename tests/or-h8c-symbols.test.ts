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
    "BIND(C) packs ELBUF (rc=-2) and shares /COM08/ DT1",
    () => {
      const bin = join(extractDir, "build/smoke_or_hex");
      const build = spawnSync(
        "cc",
        ["-O2", "-o", bin, join(extractDir, "smoke_or_hex.c"), "-ldl", "-lm"],
        { encoding: "utf8" },
      );
      expect(build.status, build.stderr).toBe(0);
      const run = spawnSync(bin, [soHex], { encoding: "utf8", env: { ...process.env } });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("rc=-2");
      expect(run.stdout).toContain("PASS");
    },
  );

  it.skipIf(!existsSync(soHex))(
    "opt-in WMBD_OR_CALL_S8E=1 runs S8EFORC3 and returns finite forces",
    () => {
      const bin = join(extractDir, "build/smoke_or_hex");
      const build = spawnSync(
        "cc",
        ["-O2", "-o", bin, join(extractDir, "smoke_or_hex.c"), "-ldl", "-lm"],
        { encoding: "utf8" },
      );
      expect(build.status, build.stderr).toBe(0);
      const run = spawnSync(bin, [soHex], {
        encoding: "utf8",
        env: { ...process.env, WMBD_OR_CALL_S8E: "1" },
      });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(run.stdout).toContain("rc=0");
      expect(run.stdout).toContain("PASS");
    },
  );
});
