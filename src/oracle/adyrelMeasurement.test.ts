import { describe, expect, it } from "vitest";
import {
  movedTowardGolden,
  nearestFrame,
  sphereCrossing,
  SPHERE_LAMBDA_STAR,
} from "./adyrelMeasurement.js";

describe("measurement helpers", () => {
  it("picks the nearest frame within 1.5 ms", () => {
    const frames = [
      { t: 0, lambdaMax: 1, p_Pa: 0, V_mL: 420 },
      { t: 0.002, lambdaMax: 1.12, p_Pa: 3250, V_mL: 520 },
    ];
    expect(nearestFrame(frames, 0.002)?.lambdaMax).toBe(1.12);
    expect(nearestFrame(frames, 0.02)).toBeNull();
  });

  it("interpolates the 1.383 stretch crossing", () => {
    const frames = [
      { t: 0.006, lambdaMax: 1.28, p_Pa: 9750, V_mL: 570 },
      { t: 0.008, lambdaMax: 1.41, p_Pa: 13000, V_mL: 602 },
    ];
    const cross = sphereCrossing(frames, SPHERE_LAMBDA_STAR);
    expect(cross).not.toBeNull();
    if (cross === null) return;
    expect(cross.lambdaMax).toBeCloseTo(1.383, 3);
    expect(cross.t).toBeGreaterThan(0.006);
    expect(cross.t).toBeLessThan(0.008);
  });

  it("movedTowardGolden is closer, not merely different", () => {
    const gold = { t: 0.016, lambdaMax: 2.128, p_Pa: 26000, V_mL: 892 };
    const killOff = { t: 0.016, lambdaMax: 2.105, p_Pa: 26000, V_mL: 866 };
    const lower = { t: 0.016, lambdaMax: 2.08, p_Pa: 26000, V_mL: 850 };
    expect(movedTowardGolden(lower, killOff, gold).stretch).toBe(false);
    expect(movedTowardGolden(killOff, lower, gold).stretch).toBe(true);
  });
});
