import {
  ENERGY_AGREE_REL,
  MEDIAN_STRAIN_AGREE_REL,
  RULE_C_BOTH_PASS,
  RULE_C_MEDIAN_STILL_LOW,
  RULE_C_ANYTHING_ELSE,
  SHIFT_AGREE_MS,
  SHIFT_MAX_ABS_MS,
  DISTANCE_FACTOR,
  VERDICT_MIXED_LOCKED,
} from "./deckQuadAveragedRules.js";
import {
  VERDICT_CONVENTION,
  VERDICT_DYNAMIC_LAG,
  VERDICT_SPREADS_STRAIN,
  VERDICT_NO_ROW,
  bestTimeShiftMs,
  type SeriesPoint,
} from "./stretchDiagnosticRules.js";

function relTo(ours: number, gold: number): number {
  return Math.abs(ours - gold) / Math.max(Math.abs(gold), 1e-30);
}

function insideMinMax(value: number, members: readonly number[]): boolean {
  if (members.length === 0) return false;
  let min = members[0]!;
  let max = members[0]!;
  for (const m of members) {
    if (m < min) min = m;
    if (m > max) max = m;
  }
  return value >= min && value <= max;
}

function strainOf(stretch: number | null): number | null {
  if (stretch === null) return null;
  return stretch - 1;
}

export interface EnergyPair {
  toy: number | null;
  goldenEngine: number | null;
  rel: number | null;
}

export interface MedianPair {
  toy: number | null;
  golden: number | null;
  ishell: number | null;
  relToGolden: number | null;
  goldIshellAbs: number | null;
  bar: number | null;
  agrees: boolean;
}

export type LockedVerdictKind = "convention-or-hotspot" | "dynamic-lag" | "spreads-strain-differently" | "mixed" | "no-row";

export type RuleCOutcomeKind = "node-wobble-convention" | "stores-strain-more-evenly" | "report-as-is";

export interface QuadAveragedScore {
  energyAgrees: boolean;
  energyLow: boolean;
  energyComparable: boolean;
  medianAgrees: boolean;
  oneShiftFits: boolean;
  distanceBarHolds: boolean;
  energyAt4: EnergyPair;
  energyAt8: EnergyPair;
  energyAt16: EnergyPair;
  medianStrainAt8: MedianPair;
  medianStrainAt16: MedianPair;
  shift: {
    volume_ms: number | null;
    median_ms: number | null;
    max_ms: number | null;
    oneShiftFits: boolean;
    note: string;
  };
  distanceAt4: { toyGoldRms: number | null; goldIshellRms: number | null; ratio: number | null; holds: boolean };
  distanceAt8: { toyGoldRms: number | null; goldIshellRms: number | null; ratio: number | null; holds: boolean };
  distanceAt16: { toyGoldRms: number | null; goldIshellRms: number | null; ratio: number | null; holds: boolean };
  lockedKind: LockedVerdictKind;
  lockedLine: string;
  ruleCKind: RuleCOutcomeKind;
  ruleCLine: string;
}

export interface QuadAveragedScoreInput {
  toyStrain4: number | null;
  toyStrain8: number | null;
  toyStrain16: number | null;
  goldenEngine4: number | null;
  goldenEngine8: number | null;
  goldenEngine16: number | null;
  deckEngineAt8: readonly number[];
  deckEngineAt16: readonly number[];
  volumeToy: readonly SeriesPoint[];
  volumeGold: readonly SeriesPoint[];
  medianToy: readonly SeriesPoint[];
  medianGold: readonly SeriesPoint[];
  maxToy: readonly SeriesPoint[];
  maxGold: readonly SeriesPoint[];
  ishellMedian8: number | null;
  ishellMedian16: number | null;
  toyGoldRms4: number | null;
  toyGoldRms8: number | null;
  toyGoldRms16: number | null;
  goldIshellRms4: number | null;
  goldIshellRms8: number | null;
  goldIshellRms16: number | null;
}

function energyPair(toy: number | null, engine: number | null): EnergyPair {
  if (toy === null || engine === null) return { toy, goldenEngine: engine, rel: null };
  return { toy, goldenEngine: engine, rel: relTo(toy, engine) };
}

