/**
 * Locked Inflation ABC constitutive + contact constants.
 * Do not invent or retune μ or ρ. Values match inflation-abc + OpenRadioss
 * PR#8 LAW42 dump (`radioss-desk-pr8-quadir/RUN.md`).
 */

/** Grill engineering conversion; not a fitted μ. */
export const PSI = 6894.757;

/** LAW42 μ₁ = (800 × 6894.757) / 1.75 Pa. */
export const MU = (800 * PSI) / 1.75;

/** Ogden 1-term neo-Hookean: α₁ = 2. */
export const ALPHA1 = 2;

/** Remaining Ogden terms unused. */
export const MU_OTHER = 0;

export const NU = 0.495;
export const PRONY_M = 0;
export const IFORM = 1;

/** Film thickness H0 = 0.015 × 0.0254 m = 0.381 mm. */
export const H0 = 0.015 * 0.0254;

/**
 * Desmopan 85085A ISO 1183-1. McMaster 1446T11 density is not published.
 * Dynamics only — labeled. Not a μ lever.
 */
export const RHO = 1130;

export const WARN_LAM = 2;

/** CONTACT_KISS = max(2·H0, 1e-4) ≈ 0.762 mm. */
export const CONTACT_KISS = Math.max(2 * H0, 1e-4);

/** Broadphase engage band (detect / soft-press). Not a standoff hold. */
export const CONTACT_ENGAGE = 0.003;

/**
 * Contact class implemented in the toy. OpenRadioss `/INTER/TYPE19` is
 * TYPE7 (node-to-surface) + TYPE11 (edge-to-edge) with Igap=4, Irem_gap=2,
 * Inacti=6. The toy uses the same CONTACT_KISS Gapmin with a node-node
 * soft-press (the response that stays in Themis bands vs the PR#8 TYPE19
 * desk). A node-to-segment analogue was tried and failed those bands — not
 * the default. Not bitwise TYPE19.
 */
export const CONTACT_CLASS_TYPE19_NODE_TO_SEGMENT = "type19-class-gapmin-node-node";

export const LOAD_FAMILY_DYNAMIC_PLOAD_40MS = "dynamic-pload-40ms";

/**
 * Quasi-static-ish dead-pressure family: p = P_WARN_ABC for t>0.
 * Not a Radioss AMS / true static solve. Not apples with dynamic-pload-40ms.
 */
export const LOAD_FAMILY_QS_ISH_DEAD_PRESSURE = "qs-ish-dead-pressure";

/** PR#8 /PLOAD 0 → 65 kPa in 40 ms (dynamic; not ABC QS ~54 kPa). */
export const P_MAX = 65_000;
export const T_RAMP = 0.04;
export const T_END = 0.05;

/**
 * Inflation ABC ship warn-class pressure (~54.1 kPa). Constitutive lock, not
 * a fitted μ. Used only by the qs-ish-dead-pressure family.
 */
export const P_WARN_ABC = 54_100;
export const T_RAMP_QS_ISH = 0;
export const T_END_QS_ISH = 0.08;

/** ANIM-equivalent history stride used for the golden freeze frame. */
export const ANIM_DT = 0.002;

/** Starter /DAMP Rayleigh mass α (1/s). ρ unchanged. */
export const RAYLEIGH_ALPHA = 80;

/**
 * Underwood residual-velocity scale at kinetic-energy peaks.
 * Explicit analogue of engine `/ADYREL` (not a μ/ρ lever; not on the LAW42 card).
 * Full reset (0) overdamps vs the PR#8 desk; 0.18 lands the ANIM-stride freeze
 * on the same load family without touching MU.
 */
export const ADYREL_VELOCITY_SCALE = 0.18;

export const MU_LABEL = "grill eng. μ = (800 * 6894.757) / 1.75 ; not invented";
export const RHO_LABEL =
  "Desmopan 85085A ISO 1183-1; McMaster 1446T11 density not published";

export const SHIP_MESH_NODES = 1554;
export const SHIP_SOURCE_QUADS = 1540;
export const SHIP_ORPHAN_TRIS = 28;
export const SHIP_SHELL_QUADS = 1554;

export const SHIP_B_NODES = 1087;
export const SHIP_B_SOURCE_QUADS = 1026;
export const SHIP_B_ORPHAN_TRIS = 126;

export const SHIP_C_NODES = 988;
export const SHIP_C_SOURCE_QUADS = 938;
export const SHIP_C_ORPHAN_TRIS = 96;
