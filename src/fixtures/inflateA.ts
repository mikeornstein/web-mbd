import { ANIM_DT, ADYREL_VELOCITY_SCALE, T_END } from "../inflate/constants.js";
import { lockedLawCard } from "../inflate/lawCard.js";
import { loadShipMeshA } from "../inflate/meshA.js";
import type { InflateModelIR } from "../inflate/types.js";

export function createInflateAModel(): InflateModelIR {
  const mesh = loadShipMeshA();
  const law = lockedLawCard();
  return {
    kind: "inflate-nh-membrane",
    meta: {
      name: "inflate-a-desmopan",
      version: 1,
      units: "SI",
      description:
        "Letter-A neo-Hookean membrane inflate. LAW42 μ₁=MU, α₁=2, H0=0.381 mm, ρ=1130 kg/m³ (Desmopan 85085A). Load family dynamic-pload-40ms (PR#8 /PLOAD 0→65 kPa / 40 ms) — not ABC QS ~54 kPa. Do not retune μ.",
    },
    law,
    mesh,
    controls: {
      endTime: T_END,
      cfl: 0.45,
      maxSteps: 2_000_000,
      historyInterval: ANIM_DT,
      kineticDamping: true,
      kineticDampingScale: ADYREL_VELOCITY_SCALE,
    },
  };
}
