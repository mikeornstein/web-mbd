import { INFLATE_BANDS } from "./compareInflate.js";

export const KILL_OFF_TABLE_TIMES_S = [0.002, 0.008, 0.016, 0.022, 0.024] as const;

/** Half an animation stride plus a little slack (samples sit near 2 ms). */
const MATCH_WINDOW_S = 0.0015;

export interface KillOffFrame {
  frame: number;
  t: number;
  lambdaMax: number;
  p_Pa: number;
  V_mL: number;
}

export interface KillOffPairRow {
  t_ms: number;
  toy: KillOffFrame | null;
  radioss: KillOffFrame | null;
  lambdaRel: number | null;
  volumeRel: number | null;
  pressureRel: number | null;
  insideBands: boolean | null;
}

export interface KillOffRunCompare {
  table: KillOffPairRow[];
  firstStretchGe2: KillOffPairRow;
  maxLambdaRel: number | null;
  maxVolumeRel: number | null;
  maxPressureRel: number | null;
  overlappingFrames: number;
  wholeRunInsideBands: boolean;
}

function relErr(ours: number, gold: number): number {
  return Math.abs(ours - gold) / Math.max(Math.abs(gold), 1e-30);
}

export function nearestFrame(frames: readonly KillOffFrame[], t: number): KillOffFrame | null {
  if (frames.length === 0) return null;
  let best = frames[0]!;
  let bestDt = Math.abs(best.t - t);
  for (let i = 1; i < frames.length; i++) {
    const row = frames[i]!;
    const dt = Math.abs(row.t - t);
    if (dt < bestDt) {
      best = row;
      bestDt = dt;
    }
  }
  return bestDt <= MATCH_WINDOW_S ? best : null;
}

export function firstStretchGe2(frames: readonly KillOffFrame[]): KillOffFrame | null {
  for (const row of frames) {
    if (row.lambdaMax >= 2) return row;
  }
  return null;
}

function pairFrames(toyRow: KillOffFrame | null, radRow: KillOffFrame | null, t_ms: number): KillOffPairRow {
  if (toyRow === null || radRow === null) {
    return {
      t_ms,
      toy: toyRow,
      radioss: radRow,
      lambdaRel: null,
      volumeRel: null,
      pressureRel: null,
      insideBands: null,
    };
  }
  const lambdaRel = relErr(toyRow.lambdaMax, radRow.lambdaMax);
  const volumeRel = relErr(toyRow.V_mL, radRow.V_mL);
  const pressureRel = relErr(toyRow.p_Pa, radRow.p_Pa);
  return {
    t_ms,
    toy: toyRow,
    radioss: radRow,
    lambdaRel,
    volumeRel,
    pressureRel,
    insideBands:
      lambdaRel <= INFLATE_BANDS.lambdaRel &&
      volumeRel <= INFLATE_BANDS.volumeRel &&
      pressureRel <= INFLATE_BANDS.pressureRel,
  };
}

function pairAtTime(
  toy: readonly KillOffFrame[],
  radioss: readonly KillOffFrame[],
  t: number,
): KillOffPairRow {
  return pairFrames(nearestFrame(toy, t), nearestFrame(radioss, t), t * 1e3);
}

export function compareKillOffRun(
  toy: readonly KillOffFrame[],
  radioss: readonly KillOffFrame[],
): KillOffRunCompare {
  const table = KILL_OFF_TABLE_TIMES_S.map((t) => pairAtTime(toy, radioss, t));
  const toyWarn = firstStretchGe2(toy);
  const radWarn = firstStretchGe2(radioss);
  const firstStretchGe2Row = pairFrames(
    toyWarn,
    radWarn,
    radWarn !== null ? radWarn.t * 1e3 : toyWarn !== null ? toyWarn.t * 1e3 : Number.NaN,
  );

  let maxLambdaRel: number | null = null;
  let maxVolumeRel: number | null = null;
  let maxPressureRel: number | null = null;
  let overlappingFrames = 0;
  for (const rad of radioss) {
    const toyRow = nearestFrame(toy, rad.t);
    if (toyRow === null) continue;
    overlappingFrames += 1;
    const lam = relErr(toyRow.lambdaMax, rad.lambdaMax);
    const vol = relErr(toyRow.V_mL, rad.V_mL);
    const p = relErr(toyRow.p_Pa, rad.p_Pa);
    maxLambdaRel = maxLambdaRel === null ? lam : Math.max(maxLambdaRel, lam);
    maxVolumeRel = maxVolumeRel === null ? vol : Math.max(maxVolumeRel, vol);
    maxPressureRel = maxPressureRel === null ? p : Math.max(maxPressureRel, p);
  }

  const wholeRunInsideBands =
    maxLambdaRel !== null &&
    maxVolumeRel !== null &&
    maxPressureRel !== null &&
    maxLambdaRel <= INFLATE_BANDS.lambdaRel &&
    maxVolumeRel <= INFLATE_BANDS.volumeRel &&
    maxPressureRel <= INFLATE_BANDS.pressureRel;

  return {
    table,
    firstStretchGe2: firstStretchGe2Row,
    maxLambdaRel,
    maxVolumeRel,
    maxPressureRel,
    overlappingFrames,
    wholeRunInsideBands,
  };
}

/** True if `after` is strictly closer to Radioss than `before`. */
export function stretchMovedToward(before: number, after: number, radioss: number): boolean {
  return Math.abs(after - radioss) < Math.abs(before - radioss);
}
