/**
 * Stretch-diagnostic decision rules. Written before the measurement run.
 * Do not change these numbers or this verdict table after seeing results.
 * This is a measurement, never a gate. Do not apply any time shift to a result.
 */

export const STRETCH_DIAG_NOT_A_GATE =
  "MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar.";

export const STRETCH_DIAG_EVIDENCE_MS = [2, 4, 8, 16] as const;
export const STRETCH_DIAG_INTERP_MS = [10, 12, 14] as const;

export const BOOKKEEPING_REL = 0.03;
export const ENERGY_AGREE_REL = 0.05;
export const MEDIAN_STRAIN_AGREE_REL = 0.05;
export const SHIFT_AGREE_MS = 0.5;
export const SHIFT_MAX_ABS_MS = 2;

export const RULE_0_BOOKKEEPING =
  "0. Bookkeeping gate (toy): pressure work = strain energy + kinetic energy + damping loss within 3% at every frame. If it fails anywhere, STOP and report that the energy numbers are not trustworthy; do not report verdicts. Toy damping loss is the trapezoid of twice the Rayleigh mass rate times kinetic energy (the Rayleigh force −α m v removes power α m |v|² = 2 α KE). Pressure work is the trapezoid of pressure times volume change. This is not the remainder identity. Deck kinetic energy only if that deck’s output has velocities; otherwise say so and report that deck’s damping loss as the remainder after pressure work and strain energy.";

export const RULE_1_ENERGY =
  "1. Energy agrees: the toy's strain energy is within 5% of the golden's at 8 and 16 ms (4 ms reported), AND inside the min-to-max range of the surviving decks. Strain energy is (shear modulus / 2) × rest thickness × sum over triangles of (first invariant − 3) × rest area, from node positions with the toy’s own function. A deck that has no usable node positions at a frame does not enter that frame’s min-to-max. If the golden has no usable node positions at 8 or 16 ms, energy-agrees and energy-low are both false and the energy rows of the verdict table cannot score.";

export const RULE_2_SHIFT =
  "2. One shift fits: the time shifts for volume, median stretch and maximum stretch are each fitted separately, all three land within 0.5 ms of each other, and the shift is under 2 ms. Diagnostic only; never applied to results. A positive shift means the toy lags the golden (golden at t matches toy at t + shift).";

export const RULE_3_MEDIAN =
  "3. Median agrees: the toy's median strain (stretch minus 1) is within 5% of the golden's at 8 and 16 ms.";

export const RULE_4_EARLY_SPREAD =
  "4. The 2 and 4 ms rows are judged against the spread of all decks, not the golden alone (the golden's 2 ms stretch is a coarse-element artifact).";

export const RULE_INTERP =
  "Main evidence is the 2, 4, 8 and 16 ms rows. Interpolated rows (10, 12, 14 ms) are reported but decide nothing.";

export const VERDICT_CONVENTION =
  "Energy agrees and median agrees: the low maximum stretch is a convention or hot-spot effect in how the decks report it; the toy's physics is not at fault.";

export const VERDICT_DYNAMIC_LAG =
  "Energy low by more than 5% and one shift fits: the toy is a dynamic lag (split of work between motion and damping); toy physics; look at kinetic and damping numbers next.";

export const VERDICT_SPREADS_STRAIN =
  "Energy low and shifts disagree: the toy spreads strain differently from the decks; toy physics, not timing.";

export const VERDICT_MIXED =
  "Energy agrees but shifts disagree: MIXED, no verdict, report as mixed.";

export const VERDICT_STOP_BOOKKEEPING =
  "STOP: energy numbers are not trustworthy (bookkeeping failed). No verdicts.";

export const VERDICT_NO_ROW =
  "NO-ROW: no printed verdict row matches. Report the four booleans and every underlying number.";

export const VERDICT_APPLICATION =
  "If bookkeeping fails at any frame: STOP, no verdicts. Otherwise collect every matching verdict row in the printed order. If more than one matches, print every match. If none match, print NO-ROW with energy-agrees, energy-low, one-shift-fits, and median-agrees.";

export const STRETCH_DIAGNOSTIC_RULES_LINES: readonly string[] = [
  STRETCH_DIAG_NOT_A_GATE,
  RULE_INTERP,
  RULE_0_BOOKKEEPING,
  RULE_1_ENERGY,
  RULE_2_SHIFT,
  RULE_3_MEDIAN,
  RULE_4_EARLY_SPREAD,
  VERDICT_APPLICATION,
  VERDICT_CONVENTION,
  VERDICT_DYNAMIC_LAG,
  VERDICT_SPREADS_STRAIN,
  VERDICT_MIXED,
];

export interface SeriesPoint {
  t_ms: number;
  y: number;
}

export interface EnergyFrameInput {
  t_ms: number;
  pressureWork_J: number;
  strain_J: number;
  kinetic_J: number;
  damping_J: number;
  interpolated: boolean;
}

