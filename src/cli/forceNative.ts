import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MaterialJ2Linear } from "../ir/types.js";
import type { J2State } from "../fe/materialJ2.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

export type ForceBackend = "ts" | "native";

let nativeLib: {
  wmbd_hex_internal_forces: (
    x0: Float64Array,
    v0: Float64Array,
    mat: Float64Array,
    stress: Float64Array,
    eqps: Float64Array,
    vol0: Float64Array,
    dt: number,
    fOut: Float64Array,
    jcvt: number,
  ) => number;
} | null = null;

function resolveKernelPath(): string | null {
  const candidates = [
    process.env["WEB_MBD_FORCE_KERNEL"],
    join(process.cwd(), "native/force-kernel/libforce_kernel.so"),
    join(__dirname, "../../native/force-kernel/libforce_kernel.so"),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

/** Load the shared force kernel if present. Returns false when unavailable. */
export function loadNativeForceKernel(): boolean {
  if (nativeLib) return true;
  const path = resolveKernelPath();
  if (!path) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require("koffi") as typeof import("koffi");
    const lib = koffi.load(path);
    const WmbdMat = koffi.struct("WmbdMat", {
      density: "double",
      young: "double",
      poisson: "double",
      yield_stress: "double",
      hardening: "double",
    });
    const fn = lib.func("wmbd_hex_internal_forces", "double", [
      "double *",
      "double *",
      koffi.pointer(WmbdMat),
      "double *",
      "double *",
      "double *",
      "double",
      "double *",
      "int",
    ]);
    nativeLib = {
      wmbd_hex_internal_forces: (x0, v0, matArr, stress, eqps, vol0, dt, fOut, jcvt) => {
        const mat = {
          density: matArr[0]!,
          young: matArr[1]!,
          poisson: matArr[2]!,
          yield_stress: matArr[3]!,
          hardening: matArr[4]!,
        };
        return fn(x0, v0, mat, stress, eqps, vol0, dt, fOut, jcvt) as number;
      },
    };
    return true;
  } catch {
    nativeLib = null;
    return false;
  }
}

export function nativeForceKernelAvailable(): boolean {
  return loadNativeForceKernel();
}

/**
 * Call the C hex force kernel, mutating `states` and writing +∫Bᵀσ into `fOut`.
 * Matches `hexInternalForces` defaults (Icpre=1, DSV on, qa=qb=0).
 */
export function hexInternalForcesNative(args: {
  x: Float64Array;
  v: Float64Array;
  states: J2State[];
  mat: MaterialJ2Linear;
  dt: number;
  fOut: Float64Array;
  options?: { jcvt?: 0 | 1 };
}): number {
  if (!loadNativeForceKernel() || !nativeLib) {
    throw new Error("native force kernel not loaded (build native/force-kernel)");
  }
  const stress = new Float64Array(48);
  const eqps = new Float64Array(8);
  const vol0 = new Float64Array(8);
  for (let gp = 0; gp < 8; gp++) {
    const s = args.states[gp]!;
    stress.set(s.stress, gp * 6);
    eqps[gp] = s.eqPlasticStrain;
    vol0[gp] = s.vol0;
  }
  const matArr = Float64Array.from([
    args.mat.density,
    args.mat.young,
    args.mat.poisson,
    args.mat.yieldStress,
    args.mat.hardeningModulus,
  ]);
  args.fOut.fill(0);
  const jcvt = args.options?.jcvt ?? 1;
  const dU = nativeLib.wmbd_hex_internal_forces(
    args.x,
    args.v,
    matArr,
    stress,
    eqps,
    vol0,
    args.dt,
    args.fOut,
    jcvt,
  );
  for (let gp = 0; gp < 8; gp++) {
    const s = args.states[gp]!;
    s.stress.set(stress.subarray(gp * 6, gp * 6 + 6));
    s.eqPlasticStrain = eqps[gp]!;
    s.vol0 = vol0[gp]!;
  }
  return dU;
}
