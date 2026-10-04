/**
 * Continuous adaptive relaxation from the toy's own state.
 * Constants and the update rule come from
 * `docs/diag-pr18-openradioss-control/adyrel-period-description.md`
 * and the `/DYREL` help-page velocity mix. No fitted number.
 */

/** Copied from the golden listing at engine cycle 200 (description table: 2.79 ms). Not computed from the toy. */
export const ENGINE_LISTING_FIRST_ON_TIME_S = 0.00279;

/** Copied from the same description table (Δt at that listing row). Not a toy time step. */
export const ENGINE_LISTING_FIRST_ON_DT_S = 1.971e-6;

/**
 * 10⁻⁴ / (listing Δt) from the description table, about 51 per second.
 * Comparison print only. Not assigned as the toy's rate.
 */
export const ENGINE_LISTING_FIRST_ON_RATE_PER_S = 1e-4 / ENGINE_LISTING_FIRST_ON_DT_S;

/** First-on wait in engine cycles. Per-step port copies this as toy steps. */
export const ADYREL_FIRST_ON_WAIT_STEPS = 200;

/** Rate cap numerator: cap = 0.01 / Δt. Description table, no AMS. */
export const ADYREL_RATE_CAP_NUMERATOR = 0.01;

/** First-on numerator: rate = 10⁻⁴ / Δt = 0.01 × cap. */
export const ADYREL_FIRST_ON_NUMERATOR = 1e-4;

/** Internal-energy floor (double precision) from the description. */
export const ADYREL_INTERNAL_ENERGY_FLOOR = 1e-12;

/** Kinetic / internal ratio below which a kinetic peak is ignored. */
export const ADYREL_KINETIC_INTERNAL_IGNORE = 0.001;

/** Kinetic-peak rate must already be below 1.5 × candidate. */
export const ADYREL_KINETIC_PEAK_RATE_FACTOR = 1.5;

/** Kinetic-peak rate is not cut below half its current value. */
export const ADYREL_KINETIC_PEAK_HALF_FLOOR = 0.5;

/** No-peak cutback trigger: 1.1 × (1 / max period). */
export const ADYREL_NO_PEAK_CUTBACK_FACTOR = 1.1;

/** Relaxation factor β. `/DYREL` help default; description says a bare card uses 1. */
export const ADYREL_BETA = 1;

export type AdaptivePeriodPort = "per-second" | "per-step";

export type AdaptivePeriodSource = "zero" | "first-on" | "internal-rise" | "kinetic-rise";

export interface AdaptivePeriodState {
  ratePerSecond: number;
  prevInternal: number;
  prevKinetic: number;
  clockInternal: number;
  clockKinetic: number;
  maxRiseInternal: number;
  maxRiseKinetic: number;
  seenPrev: boolean;
  periodFrom: AdaptivePeriodSource;
}

export interface AdaptivePeriodInput {
  step: number;
  time: number;
  dt: number;
  internal: number;
  kinetic: number;
  port: AdaptivePeriodPort;
}

export interface AdaptivePeriodTick {
  state: AdaptivePeriodState;
  internalPeak: boolean;
  kineticPeak: boolean;
  firstOn: boolean;
  cutback: boolean;
  periodFrom: AdaptivePeriodSource;
}

export interface RelaxationSample {
  step: number;
  t: number;
  dt: number;
  ratePerSecond: number;
  omegaPerStep: number;
  maxRiseInternal: number;
  maxRiseKinetic: number;
  periodFrom: AdaptivePeriodSource;
  perStepFirstOnRatePerSecond: number;
  perSecondFirstOnRatePerSecond: number;
}

export interface OnsetSnapshot {
  step: number;
  t: number;
  dt: number;
  firstOnRatePerSecond: number;
  omegaPerStep: number;
}

export interface AdaptiveOnsetReport {
  perStep: OnsetSnapshot | null;
  perSecond: OnsetSnapshot | null;
  applied: OnsetSnapshot | null;
  periodFrom: AdaptivePeriodSource;
}

export function createAdaptivePeriodState(): AdaptivePeriodState {
  return {
    ratePerSecond: 0,
    prevInternal: 0,
    prevKinetic: 0,
    clockInternal: 0,
    clockKinetic: 0,
    maxRiseInternal: 0,
    maxRiseKinetic: 0,
    seenPrev: false,
    periodFrom: "zero",
  };
}

export function firstOnRatePerSecond(dt: number): number {
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  return ADYREL_FIRST_ON_NUMERATOR / dt;
}

export function rateCapPerSecond(dt: number): number {
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  return ADYREL_RATE_CAP_NUMERATOR / dt;
}

export function omegaFromRate(ratePerSecond: number, dtMix: number): number {
  return ratePerSecond * dtMix;
}

