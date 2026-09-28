import {
  ALPHA1,
  ANIM_DT,
  CONTACT_KISS,
  H0,
  IFORM,
  LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
  MU,
  MU_OTHER,
  NU,
  P_MAX,
  PRONY_M,
  RAYLEIGH_ALPHA,
  RHO,
  T_RAMP,
  WARN_LAM,
} from "./constants.js";
import type { InflateLawCard } from "./types.js";

export function lockedLawCard(): InflateLawCard {
  return {
    mu1: MU,
    alpha1: ALPHA1,
    muOthers: MU_OTHER,
    nu: NU,
    pronyM: PRONY_M,
    iform: IFORM,
    h0: H0,
    rho: RHO,
    gapMin: CONTACT_KISS,
    warnLam: WARN_LAM,
    ishell: 1,
    ismstr: 10,
    ithick: 1,
    loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
    pMax: P_MAX,
    tRamp: T_RAMP,
    rayleighAlpha: RAYLEIGH_ALPHA,
  };
}

export const LAW_CARD_DUMP_LINES: readonly string[] = [
  "LAW42 neo-Hookean (Ogden 1-term)",
  `  μ1      = ${MU} Pa   # grill eng. μ = (800 * 6894.757) / 1.75 ; not invented`,
  "  α1      = 2",
  "  μp,αp   = 0 for p=2..10",
  "  ν       = 0.495  (≤ 0.495)",
  "  M       = 0  (no Prony)",
  "  Iform   = 1 (standard Ogden SED)",
  `  H0      = ${H0} m  (0.015*0.0254)`,
  "  ρ       = 1130 kg/m^3  # Desmopan 85085A ISO 1183-1; McMaster 1446T11 density not published",
  `  Gapmin  = ${CONTACT_KISS} m  # CONTACT_KISS = max(2*H0, 1e-4)`,
  "  WARN_LAM= 2",
  "  /PROP   N=1  Ismstr=10  Ishell=1 (Belytschko)  Ithick=1",
  "  /INTER/TYPE19  Igap=4  Irem_gap=2  Inacti=6  Gapmin=CONTACT_KISS",
  "  /PLOAD  0 → 65000 Pa in 0.04 s (not MONVOL)",
];

export function ploadAt(t: number, law: InflateLawCard = lockedLawCard()): number {
  if (!(t > 0)) return 0;
  if (t >= law.tRamp) return law.pMax;
  return law.pMax * (t / law.tRamp);
}

export const HISTORY_INTERVAL = ANIM_DT;
