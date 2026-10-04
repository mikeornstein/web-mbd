/**
 * Surviving Radioss decks for Themis’s stretch spread. Digits are **computed**
 * from committed tapes (`oriented-ismstr2-metrics.json`, `element-type.json`).
 * Triangle `/SH3N` is shown, not in the gating spread.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 */

export const EVERY_FRAME_MS = [0, 2, 4, 6, 8, 10, 12, 14, 16] as const;

export const INFLATE_GATING_BAR = "themis-deck-spread" as const;
export const INFLATE_OLD_STRETCH_BAR = "golden-max-2-percent" as const;

export interface StretchSample {
  t_ms: number;
  lambdaMax: number;
}

export interface GoldenTapeSample extends StretchSample {
  volume_mL: number;
  p_Pa: number;
}

/** Golden four-node Belytschko, every 2 ms. read from file. */
export const GOLDEN_TAPE: readonly GoldenTapeSample[] = [
  { t_ms: 0, lambdaMax: 1.0000000074505808, volume_mL: 420.5477252567505, p_Pa: 0 },
  { t_ms: 2, lambdaMax: 1.7087226934243784, volume_mL: 526.3324561122758, p_Pa: 3286.05875 },
  { t_ms: 4, lambdaMax: 1.6569898200728108, volume_mL: 547.5565609104631, p_Pa: 6506.012499999999 },
  { t_ms: 6, lambdaMax: 1.5293877296560032, volume_mL: 586.974184701848, p_Pa: 9758.011250000001 },
  { t_ms: 8, lambdaMax: 1.557845750139792, volume_mL: 623.1138828126411, p_Pa: 13002.25875 },
  { t_ms: 10, lambdaMax: 1.6559843425753957, volume_mL: 666.0530882757834, p_Pa: 16250.325000000003 },
  { t_ms: 12, lambdaMax: 1.6798551153354773, volume_mL: 719.0495233264584, p_Pa: 19501.1375 },
  { t_ms: 14, lambdaMax: 1.8290874144196552, volume_mL: 788.1502814849342, p_Pa: 22754.0625 },
  { t_ms: 16, lambdaMax: 2.128161758970982, volume_mL: 891.7110015235089, p_Pa: 26006.175 },
];

/** Ishell 24, small-strain flag 2. Snapshots 0/2/4/8/16 ms. read from file. */
export const DECK_ISHELL24_ISMSTR2: readonly StretchSample[] = [
  { t_ms: 0, lambdaMax: 1.0000000074505808 },
  { t_ms: 2, lambdaMax: 1.196934532629466 },
  { t_ms: 4, lambdaMax: 1.3750424051694754 },
  { t_ms: 8, lambdaMax: 1.4321302465379597 },
  { t_ms: 16, lambdaMax: 2.1761381003254314 },
];

/** Fine re-oriented 1-to-4. Snapshots 0/2/4/8/16 ms. read from file. */
export const DECK_FINE_REORIENTED: readonly StretchSample[] = [
  { t_ms: 0, lambdaMax: 1.0000000074505808 },
  { t_ms: 2, lambdaMax: 1.2357340008197975 },
  { t_ms: 4, lambdaMax: 1.2566631278886113 },
  { t_ms: 8, lambdaMax: 1.46262163465577 },
  { t_ms: 16, lambdaMax: 2.23685858125846 },
];

/** Triangle `/SH3N`. Not a late-window reference. Died ~11.5 ms. read from file. */
export const DECK_TRIANGLE_SH3N: readonly StretchSample[] = [
  { t_ms: 0, lambdaMax: 1.0000000074505808 },
  { t_ms: 2, lambdaMax: 1.1062769955278284 },
  { t_ms: 4, lambdaMax: 1.160367603511729 },
  { t_ms: 8, lambdaMax: 1.3639623144159907 },
];

export const TRIANGLE_DEAD_MS = 11.5;

export interface InterpolatedStretch {
  lambdaMax: number;
  interpolated: boolean;
}

export function interpolateStretch(
  samples: readonly StretchSample[],
  t_ms: number,
): InterpolatedStretch | null {
  for (const row of samples) {
    if (row.t_ms === t_ms) return { lambdaMax: row.lambdaMax, interpolated: false };
  }
  let lo: StretchSample | undefined;
  let hi: StretchSample | undefined;
  for (const row of samples) {
    if (row.t_ms < t_ms) lo = row;
    if (row.t_ms > t_ms && hi === undefined) hi = row;
  }
  if (lo === undefined || hi === undefined) return null;
  const span = hi.t_ms - lo.t_ms;
  const w = span === 0 ? 0 : (t_ms - lo.t_ms) / span;
  return { lambdaMax: lo.lambdaMax + w * (hi.lambdaMax - lo.lambdaMax), interpolated: true };
}

export interface DeckSpread {
  t_ms: number;
  golden: GoldenTapeSample;
  min: number;
  max: number;
  interpolated: boolean;
  members: { name: string; lambdaMax: number; interpolated: boolean }[];
  triangle: InterpolatedStretch | null;
  triangleNote: string | null;
}

const GATING_DECKS: { name: string; samples: readonly StretchSample[] }[] = [
  { name: "golden Belytschko quad", samples: GOLDEN_TAPE },
  { name: "Ishell 24 ismstr 2", samples: DECK_ISHELL24_ISMSTR2 },
  { name: "fine re-oriented", samples: DECK_FINE_REORIENTED },
];

export function deckSpreadAt(t_ms: number): DeckSpread {
  const golden = GOLDEN_TAPE.find((row) => row.t_ms === t_ms);
  if (golden === undefined) {
    throw new Error(`golden tape has no sample at ${String(t_ms)} ms`);
  }
  const members: DeckSpread["members"] = [];
  let interpolated = false;
  for (const deck of GATING_DECKS) {
    const hit = interpolateStretch(deck.samples, t_ms);
    if (hit === null) continue;
    members.push({ name: deck.name, lambdaMax: hit.lambdaMax, interpolated: hit.interpolated });
    if (hit.interpolated) interpolated = true;
  }
  if (members.length === 0) {
    throw new Error(`no surviving deck at ${String(t_ms)} ms`);
  }
  let min = members[0]!.lambdaMax;
  let max = members[0]!.lambdaMax;
  for (const m of members) {
    if (m.lambdaMax < min) min = m.lambdaMax;
    if (m.lambdaMax > max) max = m.lambdaMax;
  }
  let triangle: InterpolatedStretch | null = null;
  let triangleNote: string | null = null;
  if (t_ms > TRIANGLE_DEAD_MS) {
    triangleNote = "triangle deck died ~11.5 ms; not a late-window reference";
  } else {
    triangle = interpolateStretch(DECK_TRIANGLE_SH3N, t_ms);
    if (triangle === null) {
      triangleNote = "triangle sample missing; not a late-window reference";
    } else {
      triangleNote = triangle.interpolated
        ? "triangle interpolated; shown, not in the gating spread"
        : "triangle shown, not in the gating spread";
    }
  }
  return { t_ms, golden, min, max, interpolated, members, triangle, triangleNote };
}
