import { createInflateAModel } from "../fixtures/inflateA.js";
import { ADYREL_VELOCITY_SCALE } from "../inflate/constants.js";
import { loadShipMesh, loadShipMeshAsWound } from "../inflate/meshA.js";
import type { InflateModelIR } from "../inflate/types.js";

export type KillSwitch = "on" | "off";
export type KillOffMeshKind = "oriented" | "unoriented";

export function parseKillSwitch(raw: string): KillSwitch {
  switch (raw) {
    case "on":
    case "1":
    case "true":
      return "on";
    case "off":
    case "0":
    case "false":
      return "off";
    default:
      throw new Error(`kinetic-damping switch must be on or off, got ${raw}`);
  }
}

/** Read only by the kill-off diagnosis CLI. Default toy ignores this. */
export function parseKillEnv(env: { readonly [key: string]: string | undefined }): KillSwitch | null {
  const raw = env["WEB_MBD_TOY_KINETIC_DAMPING"];
  if (raw === undefined || raw === "") return null;
  return parseKillSwitch(raw);
}

export function parseMeshKind(raw: string): KillOffMeshKind {
  switch (raw) {
    case "oriented":
    case "unoriented":
      return raw;
    default:
      throw new Error(`mesh kind must be oriented or unoriented, got ${raw}`);
  }
}

/**
 * Diagnosis assemble. Does not change createInflateAModel(). Kill off only
 * flips the kinetic-energy peak velocity scale; shear modulus and the load
 * law stay locked.
 */
export function buildKillOffModel(opts: {
  mesh: KillOffMeshKind;
  kill: KillSwitch;
}): InflateModelIR {
  const base = createInflateAModel();
  const mesh = opts.mesh === "oriented" ? loadShipMesh("A") : loadShipMeshAsWound("A");
  return {
    ...base,
    mesh,
    controls: {
      ...base.controls,
      kineticDamping: opts.kill === "on",
      kineticDampingScale: ADYREL_VELOCITY_SCALE,
    },
  };
}
