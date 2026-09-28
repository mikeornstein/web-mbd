import { describe, expect, it } from "vitest";
import { applyAdyrelAcceleration, ADYREL_NC_ACT, createAdyrelState, stepEnerW0 } from "./adyrel.js";

describe("OpenRadioss /ADYREL analogue (static.F, no BETATE gain)", () => {
  it("does not start BETATE before NC_ACT=200", () => {
    const s = createAdyrelState();
    for (let n = 1; n < ADYREL_NC_ACT; n++) {
      stepEnerW0(s, { ke: 1e-4 * (1 + 0.01 * Math.sin(n)), ie: 1e-3 * n, dt: 1e-5, ncycle: n });
    }
    expect(s.betate).toBe(0);
  });

  it("starts BETATE at F_0 = 1e-4/dt once IE is on and ncycle>=200", () => {
    const s = createAdyrelState();
    const dt = 1e-5;
    for (let n = 1; n <= ADYREL_NC_ACT; n++) {
      stepEnerW0(s, { ke: 1e-4, ie: 1e-3, dt, ncycle: n });
    }
    expect(s.betate).toBeCloseTo(1e-4 / dt, 12);
    expect(s.ifirst).toBe(1);
  });

  it("applies ISTAT=1 A-update with DT12 and no 1.5× gain", () => {
    const acc = new Float64Array([1, 0, 0]);
    const v = new Float64Array([0.5, 0, 0]);
    const betate = 10;
    const dt12 = 1e-4;
    applyAdyrelAcceleration(acc, v, betate, dt12);
    const omega = betate * dt12;
    expect(acc[0]).toBeCloseTo((1 - omega) * 1 - 2 * betate * 0.5, 12);
  });
});
