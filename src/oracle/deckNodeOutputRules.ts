/**
 * Four-deck node-output re-run rules. Written before the engine run.
 * Do not change these numbers or this split after seeing results.
 * Measurement, never a gate. Do not apply any time shift.
 */

export const DECK_NODE_NOT_A_GATE =
  "MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar.";

export const DECK_NODE_REQUESTED_MS = [0, 2, 4, 6, 8, 10, 12, 14, 16] as const;

export const DECK_NODE_DECIDING_MS = [4, 8, 16] as const;

export const DECK_NODE_REAL_BUT_NOT_DECIDING_MS = [10, 12, 14] as const;

export const DECK_NODE_ANIM_DT_S = 0.002;

export const DECK_NODE_TRIANGLE_STOP_MS = 11.5;

export const OPENCOURANT_TAG = "latest-20261003";
export const OPENCOURANT_ZIP_SHA256 =
  "e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8";
export const OPENCOURANT_ZIP_BYTES = 83864216;
export const OPENCOURANT_ENGINE_COMMIT = "6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba";

export const PRIMARY_SPLIT =
  "PRIMARY split: each four-node shell is two constant-strain triangles on the same node pair as the toy after outward re-winding (diagonal first node to third node, i0–i2). Map each deck quad to the toy quad by the four-node set so every 1554-node deck uses the identical diagonal on the identical quad.";

export const SENSITIVITY_SPLIT =
  "SENSITIVITY only: the other diagonal (i1–i3 of the same four nodes). Print the size of the difference. It decides nothing.";

export const FINE_MESH_SPLIT_CAVEAT =
  "Fine mesh (6,216 four-node shells, 1-to-4) cannot share the 1,554-quad node-pair map. Primary for each fine shell is that shell’s own written first-to-third node pair. Sensitivity is the other diagonal of that same fine shell.";

export const TOY_STRAIN_FUNCTION =
  "Strain energy with the toy’s function: sum over triangles of 0.5 × shear modulus × (first invariant − 3) × rest thickness × rest area (cstSample), including the wrinkle clamp (in-plane compression is killed).";

export const ENGINE_VS_TOY_CONVENTION =
  "If a deck’s engine internal energy disagrees with the toy function on that same deck’s node positions, that is a convention difference in how the decks account for energy, not evidence about the toy.";

export const NO_INTERPOLATION =
  "Never interpolate node coordinates. Record requested time and actual VTK TIME. 10, 12 and 14 ms are real frames, not interpolated from 8 and 16. /DT/ANIM is forbidden.";

export const NO_DT_ANIM =
  "/DT/ANIM is forbidden (it would change the time-stepping). Overlay /ANIM/VECT/VEL in the gitignored run copy only.";

export const GOLDEN_DECK_FOLDER = "radioss/diag-oriented-ismstr2";
export const ISHELL24_DECK_FOLDER = "radioss/diag-element-type/qeph-ismstr2";
export const FINE_DECK_FOLDER = "radioss/diag-element-type/fine";
export const TRIANGLE_DECK_FOLDER = "radioss/diag-element-type/sh3n";

export const NOT_A_FIFTH_DECK =
  "radioss/A-inflate requests Ismstr=10 and is not the table golden and is not a fifth deck. radioss/diag-element-type/qeph (Ishell 24, Ismstr=10) is not in the surviving table.";

export const DECK_NODE_PLAN_LINES: readonly string[] = [
  DECK_NODE_NOT_A_GATE,
  PRIMARY_SPLIT,
  SENSITIVITY_SPLIT,
  FINE_MESH_SPLIT_CAVEAT,
  TOY_STRAIN_FUNCTION,
  ENGINE_VS_TOY_CONVENTION,
  NO_INTERPOLATION,
  NO_DT_ANIM,
  NOT_A_FIFTH_DECK,
];
