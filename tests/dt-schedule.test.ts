import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";

describe("dtSchedule lockstep", () => {
  it("honors a fixed DT2 schedule length and end time", () => {
    const model = createTaylorBarModel({ nSide: 2, nZ: 2 });
    model.controls.endTime = 5e-7;
    model.controls.runToEnd = true;
    const schedule = Array.from({ length: 20 }, () => 1e-7);
    const result = solveExplicit(model, { dtSchedule: schedule, maxWallMs: 60_000 });
    expect(result.metrics.nSteps).toBe(5);
    expect(result.metrics.nSteps).toBeLessThanOrEqual(schedule.length);
  }, 60_000);
});
