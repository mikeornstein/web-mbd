/**
 * Film mass, p ΔV work, and kinetic ringing lookup rules.
 * Written before any number from this lookup. Do not change these
 * strings after seeing results. Measurement, never a gate. Do not
 * add a verdict row. Do not apply a time shift. Do not propose a fix.
 */

export const LOOKUP_NOT_A_GATE =
  "MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar. Do not add a verdict row. Do not propose or apply a fix.";

export const LOOKUP_MASS_REL = 0.05;

export const LOOKUP_DECIDING_MS = [4, 8] as const;

export const LOOKUP_KE_WINDOW_MS = { from: 4, to: 8 } as const;

export const LOOKUP_T01_FILE = "AinflateT01.csv";

export const LOOKUP_T01_STEP =
  "time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist";

export const LOOKUP_COL_EXTERNAL = "EXTERNAL WORK";
export const LOOKUP_COL_KINETIC = "KINETIC ENERGY";
export const LOOKUP_COL_MASS = "MASS";

export const LOOKUP_HOW_MASS =
  "Film mass is density × thickness × rest area. Toy density is RHO in src/inflate/constants.ts. Toy thickness is H0 in that file. Toy rest area is the sum of rest triangle areas on the outward-oriented ship mesh. Deck density is /MAT/LAW42/1 field RHO_I. Deck thickness is /PROP/SHELL/1 field Thick. Deck rest area is from that starter's /NODE plus /SHELL or /SH3N. Do not use deformed area.";

export const LOOKUP_HOW_WORK =
  "Implied work is applied pressure times the change in enclosed volume from rest, p × ΔV, printed beside recorded external work. ΔV is V(t) − V_rest, not total volume. Do not interpolate a missing channel.";

export const LOOKUP_HOW_VOLUME_DECK =
  "Inspect AinflateT01.csv for a volume column. If none is present, say so and take enclosed volume from the nearest animation frame. Rest volume is the first animation frame, or the starter /NODE rest if that frame is missing. Do not interpolate between frames.";

export const LOOKUP_HOW_PRESSURE_DECK =
  "Deck applied pressure is the committed starter /FUNCT/1 times /PLOAD Fscale_y evaluated at that sample's TIME. If AinflateT01.csv also has a pressure column, print it as information; do not invent one if it is absent.";

export const LOOKUP_HOW_KE =
  "Toy kinetic energy is ½ m |v|² at every solver step from 4 ms through 8 ms. Deck kinetic energy is AinflateT01.csv column KINETIC ENERGY, once per millisecond. If a deck has no sample in the window, say so; do not infer one.";

export const LOOKUP_OSCILLATION =
  "Oscillation means the 4–8 ms toy series is not monotonic: there exist three times 4 ms ≤ t1 < t2 < t3 ≤ 8 ms with a peak (KE(t2) > KE(t1) and KE(t2) > KE(t3)) or a trough (KE(t2) < KE(t1) and KE(t2) < KE(t3)). Otherwise it does not oscillate. “Stays high” is the non-oscillating case in this window.";

export const OUTCOME_MASS =
  "the candidate cause is the mass difference";

export const OUTCOME_RINGING = "ringing";

export const OUTCOME_OPEN = "the cause is open";

export const NO_VERDICT_ROW = "Do not add a verdict row.";

export const NO_FIX = "Do not propose or apply a fix in this run.";

export const LOOKUP_PLAN_LINES: readonly string[] = [
  LOOKUP_NOT_A_GATE,
  LOOKUP_HOW_MASS,
  LOOKUP_HOW_WORK,
  LOOKUP_HOW_VOLUME_DECK,
  LOOKUP_HOW_PRESSURE_DECK,
  LOOKUP_HOW_KE,
  LOOKUP_OSCILLATION,
  OUTCOME_MASS,
  OUTCOME_RINGING,
  OUTCOME_OPEN,
  NO_VERDICT_ROW,
  NO_FIX,
];