export function mixRelaxedVelocity(v: number, acc: number, dtMix: number, omega: number): number {
  return (1 - 2 * omega) * v + (1 - omega) * acc * dtMix;
}

export function firstOnWaitReached(port: AdaptivePeriodPort, step: number, time: number): boolean {
  switch (port) {
    case "per-step":
      return step >= ADYREL_FIRST_ON_WAIT_STEPS;
    case "per-second":
      return time >= ENGINE_LISTING_FIRST_ON_TIME_S;
    default: {
      const _exhaustive: never = port;
      throw new Error(`unhandled adaptive-period port ${String(_exhaustive)}`);
    }
  }
}

function peakOf(current: number, previous: number): boolean {
  return current < previous && current >= 0;
}

function longerRiseSource(maxRiseInternal: number, maxRiseKinetic: number): AdaptivePeriodSource {
  if (maxRiseInternal >= maxRiseKinetic) return "internal-rise";
  return "kinetic-rise";
}

/**
 * One-step period and rate update. Clocks and max rising times update every
 * step. The rate changes only at first-on, an energy peak, or the 1.1 cutback.
 */
export function tickAdaptivePeriod(state: AdaptivePeriodState, input: AdaptivePeriodInput): AdaptivePeriodTick {
  if (input.step === 0 || !(input.dt > 0)) {
    return {
      state: {
        ...state,
        prevInternal: input.internal,
        prevKinetic: input.kinetic,
        seenPrev: true,
      },
      internalPeak: false,
      kineticPeak: false,
      firstOn: false,
      cutback: false,
      periodFrom: state.periodFrom,
    };
  }

  const internalPeak = state.seenPrev && peakOf(input.internal, state.prevInternal);
  const kineticPeak = state.seenPrev && peakOf(input.kinetic, state.prevKinetic);

  const clockInternal = internalPeak ? 0 : state.clockInternal + input.dt;
  const clockKinetic = kineticPeak ? 0 : state.clockKinetic + input.dt;
  const maxRiseInternal = Math.max(state.maxRiseInternal, clockInternal);
  const maxRiseKinetic = Math.max(state.maxRiseKinetic, clockKinetic);

  const cap = rateCapPerSecond(input.dt);
  const firstOnRate = firstOnRatePerSecond(input.dt);
  let rate = state.ratePerSecond;
  let firstOn = false;
  let cutback = false;
  let periodFrom = state.periodFrom;

  if (!(rate > 0)) {
    const waitReached = firstOnWaitReached(input.port, input.step, input.time);
    const energyOk = input.internal > ADYREL_INTERNAL_ENERGY_FLOOR;
    if ((waitReached && energyOk) || ((internalPeak || kineticPeak) && energyOk)) {
      rate = firstOnRate;
      firstOn = true;
      periodFrom = "first-on";
    }
  } else {
    if (internalPeak) {
      const fromPeriod = maxRiseInternal > 0 ? 1 / maxRiseInternal : cap;
      rate = Math.min(rate, Math.min(cap, fromPeriod));
      periodFrom = "internal-rise";
    }
    if (kineticPeak) {
      const internalAbs = input.internal;
      if (internalAbs > 0 && input.kinetic > ADYREL_KINETIC_INTERNAL_IGNORE * internalAbs) {
        const fromPeriod = maxRiseKinetic > 0 ? 1 / maxRiseKinetic : cap;
        const candidate = Math.min(cap, fromPeriod);
        if (rate < ADYREL_KINETIC_PEAK_RATE_FACTOR * candidate) {
          const high = Math.min(rate, candidate);
          const low = ADYREL_KINETIC_PEAK_HALF_FLOOR * state.ratePerSecond;
          rate = Math.max(low, high);
          periodFrom = "kinetic-rise";
        }
      }
    }
    if (!internalPeak && !kineticPeak) {
      const longest = Math.max(maxRiseInternal, maxRiseKinetic);
      if (longest > 0) {
        const oneOver = 1 / longest;
        if (rate > ADYREL_NO_PEAK_CUTBACK_FACTOR * oneOver) {
          rate = oneOver;
          cutback = true;
          periodFrom = longerRiseSource(maxRiseInternal, maxRiseKinetic);
        }
      }
    }
  }

  const next: AdaptivePeriodState = {
    ratePerSecond: rate,
    prevInternal: input.internal,
    prevKinetic: input.kinetic,
    clockInternal,
    clockKinetic,
    maxRiseInternal,
    maxRiseKinetic,
    seenPrev: true,
    periodFrom,
  };

  return {
    state: next,
    internalPeak,
    kineticPeak,
    firstOn,
    cutback,
    periodFrom,
  };
}
