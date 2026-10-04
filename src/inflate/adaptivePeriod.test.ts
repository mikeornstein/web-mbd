import { describe, expect, it } from "vitest";
import {
  ADYREL_BETA,
  ADYREL_FIRST_ON_NUMERATOR,
  ADYREL_FIRST_ON_WAIT_STEPS,
  ADYREL_INTERNAL_ENERGY_FLOOR,
  ADYREL_KINETIC_INTERNAL_IGNORE,
  ADYREL_KINETIC_PEAK_HALF_FLOOR,
  ADYREL_KINETIC_PEAK_RATE_FACTOR,
  ADYREL_NO_PEAK_CUTBACK_FACTOR,
  ADYREL_RATE_CAP_NUMERATOR,
  ENGINE_LISTING_FIRST_ON_DT_S,
  ENGINE_LISTING_FIRST_ON_RATE_PER_S,
  ENGINE_LISTING_FIRST_ON_TIME_S,
  createAdaptivePeriodState,
  firstOnRatePerSecond,
  firstOnWaitReached,
  mixRelaxedVelocity,
  omegaFromRate,
  rateCapPerSecond,
  tickAdaptivePeriod,
} from "./adaptivePeriod.js";

describe("adaptive period constants (from the description, not fitted)", () => {
  it("pins the copied listing onset and the formula numerators", () => {
    expect(ENGINE_LISTING_FIRST_ON_TIME_S).toBe(0.00279);
    expect(ENGINE_LISTING_FIRST_ON_DT_S).toBe(1.971e-6);
    expect(ADYREL_FIRST_ON_WAIT_STEPS).toBe(200);
    expect(ADYREL_FIRST_ON_NUMERATOR).toBe(1e-4);
    expect(ADYREL_RATE_CAP_NUMERATOR).toBe(0.01);
    expect(ADYREL_INTERNAL_ENERGY_FLOOR).toBe(1e-12);
    expect(ADYREL_KINETIC_INTERNAL_IGNORE).toBe(0.001);
    expect(ADYREL_KINETIC_PEAK_RATE_FACTOR).toBe(1.5);
    expect(ADYREL_KINETIC_PEAK_HALF_FLOOR).toBe(0.5);
    expect(ADYREL_NO_PEAK_CUTBACK_FACTOR).toBe(1.1);
    expect(ADYREL_BETA).toBe(1);
    expect(ENGINE_LISTING_FIRST_ON_RATE_PER_S).toBeCloseTo(50.74, 1);
    expect(firstOnRatePerSecond(ENGINE_LISTING_FIRST_ON_DT_S)).toBeCloseTo(50.74, 1);
  });

  it("does not substitute the listing 51 per second for 10⁻⁴ / toy Δt", () => {
    const toyDt = 8.23e-6;
    expect(firstOnRatePerSecond(toyDt)).toBeCloseTo(12.15, 1);
    expect(firstOnRatePerSecond(toyDt)).not.toBeCloseTo(ENGINE_LISTING_FIRST_ON_RATE_PER_S, 0);
    expect(rateCapPerSecond(toyDt)).toBe(0.01 / toyDt);
  });
});

describe("adaptive period first-on wait", () => {
  it("per-step waits 200 toy steps; per-second waits the copied 2.79 ms", () => {
    expect(firstOnWaitReached("per-step", 199, 0.01)).toBe(false);
    expect(firstOnWaitReached("per-step", 200, 0.001)).toBe(true);
    expect(firstOnWaitReached("per-second", 200, 0.00165)).toBe(false);
    expect(firstOnWaitReached("per-second", 50, ENGINE_LISTING_FIRST_ON_TIME_S)).toBe(true);
  });
});

