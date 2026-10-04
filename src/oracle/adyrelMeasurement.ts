import { INFLATE_BANDS } from "./compareInflate.js";

export const MEASUREMENT_TIMES_MS = [0, 2, 4, 6, 8, 10, 12, 14, 16] as const;

export const SPHERE_LAMBDA_STAR = 7 ** (1 / 6);

export interface MeasurementFrame {
  t: number;
  lambdaMax: number;
  p_Pa: number;
  V_mL: number;
}

export interface SphereCrossing {
  t: number;
  lambdaMax: number;
  p_Pa: number;
  V_mL: number;
  interpolated: boolean;
}

export function nearestFrame(frames: readonly MeasurementFrame[], t: number): MeasurementFrame | null {
  let best: MeasurementFrame | null = null;
  let bestDist = Infinity;
  for (const row of frames) {
    const d = Math.abs(row.t - t);
    if (d < bestDist) {
      best = row;
      bestDist = d;
    }
  }
  if (best === null || bestDist > 0.0015) return null;
  return best;
}

export function sphereCrossing(frames: readonly MeasurementFrame[], target: number): SphereCrossing | null {
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i]!;
    const b = frames[i + 1]!;
    const loa = a.lambdaMax <= target;
    const lob = b.lambdaMax <= target;
    if (loa === lob) continue;
    const span = b.lambdaMax - a.lambdaMax;
    const w = Math.abs(span) < 1e-18 ? 0 : (target - a.lambdaMax) / span;
    return {
      t: a.t + w * (b.t - a.t),
      lambdaMax: target,
      p_Pa: a.p_Pa + w * (b.p_Pa - a.p_Pa),
      V_mL: a.V_mL + w * (b.V_mL - a.V_mL),
      interpolated: true,
    };
  }
  return null;
}

/** True if `probe` is closer to `gold` than `base` is (any of stretch/volume). */
export function movedTowardGolden(
  probe: MeasurementFrame,
  base: MeasurementFrame,
  gold: MeasurementFrame,
): { stretch: boolean; volume: boolean } {
  return {
    stretch: Math.abs(probe.lambdaMax - gold.lambdaMax) < Math.abs(base.lambdaMax - gold.lambdaMax),
    volume: Math.abs(probe.V_mL - gold.V_mL) < Math.abs(base.V_mL - gold.V_mL),
  };
}

export function insideBands(toy: MeasurementFrame, gold: MeasurementFrame): boolean {
  const lam = Math.abs(toy.lambdaMax - gold.lambdaMax) / Math.max(Math.abs(gold.lambdaMax), 1e-30);
  const vol = Math.abs(toy.V_mL - gold.V_mL) / Math.max(Math.abs(gold.V_mL), 1e-30);
  const p = Math.abs(toy.p_Pa - gold.p_Pa) / Math.max(Math.abs(gold.p_Pa), 1e-30);
  return lam <= INFLATE_BANDS.lambdaRel && vol <= INFLATE_BANDS.volumeRel && p <= INFLATE_BANDS.pressureRel;
}
