import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { MaterialJ2Linear } from "../ir/types.js";
import type { J2State } from "../fe/materialJ2.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

export type ForceBackend = "ts" | "native" | "or";

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

let orLib: {
  wmbd_hex_internal_forces_or: (
    x0: Float64Array,
    v0: Float64Array,
    mat: {
      density: number;
      young: number;
      poisson: number;
      yield_stress: number;
      hardening: number;
    },
    stress: Float64Array,
    eqps: Float64Array,
    vol0: Float64Array,
    smstr: Float64Array,
    offg: Float64Array,
    hist: Float64Array,
    dt: number,
    fOut: Float64Array,
  ) => number;
} | null = null;

/** Per-element ISMSTR=4 + ELBUF history for the OR backend. */
const orSmstrByElem = new Map<number, Float64Array>();
const orOffgByElem = new Map<number, number>();
/** eint[8] + epsd[8] + qvis[8] + rho[8] */
const orHistByElem = new Map<number, Float64Array>();

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

function resolveOrHexPath(): string | null {
  const candidates = [
    process.env["WEB_MBD_OR_HEX"],
    join(process.cwd(), "native/force-kernel/or-extract/build/libwmbd_or_hex.so"),
    join(__dirname, "../../native/force-kernel/or-extract/build/libwmbd_or_hex.so"),
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

/**
 * Load OpenRadioss `libwmbd_or_hex.so` (needs `libgomp` RTLD_GLOBAL first).
 * Sets `WMBD_OR_CALL_S8E=1` so the BIND(C) entry invokes S8EFORC3.
 */
export function loadOrForceKernel(): boolean {
  if (orLib) return true;
  const path = resolveOrHexPath();
  if (!path) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require("koffi") as typeof import("koffi");
    process.env["WMBD_OR_CALL_S8E"] = "1";
    koffi.load("libgomp.so.1", { global: true });
    const lib = koffi.load(path, { global: true });
    const WmbdMat = koffi.struct("WmbdMatOr", {
      density: "double",
      young: "double",
      poisson: "double",
      yield_stress: "double",
      hardening: "double",
    });
    const fn = lib.func("wmbd_hex_internal_forces_or_pthread", "int", [
      "double *",
      "double *",
      koffi.pointer(WmbdMat),
      "double *",
      "double *",
      "double *",
      "double *",
      "double *",
      "double *",
      "double",
      "double *",
    ]);
    orLib = {
      wmbd_hex_internal_forces_or: (x0, v0, mat, stress, eqps, vol0, smstr, offg, hist, dt, fOut) =>
        fn(x0, v0, mat, stress, eqps, vol0, smstr, offg, hist, dt, fOut) as number,
    };
    return true;
  } catch {
    orLib = null;
    return false;
  }
}

export function nativeForceKernelAvailable(): boolean {
  return loadNativeForceKernel();
}

export function orForceKernelAvailable(): boolean {
  return loadOrForceKernel();
}

export function resetOrElementState(): void {
  orSmstrByElem.clear();
  orOffgByElem.clear();
  orHistByElem.clear();
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
  const jcvt = args.options?.jcvt ?? 0;
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

/**
 * Call OpenRadioss S8EFORC3 via the packed extract ABI.
 * Persists GBUF%SMSTR / OFF per `elementIndex` across CD steps.
 * Returns 0 (energy not yet exported from OR path).
 */
export function hexInternalForcesOr(args: {
  x: Float64Array;
  v: Float64Array;
  states: J2State[];
  mat: MaterialJ2Linear;
  dt: number;
  fOut: Float64Array;
  elementIndex?: number;
}): number {
  if (!loadOrForceKernel() || !orLib) {
    throw new Error("OR force kernel not loaded (build native/force-kernel/or-extract)");
  }
  const e = args.elementIndex ?? 0;
  let smstr = orSmstrByElem.get(e);
  if (!smstr) {
    smstr = new Float64Array(21);
    orSmstrByElem.set(e, smstr);
  }
  let offg = orOffgByElem.get(e);
  if (offg === undefined) {
    offg = 1;
    orOffgByElem.set(e, offg);
  }
  const offgArr = Float64Array.from([offg]);
  let hist = orHistByElem.get(e);
  if (!hist) {
    hist = new Float64Array(32);
    for (let i = 0; i < 8; i++) hist[24 + i] = args.mat.density;
    orHistByElem.set(e, hist);
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
  const mat = {
    density: args.mat.density,
    young: args.mat.young,
    poisson: args.mat.poisson,
    yield_stress: args.mat.yieldStress,
    hardening: args.mat.hardeningModulus,
  };
  args.fOut.fill(0);
  const rc = orLib.wmbd_hex_internal_forces_or(
    args.x,
    args.v,
    mat,
    stress,
    eqps,
    vol0,
    smstr,
    offgArr,
    hist,
    args.dt,
    args.fOut,
  );
  if (rc !== 0) {
    throw new Error(`wmbd_hex_internal_forces_or rc=${rc}`);
  }
  orOffgByElem.set(e, offgArr[0]!);
  for (let gp = 0; gp < 8; gp++) {
    const s = args.states[gp]!;
    s.stress.set(stress.subarray(gp * 6, gp * 6 + 6));
    s.eqPlasticStrain = eqps[gp]!;
    s.vol0 = vol0[gp]!;
  }
  return 0;
}