export interface DeckEnergyFrame {
  name: string;
  t_ms: number;
  strain_J: number | null;
  nodePositions: "usable" | "missing";
  note: string;
}

export interface StretchStatFrame {
  t_ms: number;
  max: number | null;
  median: number | null;
  areaWeightedMean: number | null;
  interpolated: boolean;
}

export interface StretchDiagnosticsInput {
  bookkeeping: readonly EnergyFrameInput[];
  toyStrain: readonly { t_ms: number; psi_J: number; interpolated: boolean }[];
  goldenStrain: {
    at8_J: number | null;
    at16_J: number | null;
    at4_J: number | null;
    fromToyFunctionOnNodePositions: boolean;
    note: string;
  };
  deckStrainAt8: readonly number[];
  deckStrainAt16: readonly number[];
  volumeToy: readonly SeriesPoint[];
  volumeGold: readonly SeriesPoint[];
  medianToy: readonly SeriesPoint[];
  medianGold: readonly SeriesPoint[];
  maxToy: readonly SeriesPoint[];
  maxGold: readonly SeriesPoint[];
}

export type StretchDiagnosticVerdictKind =
  | "stop-bookkeeping"
  | "convention-or-hotspot"
  | "dynamic-lag"
  | "spreads-strain-differently"
  | "mixed"
  | "no-row";

export interface ShiftFit {
  volume_ms: number | null;
  median_ms: number | null;
  max_ms: number | null;
  oneShiftFits: boolean;
  note: string;
}

export interface StretchDiagnosticsScore {
  bookkeepingOk: boolean;
  bookkeepingWorstRel: number | null;
  energyAgrees: boolean;
  energyLow: boolean;
  energyComparable: boolean;
  medianAgrees: boolean;
  oneShiftFits: boolean;
  shift: ShiftFit;
  matchingRows: StretchDiagnosticVerdictKind[];
  verdictLine: string;
  energyAt8: { toy: number | null; golden: number | null; rel: number | null };
  energyAt16: { toy: number | null; golden: number | null; rel: number | null };
  energyAt4: { toy: number | null; golden: number | null; rel: number | null };
  medianStrainAt8: { toy: number | null; golden: number | null; rel: number | null };
  medianStrainAt16: { toy: number | null; golden: number | null; rel: number | null };
}

function relTo(ours: number, gold: number): number {
  return Math.abs(ours - gold) / Math.max(Math.abs(gold), 1e-30);
}

function interpolateY(samples: readonly SeriesPoint[], t_ms: number): number | null {
  if (samples.length === 0) return null;
  for (const row of samples) {
    if (row.t_ms === t_ms) return row.y;
  }
  let lo: SeriesPoint | undefined;
  let hi: SeriesPoint | undefined;
  for (const row of samples) {
    if (row.t_ms < t_ms) lo = row;
    if (row.t_ms > t_ms && hi === undefined) hi = row;
  }
  if (lo === undefined || hi === undefined) return null;
  const span = hi.t_ms - lo.t_ms;
  const w = span === 0 ? 0 : (t_ms - lo.t_ms) / span;
  return lo.y + w * (hi.y - lo.y);
}

/**
 * Shift added to toy time so toy(t + shift) lines up with gold(t).
 * Positive = toy lags. Never applied to a result or gate.
 */
export function bestTimeShiftMs(
  toy: readonly SeriesPoint[],
  gold: readonly SeriesPoint[],
  shiftMinMs = -4,
  shiftMaxMs = 4,
  stepMs = 0.01,
): { shift_ms: number; rms: number } | null {
  if (toy.length < 2 || gold.length < 2) return null;
  let bestShift = 0;
  let bestRms = Infinity;
  for (let shift = shiftMinMs; shift <= shiftMaxMs + 1e-12; shift += stepMs) {
    let sum = 0;
    let n = 0;
    for (const g of gold) {
      const y = interpolateY(toy, g.t_ms + shift);
      if (y === null) continue;
      const d = y - g.y;
      sum += d * d;
      n += 1;
    }
    if (n < 2) continue;
    const rms = Math.sqrt(sum / n);
    if (rms < bestRms) {
      bestRms = rms;
      bestShift = shift;
    }
  }
  if (!Number.isFinite(bestRms)) return null;
  return { shift_ms: bestShift, rms: bestRms };
}

