import { join } from "node:path";
import { spawnSync } from "node:child_process";

const KERNEL_DIR = join(process.cwd(), "native/force-kernel");
const LOCK = join(KERNEL_DIR, ".build.lock");

/**
 * Serialize `make` in native/force-kernel — vitest runs files in parallel and
 * concurrent writes to libforce_kernel.so produce "file too short" loader errors.
 */
export function makeForceKernel(target: string): { status: number | null; stdout: string; stderr: string } {
  // Lock by path so the child inherits the lock (Node does not pass arbitrary FDs).
  const r = spawnSync("flock", [LOCK, "make", target], {
    cwd: KERNEL_DIR,
    encoding: "utf8",
  });
  // flock may be unavailable — fall back to plain make.
  if (r.error || (r.status === 127 && /flock|ENOENT|not found/i.test(`${r.stderr}${r.error?.message ?? ""}`))) {
    return spawnSync("make", [target], { cwd: KERNEL_DIR, encoding: "utf8" });
  }
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export { KERNEL_DIR };
