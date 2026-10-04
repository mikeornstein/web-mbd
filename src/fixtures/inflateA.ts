import { ADYREL_VELOCITY_SCALE, ANIM_DT, T_END } from "../inflate/constants.js";
import { lockedLawCard } from "../inflate/lawCard.js";
import { loadShipMesh } from "../inflate/meshA.js";
import type { InflateLetter, InflateModelIR } from "../inflate/types.js";

export function createInflateAModel(): InflateModelIR {
  return createInflateLetterModel("A");
}

export function createInflateBModel(): InflateModelIR {
  return createInflateLetterModel("B");
}

export function createInflateCModel(): InflateModelIR {
  return createInflateLetterModel("C");
}

function createInflateLetterModel(letter: InflateLetter): InflateModelIR {
  const mesh = loadShipMesh(letter);
  const law = lockedLawCard();
  return {
    kind: "inflate-nh-membrane",
    meta: {
      name: `inflate-${letter.toLowerCase()}-desmopan`,
      version: 1,
      units: "SI",
      description: `Letter-${letter} neo-Hookean membrane inflate. Hyperelastic Ogden one-term neo-Hookean: shear modulus μ₁=MU, α₁=2, H0=0.381 mm, ρ=1130 kg/m³ (Desmopan 85085A). Load family dynamic-pload-40ms (open Radioss pressure load 0→65 kPa / 40 ms) — fast-load (dynamic) only, consistently outward-oriented on letter A. Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed. Do not retune the shear modulus.`,
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
      kineticDampingMinInterval: 0,
      contactKind: "node-node",
    },
  };
}
