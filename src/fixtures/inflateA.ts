import {
  ADYREL_VELOCITY_SCALE,
  ANIM_DT,
  ANIM_DT_QS_ISH,
  T_END,
  T_END_QS_ISH,
} from "../inflate/constants.js";
import { lockedLawCard, lockedLawCardQsIsh } from "../inflate/lawCard.js";
import { loadShipMesh } from "../inflate/meshA.js";
import type { InflateLetter, InflateModelIR } from "../inflate/types.js";

export function createInflateAModel(): InflateModelIR {
  return createInflateLetterModel("A", "dynamic");
}

export function createInflateAQsIshModel(): InflateModelIR {
  return createInflateLetterModel("A", "qs-ish");
}

export function createInflateBModel(): InflateModelIR {
  return createInflateLetterModel("B", "dynamic");
}

export function createInflateCModel(): InflateModelIR {
  return createInflateLetterModel("C", "dynamic");
}

function createInflateLetterModel(
  letter: InflateLetter,
  family: "dynamic" | "qs-ish",
): InflateModelIR {
  const mesh = loadShipMesh(letter);
  const qs = family === "qs-ish";
  const law = qs ? lockedLawCardQsIsh() : lockedLawCard();
  const name = qs ? `inflate-${letter.toLowerCase()}-qs-ish` : `inflate-${letter.toLowerCase()}-desmopan`;
  const loadNote = qs
    ? `Load family qs-ish-pload-400ms (/PLOAD 0→65 kPa / 0.40 s + /ADYREL analogue). Radioss golden filled; p@λ≥2 ≈ 27.6 kPa, not ABC QS ~54 kPa. Dead p=54100 Pa CFL-explodes — not shipped. Do not retune μ.`
    : `Load family dynamic-pload-40ms (PR#8 /PLOAD 0→65 kPa / 40 ms) — not ABC QS ~54 kPa. Do not retune μ.`;
  return {
    kind: "inflate-nh-membrane",
    meta: {
      name,
      version: 1,
      units: "SI",
      description: `Letter-${letter} neo-Hookean membrane inflate. LAW42 μ₁=MU, α₁=2, H0=0.381 mm, ρ=1130 kg/m³ (Desmopan 85085A). ${loadNote}`,
    },
    law,
    mesh,
    controls: {
      endTime: qs ? T_END_QS_ISH : T_END,
      cfl: 0.45,
      maxSteps: 2_000_000,
      historyInterval: qs ? ANIM_DT_QS_ISH : ANIM_DT,
      kineticDamping: !qs,
      kineticDampingScale: ADYREL_VELOCITY_SCALE,
      kineticDampingMinInterval: 0,
      adaptiveRelaxation: qs,
      contactKind: qs ? "node-segment" : "node-node",
    },
  };
}