function atMs(
  rows: readonly { t_ms: number; psi_J: number }[],
  t_ms: number,
): number | null {
  for (const row of rows) {
    if (row.t_ms === t_ms) return row.psi_J;
  }
  return null;
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

function pairRel(
  toy: number | null,
  gold: number | null,
): { toy: number | null; golden: number | null; rel: number | null } {
  if (toy === null || gold === null) return { toy, golden: gold, rel: null };
  return { toy, golden: gold, rel: relTo(toy, gold) };
}

export function scoreStretchDiagnostics(input: StretchDiagnosticsInput): StretchDiagnosticsScore {
  let bookkeepingOk = true;
  let bookkeepingWorstRel: number | null = 0;
  for (const row of input.bookkeeping) {
    const rhs = row.strain_J + row.kinetic_J + row.damping_J;
    const denom = Math.max(Math.abs(row.pressureWork_J), Math.abs(rhs), 1e-12);
    const rel = Math.abs(row.pressureWork_J - rhs) / denom;
    if (bookkeepingWorstRel === null || rel > bookkeepingWorstRel) bookkeepingWorstRel = rel;
    if (rel > BOOKKEEPING_REL) bookkeepingOk = false;
  }
  if (input.bookkeeping.length === 0) {
    bookkeepingOk = false;
    bookkeepingWorstRel = null;
  }

  const toy8 = atMs(input.toyStrain, 8);
  const toy16 = atMs(input.toyStrain, 16);
  const toy4 = atMs(input.toyStrain, 4);
  const energyAt8 = pairRel(toy8, input.goldenStrain.at8_J);
  const energyAt16 = pairRel(toy16, input.goldenStrain.at16_J);
  const energyAt4 = pairRel(toy4, input.goldenStrain.at4_J);

  const energyComparable =
    input.goldenStrain.fromToyFunctionOnNodePositions &&
    energyAt8.rel !== null &&
    energyAt16.rel !== null;
  const energyWithin5 =
    energyAt8.rel !== null &&
    energyAt16.rel !== null &&
    energyAt8.rel <= ENERGY_AGREE_REL &&
    energyAt16.rel <= ENERGY_AGREE_REL;
  const energyInDeckSpread =
    toy8 !== null &&
    toy16 !== null &&
    insideMinMax(toy8, input.deckStrainAt8) &&
    insideMinMax(toy16, input.deckStrainAt16);
  const energyAgrees = energyComparable && energyWithin5 && energyInDeckSpread;
  const energyLow =
    energyComparable &&
    ((energyAt8.toy !== null &&
      energyAt8.golden !== null &&
      energyAt8.toy < energyAt8.golden * (1 - ENERGY_AGREE_REL)) ||
      (energyAt16.toy !== null &&
        energyAt16.golden !== null &&
        energyAt16.toy < energyAt16.golden * (1 - ENERGY_AGREE_REL)));

  const medToy8 = interpolateY(input.medianToy, 8);
  const medToy16 = interpolateY(input.medianToy, 16);
  const medGold8 = interpolateY(input.medianGold, 8);
  const medGold16 = interpolateY(input.medianGold, 16);
  const medianStrainAt8 = pairRel(strainOf(medToy8), strainOf(medGold8));
  const medianStrainAt16 = pairRel(strainOf(medToy16), strainOf(medGold16));
  const medianAgrees =
    medianStrainAt8.rel !== null &&
    medianStrainAt16.rel !== null &&
    medianStrainAt8.rel <= MEDIAN_STRAIN_AGREE_REL &&
    medianStrainAt16.rel <= MEDIAN_STRAIN_AGREE_REL;

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
  const shift: ShiftFit = { volume_ms, median_ms, max_ms, oneShiftFits, note: shiftNote };

  if (!bookkeepingOk) {
    return {
      bookkeepingOk,
      bookkeepingWorstRel,
      energyAgrees: false,
      energyLow: false,
      energyComparable,
      medianAgrees: false,
      oneShiftFits: false,
      shift,
      matchingRows: ["stop-bookkeeping"],
      verdictLine: VERDICT_STOP_BOOKKEEPING,
      energyAt8,
      energyAt16,
      energyAt4,
      medianStrainAt8,
      medianStrainAt16,
    };
  }

  const matchingRows: Exclude<StretchDiagnosticVerdictKind, "stop-bookkeeping">[] = [];
  if (energyAgrees && medianAgrees) matchingRows.push("convention-or-hotspot");
  if (energyLow && oneShiftFits) matchingRows.push("dynamic-lag");
  if (energyLow && !oneShiftFits) matchingRows.push("spreads-strain-differently");
  if (energyAgrees && !oneShiftFits) matchingRows.push("mixed");
  if (matchingRows.length === 0) matchingRows.push("no-row");

  const texts: string[] = [];
  for (const kind of matchingRows) {
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
        texts.push(VERDICT_MIXED);
        break;
      case "no-row":
        texts.push(
          `${VERDICT_NO_ROW} energy-agrees=${String(energyAgrees)} energy-low=${String(energyLow)} one-shift-fits=${String(oneShiftFits)} median-agrees=${String(medianAgrees)} energy-comparable=${String(energyComparable)}`,
        );
        break;
      default: {
        const _exhaustive: never = kind;
        throw new Error(`unhandled verdict ${String(_exhaustive)}`);
      }
    }
  }
  return {
    bookkeepingOk,
    bookkeepingWorstRel,
    energyAgrees,
    energyLow,
    energyComparable,
    medianAgrees,
    oneShiftFits,
    shift,
    matchingRows,
    verdictLine: texts.join(" | "),
    energyAt8,
    energyAt16,
    energyAt4,
    medianStrainAt8,
    medianStrainAt16,
  };
}