function medianPair(toyStretch: number | null, goldStretch: number | null, ishellStretch: number | null): MedianPair {
  const toy = strainOf(toyStretch);
  const golden = strainOf(goldStretch);
  const ishell = strainOf(ishellStretch);
  if (toy === null || golden === null) {
    return {
      toy,
      golden,
      ishell,
      relToGolden: null,
      goldIshellAbs: ishell === null || golden === null ? null : Math.abs(golden - ishell),
      bar: null,
      agrees: false,
    };
  }
  const relToGolden = relTo(toy, golden);
  const goldIshellAbs = ishell === null ? null : Math.abs(golden - ishell);
  const fivePct = MEDIAN_STRAIN_AGREE_REL * Math.abs(golden);
  const bar = goldIshellAbs === null ? fivePct : Math.max(fivePct, goldIshellAbs);
  const agrees = Math.abs(toy - golden) <= bar;
  return { toy, golden, ishell, relToGolden, goldIshellAbs, bar, agrees };
}

function distRow(
  toyGold: number | null,
  goldIshell: number | null,
): { toyGoldRms: number | null; goldIshellRms: number | null; ratio: number | null; holds: boolean } {
  if (toyGold === null || goldIshell === null) {
    return { toyGoldRms: toyGold, goldIshellRms: goldIshell, ratio: null, holds: false };
  }
  const ratio = Math.abs(goldIshell) < 1e-18 ? (Math.abs(toyGold) < 1e-18 ? 0 : null) : toyGold / goldIshell;
  const holds = toyGold <= goldIshell * DISTANCE_FACTOR + 1e-18;
  return { toyGoldRms: toyGold, goldIshellRms: goldIshell, ratio, holds };
}

