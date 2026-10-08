/**
 * Quad-averaged / node-distance measurement rules. Written before any
 * number from this measurement. Do not change these numbers after seeing
 * results. Measurement, never a gate. Do not apply a time shift.
 */

export const QUAD_AVG_NOT_A_GATE =
  "MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar.";

export const RULE_A_ENGINE_PRIMARY =
  "RULE A (engine energy is primary). For every deck print the deck's own engine-reported internal energy, and the toy-function energy on the deck's node positions as a second column labeled 'convention difference, not evidence about the toy'. Score energy on the engine column: energy agrees if the toy's strain energy is within 5% of the golden's engine internal energy at 8 and 16 ms (4 ms reported) and is inside the min to max of the decks' engine internal energies at the same frames.";

export const RULE_A_CONVENTION_COLUMN =
  "convention difference, not evidence about the toy";

export const RULE_B_NODE_DISTANCE =
  "RULE B (direct node positions, no strain formula). Root-mean-square and 95th percentile node-to-node distance between golden and Ishell 24, then the same two distances for toy versus golden. Bar: toy-versus-golden RMS at 4, 8 and 16 ms must not exceed golden-versus-Ishell-24 RMS at the same frame (factor 1.0).";

export const RULE_B_REPORT_2_AND_6 =
  "Also print the toy-versus-golden over golden-versus-Ishell-24 distance ratio at 2 ms and at 6 ms, as a report that decides nothing. The bar stays at 4, 8 and 16 ms, factor 1.0.";

export const RULE_C_QUAD_AVERAGED =
  "RULE C (quad-averaged stretch, blind to node-scale wobble and to the diagonal). For each quad, the in-plane deformation gradient at the quad centre from the four corner positions against the rest shape; take the larger principal stretch.";

export const RULE_C_MEDIAN_BAR =
  "the toy's median strain (stretch minus 1) must be within 5% of the golden's at 8 and 16 ms, OR within the distance between golden and Ishell 24 median strain at the same frame, whichever is larger";

export const RULE_C_SHIFT_BAR =
  "the three shifts must land within 0.5 ms of each other and each be under 2 ms";

export const RULE_C_BOTH_PASS =
  "both pass means the stretch lag is the decks' node-wobble convention and the page says so";

export const RULE_C_MEDIAN_STILL_LOW =
  "Median still low means the toy genuinely stores strain more evenly than the decks, and the next step is the energy and damping partition (report only, do not change it).";

export const RULE_C_ANYTHING_ELSE = "Anything else, report as it is.";

export const VERDICT_MIXED_LOCKED =
  "Energy agrees but shifts disagree: MIXED, no verdict, report as mixed.";

export const SHARED_NODE_NUMBERING =
  "Golden and Ishell 24 share node numbering, so node-by-node distance between them is meaningful.";

export const FINE_PARENT_NODES =
  "Fine mesh node-to-node distance uses only the parent quads' original nodes (fine ids 1 through 1554).";

export const ENERGY_AGREE_REL = 0.05;
export const MEDIAN_STRAIN_AGREE_REL = 0.05;
export const SHIFT_AGREE_MS = 0.5;
export const SHIFT_MAX_ABS_MS = 2;
export const DISTANCE_FACTOR = 1.0;

export const QUAD_AVG_REQUESTED_MS = [0, 2, 4, 6, 8, 10, 12, 14, 16] as const;
export const QUAD_AVG_DECIDING_MS = [4, 8, 16] as const;
export const QUAD_AVG_REPORT_ONLY_MS = [2, 6] as const;

export const QUAD_AVG_PLAN_LINES: readonly string[] = [
  QUAD_AVG_NOT_A_GATE,
  RULE_A_ENGINE_PRIMARY,
  RULE_A_CONVENTION_COLUMN,
  RULE_B_NODE_DISTANCE,
  RULE_B_REPORT_2_AND_6,
  RULE_C_QUAD_AVERAGED,
  RULE_C_MEDIAN_BAR,
  RULE_C_SHIFT_BAR,
  RULE_C_BOTH_PASS,
  RULE_C_MEDIAN_STILL_LOW,
  VERDICT_MIXED_LOCKED,
  SHARED_NODE_NUMBERING,
  FINE_PARENT_NODES,
];
