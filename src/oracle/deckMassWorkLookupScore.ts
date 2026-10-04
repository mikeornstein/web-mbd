/**
 * Score the locked mass / ringing / open reading rules. Lookup only.
 * Do not add a verdict row. Do not propose a fix.
 */
import {
  LOOKUP_MASS_REL,
  OUTCOME_MASS,
  OUTCOME_OPEN,
  OUTCOME_RINGING,
} from "./deckMassWorkLookupRules.js";

export type MassWorkKind = "mass-difference" | "ringing" | "open";

export type MassInputName = "density" | "thickness" | "rest area";

export interface MassRow {
  name: string;
  mass_kg: number;
  density_kg_m3: number;
  thickness_m: number;
  restArea_m2: number;
}

export interface KineticSample {
  t_s: number;
  kinetic_J: number;
}

export interface MassWorkScoreInput {
  toy: MassRow;
  decks: readonly MassRow[];
  toyKinetic: readonly KineticSample[];
  windowFrom_s: number;
  windowTo_s: number;
}

export interface MassWorkScore {
  kind: MassWorkKind;
  firesMass: boolean;
  firesRinging: boolean;
  firesOpen: boolean;
  oscillates: boolean;
  massMatch: boolean;
  maxAbsMassRel: number;
  differingInput: MassInputName | "none";
  outcomeLine: string;
}

export function kineticOscillates(
  samples: readonly KineticSample[],
  from_s: number,
  to_s: number,
): boolean {
  const w = samples.filter((s) => s.t_s + 1e-18 >= from_s && s.t_s - 1e-18 <= to_s);
  let hasRise = false;
  let hasFall = false;
  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1]!.kinetic_J;
    const b = w[i]!.kinetic_J;
    if (b > a) hasRise = true;
    if (b < a) hasFall = true;
    if (hasRise && hasFall) return true;
  }
  return false;
}

function absRel(part: number, base: number): number {
  if (!(base > 0)) return part === 0 ? 0 : Infinity;
  return Math.abs(part - base) / base;
}

function namedDifferingInput(toy: MassRow, decks: readonly MassRow[]): MassInputName | "none" {
  let best: { name: MassInputName; rel: number } = { name: "density", rel: -1 };
  for (const d of decks) {
    const cands: { name: MassInputName; rel: number }[] = [
      { name: "density", rel: absRel(d.density_kg_m3, toy.density_kg_m3) },
      { name: "thickness", rel: absRel(d.thickness_m, toy.thickness_m) },
      { name: "rest area", rel: absRel(d.restArea_m2, toy.restArea_m2) },
    ];
    for (const c of cands) {
      if (c.rel > best.rel) best = c;
    }
  }
  if (best.rel <= 0) return "none";
  return best.name;
}

export function scoreMassWorkLookups(input: MassWorkScoreInput): MassWorkScore {
  let maxAbsMassRel = 0;
  for (const d of input.decks) {
    const rel = absRel(d.mass_kg, input.toy.mass_kg);
    if (rel > maxAbsMassRel) maxAbsMassRel = rel;
  }
  const massMatch = maxAbsMassRel <= LOOKUP_MASS_REL;
  const oscillates = kineticOscillates(input.toyKinetic, input.windowFrom_s, input.windowTo_s);
  const differingInput = massMatch ? "none" : namedDifferingInput(input.toy, input.decks);
  const firesMass = !massMatch;
  const firesRinging = massMatch && oscillates;
  const firesOpen = massMatch && !oscillates;
  let kind: MassWorkKind;
  let outcomeLine: string;
  if (firesMass) {
    kind = "mass-difference";
    outcomeLine = `(a) ${OUTCOME_MASS}; the exact input that differs is ${differingInput}`;
  } else if (firesRinging) {
    kind = "ringing";
    outcomeLine = `(b) ${OUTCOME_RINGING}`;
  } else {
    kind = "open";
    outcomeLine = `(c) ${OUTCOME_OPEN}`;
  }
  return {
    kind,
    firesMass,
    firesRinging,
    firesOpen,
    oscillates,
    massMatch,
    maxAbsMassRel,
    differingInput,
    outcomeLine,
  };
}