export function scoreQuadAveraged(input: QuadAveragedScoreInput): QuadAveragedScore {
  const energyAt4 = energyPair(input.toyStrain4, input.goldenEngine4);
  const energyAt8 = energyPair(input.toyStrain8, input.goldenEngine8);
  const energyAt16 = energyPair(input.toyStrain16, input.goldenEngine16);
  const energyComparable = energyAt8.rel !== null && energyAt16.rel !== null;
  const energyWithin5 =
    energyAt8.rel !== null &&
    energyAt16.rel !== null &&
    energyAt8.rel <= ENERGY_AGREE_REL &&
    energyAt16.rel <= ENERGY_AGREE_REL;
  const energyInDeckSpread =
    input.toyStrain8 !== null &&
    input.toyStrain16 !== null &&
    insideMinMax(input.toyStrain8, input.deckEngineAt8) &&
    insideMinMax(input.toyStrain16, input.deckEngineAt16);
  const energyAgrees = energyComparable && energyWithin5 && energyInDeckSpread;
  const energyLow =
    energyComparable &&
    ((energyAt8.toy !== null &&
      energyAt8.goldenEngine !== null &&
      energyAt8.toy < energyAt8.goldenEngine * (1 - ENERGY_AGREE_REL)) ||
      (energyAt16.toy !== null &&
        energyAt16.goldenEngine !== null &&
        energyAt16.toy < energyAt16.goldenEngine * (1 - ENERGY_AGREE_REL)));

  const med8 = medianPair(
    input.medianToy.find((p) => p.t_ms === 8)?.y ?? null,
    input.medianGold.find((p) => p.t_ms === 8)?.y ?? null,
    input.ishellMedian8,
  );
  const med16 = medianPair(
    input.medianToy.find((p) => p.t_ms === 16)?.y ?? null,
    input.medianGold.find((p) => p.t_ms === 16)?.y ?? null,
    input.ishellMedian16,
  );
  const medianAgrees = med8.agrees && med16.agrees;

  const volFit = bestTimeShiftMs(input.volumeToy, input.volumeGold);
  const medFit = bestTimeShiftMs(input.medianToy, input.medianGold);
  const maxFit = bestTimeShiftMs(input.maxToy, input.maxGold);
  const volume_ms = volFit?.shift_ms ?? null;
  const median_ms = medFit?.shift_ms ?? null;
  const max_ms = maxFit?.shift_ms ?? null;
  let oneShiftFits = false;
  let shiftNote = "one or more curves could not be fitted";
  if (volume_ms !== null && median_ms !== null && max_ms !== null) {
    const shifts = [volume_ms, median_ms, max_ms];
    let lo = shifts[0]!;
    let hi = shifts[0]!;
    for (const s of shifts) {
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    const allUnder = shifts.every((s) => Math.abs(s) <= SHIFT_MAX_ABS_MS);
    oneShiftFits = allUnder && hi - lo <= SHIFT_AGREE_MS;
    shiftNote = oneShiftFits
      ? "one shift fits (all three within 0.5 ms of each other and under 2 ms); diagnostic only, never applied"
      : "shifts disagree or exceed 2 ms; diagnostic only, never applied";
  }

  const distanceAt4 = distRow(input.toyGoldRms4, input.goldIshellRms4);
  const distanceAt8 = distRow(input.toyGoldRms8, input.goldIshellRms8);
  const distanceAt16 = distRow(input.toyGoldRms16, input.goldIshellRms16);
  const distanceBarHolds = distanceAt4.holds && distanceAt8.holds && distanceAt16.holds;

  const matching: LockedVerdictKind[] = [];
  if (energyAgrees && medianAgrees) matching.push("convention-or-hotspot");
  if (energyLow && oneShiftFits) matching.push("dynamic-lag");
  if (energyLow && !oneShiftFits) matching.push("spreads-strain-differently");
  if (energyAgrees && !oneShiftFits) matching.push("mixed");
  const lockedKind: LockedVerdictKind = matching[0] ?? "no-row";

  const texts: string[] = [];
  const kinds = matching.length === 0 ? (["no-row"] as const) : matching;
  for (const kind of kinds) {
    switch (kind) {
      case "convention-or-hotspot":
        texts.push(VERDICT_CONVENTION);
        break;
      case "dynamic-lag":
        texts.push(VERDICT_DYNAMIC_LAG);
        break;
      case "spreads-strain-differently":
        texts.push(VERDICT_SPREADS_STRAIN);
        break;
      case "mixed":
        texts.push(VERDICT_MIXED_LOCKED);
        break;
      case "no-row":
        texts.push(
          `${VERDICT_NO_ROW} energy-agrees=${String(energyAgrees)} energy-low=${String(energyLow)} one-shift-fits=${String(oneShiftFits)} median-agrees=${String(medianAgrees)} energy-comparable=${String(energyComparable)}`,
        );
        break;
      default: {
        const _exhaustive: never = kind;
        throw new Error(`unhandled locked ${String(_exhaustive)}`);
      }
    }
  }
  const lockedLine = texts.join(" | ");

  const medianStillLow =
    !medianAgrees &&
    med8.toy !== null &&
    med8.golden !== null &&
    med16.toy !== null &&
    med16.golden !== null &&
    med8.toy < med8.golden &&
    med16.toy < med16.golden;

  let ruleCKind: RuleCOutcomeKind;
  let ruleCLine: string;
  if (medianAgrees && oneShiftFits) {
    ruleCKind = "node-wobble-convention";
    ruleCLine = RULE_C_BOTH_PASS;
  } else if (medianStillLow) {
    ruleCKind = "stores-strain-more-evenly";
    ruleCLine = RULE_C_MEDIAN_STILL_LOW;
  } else {
    ruleCKind = "report-as-is";
    ruleCLine = RULE_C_ANYTHING_ELSE;
  }

  return {
    energyAgrees,
    energyLow,
    energyComparable,
    medianAgrees,
    oneShiftFits,
    distanceBarHolds,
    energyAt4,
    energyAt8,
    energyAt16,
    medianStrainAt8: med8,
    medianStrainAt16: med16,
    shift: { volume_ms, median_ms, max_ms, oneShiftFits, note: shiftNote },
    distanceAt4,
    distanceAt8,
    distanceAt16,
    lockedKind,
    lockedLine,
    ruleCKind,
    ruleCLine,
  };
}
