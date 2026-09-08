import type { ModelIR } from "./types.js";

export function assertModel(model: ModelIR): void {
  if (model.meta.version !== 1) throw new Error("IR version must be 1");
  if (model.meta.units !== "SI") throw new Error("units must be SI");
  const { coords, hexes } = model.mesh;
  if (coords.length % 3 !== 0) throw new Error("coords length must be multiple of 3");
  if (hexes.length % 8 !== 0) throw new Error("hexes length must be multiple of 8");
  const nNodes = coords.length / 3;
  for (const id of hexes) {
    if (!Number.isInteger(id) || id < 0 || id >= nNodes) {
      throw new Error(`bad hex node index ${id}`);
    }
  }
  if (!(model.material.density > 0)) throw new Error("density must be > 0");
  if (!(model.material.young > 0)) throw new Error("young must be > 0");
  if (!(model.controls.endTime > 0)) throw new Error("endTime must be > 0");
  if (!(model.controls.cfl > 0 && model.controls.cfl <= 1)) {
    throw new Error("cfl must be in (0, 1]");
  }
}
