import { describe, expect, it } from "vitest";
import { createChain, step, totalEnergy, type ChainParams } from "./chain";

const singleSpring: ChainParams = {
  nodeCount: 2,
  mass: 1,
  stiffness: 4, // omega = sqrt(k/m) = 2, period = pi
  restLength: 1,
  gravity: 0,
  damping: 0,
};

describe("explicit chain integrator", () => {
  it("oscillates a displaced single spring-mass about equilibrium", () => {
    const state = createChain(singleSpring);
    // Displace the free node outward along +x by 0.5.
    state.positions[2] += 0.5;

    let minX = Infinity;
    let maxX = -Infinity;
    const dt = 1e-3;
    for (let i = 0; i < 20000; i++) {
      step(state, singleSpring, dt);
      minX = Math.min(minX, state.positions[2]);
      maxX = Math.max(maxX, state.positions[2]);
    }

    // Free node should swing to both sides of the rest position (x = 1).
    expect(minX).toBeLessThan(0.75);
    expect(maxX).toBeGreaterThan(1.25);
  });

  it("keeps bounded energy for a stable time step", () => {
    const state = createChain(singleSpring);
    state.positions[2] += 0.5;
    const e0 = totalEnergy(state, singleSpring);

    const dt = 1e-3;
    for (let i = 0; i < 20000; i++) step(state, singleSpring, dt);

    const e1 = totalEnergy(state, singleSpring);
    expect(Math.abs(e1 - e0) / e0).toBeLessThan(0.02);
  });

  it("is deterministic: identical inputs produce identical trajectories", () => {
    const run = () => {
      const s = createChain(singleSpring);
      s.positions[2] += 0.5;
      for (let i = 0; i < 500; i++) step(s, singleSpring, 1e-3);
      return Array.from(s.positions);
    };
    expect(run()).toEqual(run());
  });

  it("pins node 0 in place under gravity", () => {
    const params: ChainParams = { ...singleSpring, gravity: 9.81, nodeCount: 4 };
    const state = createChain(params);
    for (let i = 0; i < 1000; i++) step(state, params, 1e-3);
    expect(state.positions[0]).toBe(0);
    expect(state.positions[1]).toBe(0);
    // A free node must have fallen (y increases downward).
    expect(state.positions[3]).toBeGreaterThan(0);
  });
});
