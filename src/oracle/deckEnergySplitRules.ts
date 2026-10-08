/**
 * Energy and damping split rules. Written before any number from this
 * measurement. Do not change these strings after seeing results.
 * Measurement, never a gate. Do not apply a time shift. Do not add a
 * verdict row.
 */

export const ENERGY_SPLIT_NOT_A_GATE =
  "MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar. Do not add a verdict row.";

export const ENERGY_SPLIT_REQUESTED_MS = [2, 4, 8, 16] as const;
export const ENERGY_SPLIT_DECIDING_MS = [4, 8] as const;

export const ENERGY_SPLIT_T01_FILE = "AinflateT01.csv";
export const ENERGY_SPLIT_T01_STEP =
  "time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist";

export const ENERGY_SPLIT_COL_EXTERNAL = "EXTERNAL WORK";
export const ENERGY_SPLIT_COL_INTERNAL = "INTERNAL ENERGY";
export const ENERGY_SPLIT_COL_KINETIC = "KINETIC ENERGY";
export const ENERGY_SPLIT_COL_HOURGLASS = "HOURGLASS ENERGY";
export const ENERGY_SPLIT_COL_CONTACT_DAMP = "DAMPING CONTACT ENERGY";

export const ENERGY_SPLIT_HOW_DECKS =
  "Scored deck numbers come from AinflateT01.csv columns EXTERNAL WORK, INTERNAL ENERGY, and KINETIC ENERGY at the sample nearest the deck's real animation TIME. Do not rebuild external work from volume change between VTK frames. If a named column is absent, say so and do not invent a value.";

export const ENERGY_SPLIT_HOW_TOY =
  "Toy external work is per-step pressure work. Toy internal energy is per-step strain energy. Toy kinetic energy is per-step ½ m |v|². Toy dissipated is external work minus internal minus kinetic. Solve the toy to the golden deck's real animation TIME. Do not apply a time shift.";

export const ENERGY_SPLIT_DISSIPATED_DEF =
  "dissipated = external work minus internal minus kinetic";

export const OUTCOME_A =
  "the toy damps too much early; that is one place the 0.5 ms lag could come from";

export const OUTCOME_B = "the lag points to how mass is spread";

export const OUTCOME_C = "the difference is in how strain is distributed";

export const OUTCOME_OTHER_PREFIX = "Report any other combination exactly as it is.";

export const NO_VERDICT_ROW = "Do not add a verdict row.";

export const PAGE_WORDING_MAX_STRETCH =
  "Retire the maximum-stretch lag as a claim about the toy, because on the wobble-blind measure its shift went from 3.46 ms to minus 0.08 ms and the earlier value was a yardstick artifact. Keep the number in the table; label it as a yardstick artifact, not a claim about the toy.";

export const PAGE_WORDING_LAG =
  "The film runs about half a millisecond behind the reference solvers throughout the run. That shows up as roughly 12% low in median stretch mid-run (8 ms) and about 3% low at the 16 ms freeze; the 0.5 ms fit was made across all frames, so the lag does not disappear at the freeze, it only looks smaller there because stretch changes more slowly near the end. Neither the page nor any caption may imply the film is physically exact or that the shape matches: node positions sit about three times farther from the decks than the decks sit from each other.";

export const PAGE_WORDING_NODES =
  "The toy sits about three times farther from the decks than the decks (golden and Ishell 24, same nodes, same winding) sit from each other, not that the toy is wrong.";

export const PAGE_WORDING_ENERGY_BAR =
  "Toy 0.771 J versus lowest deck 0.774 J, 0.003 J under the spread. That is the strict energy bar fact; it is not a pass.";

export const PAGE_WORDING_NO_CANVAS =
  "There is no on-canvas lag caption. None was added. Mesh drawing is unchanged.";

export const ENERGY_SPLIT_PLAN_LINES: readonly string[] = [
  ENERGY_SPLIT_NOT_A_GATE,
  ENERGY_SPLIT_HOW_DECKS,
  ENERGY_SPLIT_HOW_TOY,
  ENERGY_SPLIT_DISSIPATED_DEF,
  ENERGY_SPLIT_T01_STEP,
  OUTCOME_A,
  OUTCOME_B,
  OUTCOME_C,
  OUTCOME_OTHER_PREFIX,
  NO_VERDICT_ROW,
  PAGE_WORDING_MAX_STRETCH,
  PAGE_WORDING_LAG,
  PAGE_WORDING_NODES,
  PAGE_WORDING_ENERGY_BAR,
  PAGE_WORDING_NO_CANVAS,
];