describe("adaptive period tick", () => {
  it("cycle 0 does not turn the rate on", () => {
    const t0 = tickAdaptivePeriod(createAdaptivePeriodState(), {
      step: 0,
      time: 0,
      dt: 1e-5,
      internal: 1,
      kinetic: 0.1,
      port: "per-second",
    });
    expect(t0.state.ratePerSecond).toBe(0);
    expect(t0.firstOn).toBe(false);
    expect(t0.periodFrom).toBe("zero");
  });

  it("per-second first-on uses 10⁻⁴ / Δt at the copied listing time, not 200 toy steps", () => {
    const dt = 8e-6;
    let state = createAdaptivePeriodState();
    state = tickAdaptivePeriod(state, {
      step: 0,
      time: 0,
      dt,
      internal: 0.2,
      kinetic: 0.05,
      port: "per-second",
    }).state;
    const before = tickAdaptivePeriod(state, {
      step: 200,
      time: 0.00165,
      dt,
      internal: 0.2,
      kinetic: 0.05,
      port: "per-second",
    });
    expect(before.firstOn).toBe(false);
    expect(before.state.ratePerSecond).toBe(0);
    const on = tickAdaptivePeriod(before.state, {
      step: 340,
      time: ENGINE_LISTING_FIRST_ON_TIME_S,
      dt,
      internal: 0.2,
      kinetic: 0.05,
      port: "per-second",
    });
    expect(on.firstOn).toBe(true);
    expect(on.state.ratePerSecond).toBe(firstOnRatePerSecond(dt));
    expect(on.periodFrom).toBe("first-on");
  });

  it("per-step first-on fires at 200 toy steps even if physical time is early", () => {
    const dt = 8e-6;
    let state = createAdaptivePeriodState();
    state = tickAdaptivePeriod(state, {
      step: 0,
      time: 0,
      dt,
      internal: 0.2,
      kinetic: 0.05,
      port: "per-step",
    }).state;
    const on = tickAdaptivePeriod(state, {
      step: 200,
      time: 200 * dt,
      dt,
      internal: 0.2,
      kinetic: 0.05,
      port: "per-step",
    });
    expect(on.firstOn).toBe(true);
    expect(on.state.ratePerSecond).toBe(1e-4 / dt);
    expect(200 * dt).toBeLessThan(ENGINE_LISTING_FIRST_ON_TIME_S);
  });

  it("internal-energy peak after first-on only lowers the rate to one over the max rising time", () => {
    const dt = 1e-5;
    let state = createAdaptivePeriodState();
    state = tickAdaptivePeriod(state, {
      step: 0,
      time: 0,
      dt,
      internal: 0.1,
      kinetic: 0.01,
      port: "per-second",
    }).state;
    state = tickAdaptivePeriod(state, {
      step: 1,
      time: ENGINE_LISTING_FIRST_ON_TIME_S,
      dt,
      internal: 0.2,
      kinetic: 0.02,
      port: "per-second",
    }).state;
    expect(state.ratePerSecond).toBe(firstOnRatePerSecond(dt));
    const riseSteps = 50;
    for (let i = 0; i < riseSteps; i++) {
      state = tickAdaptivePeriod(state, {
        step: 2 + i,
        time: ENGINE_LISTING_FIRST_ON_TIME_S + (i + 1) * dt,
        dt,
        internal: 0.2 + (i + 1) * 0.01,
        kinetic: 0.02,
        port: "per-second",
      }).state;
    }
    const peak = tickAdaptivePeriod(state, {
      step: 2 + riseSteps,
      time: ENGINE_LISTING_FIRST_ON_TIME_S + (riseSteps + 1) * dt,
      dt,
      internal: 0.1,
      kinetic: 0.02,
      port: "per-second",
    });
    expect(peak.internalPeak).toBe(true);
    expect(peak.state.ratePerSecond).toBeLessThanOrEqual(firstOnRatePerSecond(dt));
    expect(peak.state.ratePerSecond).toBe(Math.min(firstOnRatePerSecond(dt), 1 / peak.state.maxRiseInternal));
    expect(peak.periodFrom).toBe("internal-rise");
  });

  it("rate is not increased after first-on", () => {
    const dt = 1e-5;
    let state = createAdaptivePeriodState();
    state = tickAdaptivePeriod(state, {
      step: 0,
      time: 0,
      dt,
      internal: 1,
      kinetic: 0.1,
      port: "per-step",
    }).state;
    state = tickAdaptivePeriod(state, {
      step: 200,
      time: 0.002,
      dt,
      internal: 1,
      kinetic: 0.1,
      port: "per-step",
    }).state;
    const first = state.ratePerSecond;
    const later = tickAdaptivePeriod(state, {
      step: 201,
      time: 0.00201,
      dt,
      internal: 2,
      kinetic: 0.2,
      port: "per-step",
    });
    expect(later.state.ratePerSecond).toBeLessThanOrEqual(first);
  });

  it("ignores a kinetic peak when kinetic energy is below 0.001 of internal energy", () => {
    const dt = 1e-5;
    let state = createAdaptivePeriodState();
    state = tickAdaptivePeriod(state, {
      step: 0,
      time: 0,
      dt,
      internal: 1,
      kinetic: 1e-6,
      port: "per-step",
    }).state;
    state = tickAdaptivePeriod(state, {
      step: 200,
      time: 0.002,
      dt,
      internal: 1,
      kinetic: 1e-6,
      port: "per-step",
    }).state;
    const first = state.ratePerSecond;
    const peak = tickAdaptivePeriod(state, {
      step: 201,
      time: 0.00201,
      dt,
      internal: 1,
      kinetic: 1e-7,
      port: "per-step",
    });
    expect(peak.kineticPeak).toBe(true);
    expect(peak.state.ratePerSecond).toBe(first);
  });

  it("help-page mix is the usual leapfrog step when the rate is zero", () => {
    expect(mixRelaxedVelocity(1, 2, 0.5, 0)).toBe(2);
    const omega = omegaFromRate(50, 2e-6);
    expect(omega).toBe(50 * 2e-6);
    expect(mixRelaxedVelocity(1, 0, 2e-6, omega)).toBe(1 - 2 * omega);
  });
});
