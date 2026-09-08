/**
 * A minimal explicit-dynamics teaser: a 2D chain of point masses linked by
 * linear springs, integrated with semi-implicit (symplectic) Euler.
 *
 * This is intentionally small. It is not the production solver described in the
 * README — it exists so the pre/solve/post surface has something real and
 * deterministic to run while the WASM/WebGPU kernels are built out.
 */

export interface ChainParams {
  /** Total number of nodes, including the pinned node at index 0. */
  nodeCount: number;
  /** Mass of each free node. */
  mass: number;
  /** Linear spring stiffness between adjacent nodes. */
  stiffness: number;
  /** Natural (unstretched) length of each spring segment. */
  restLength: number;
  /** Gravitational acceleration, applied in +y (screen-down). */
  gravity: number;
  /** Linear velocity damping coefficient. */
  damping: number;
}

export interface ChainState {
  /** Flat [x0, y0, x1, y1, ...] node positions. */
  positions: Float64Array;
  /** Flat [vx0, vy0, vx1, vy1, ...] node velocities. */
  velocities: Float64Array;
}

/** Build a chain laid out horizontally from a pinned first node. */
export function createChain(params: ChainParams, originX = 0, originY = 0): ChainState {
  const positions = new Float64Array(params.nodeCount * 2);
  const velocities = new Float64Array(params.nodeCount * 2);
  for (let i = 0; i < params.nodeCount; i++) {
    positions[i * 2] = originX + i * params.restLength;
    positions[i * 2 + 1] = originY;
  }
  return { positions, velocities };
}

/**
 * Advance the chain by one explicit time step of size `dt`.
 *
 * Node 0 is pinned: its position and velocity are held fixed. Semi-implicit
 * Euler updates velocity from the current force, then advances position with
 * the new velocity, which keeps bounded-energy oscillations for stable `dt`.
 */
export function step(state: ChainState, params: ChainParams, dt: number): void {
  const { positions, velocities } = state;
  const n = params.nodeCount;
  const forces = new Float64Array(n * 2);

  for (let i = 1; i < n; i++) {
    forces[i * 2 + 1] += params.mass * params.gravity;
  }

  for (let i = 0; i < n - 1; i++) {
    const ax = positions[i * 2];
    const ay = positions[i * 2 + 1];
    const bx = positions[(i + 1) * 2];
    const by = positions[(i + 1) * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    const ext = len - params.restLength;
    const fmag = params.stiffness * ext;
    const fx = fmag * (dx / len);
    const fy = fmag * (dy / len);
    forces[i * 2] += fx;
    forces[i * 2 + 1] += fy;
    forces[(i + 1) * 2] -= fx;
    forces[(i + 1) * 2 + 1] -= fy;
  }

  for (let i = 1; i < n; i++) {
    forces[i * 2] -= params.damping * velocities[i * 2];
    forces[i * 2 + 1] -= params.damping * velocities[i * 2 + 1];
  }

  const invM = 1 / params.mass;
  for (let i = 1; i < n; i++) {
    velocities[i * 2] += (forces[i * 2] * invM) * dt;
    velocities[i * 2 + 1] += (forces[i * 2 + 1] * invM) * dt;
    positions[i * 2] += velocities[i * 2] * dt;
    positions[i * 2 + 1] += velocities[i * 2 + 1] * dt;
  }
}

/** Total mechanical energy (kinetic + spring strain), used for diagnostics/tests. */
export function totalEnergy(state: ChainState, params: ChainParams): number {
  const { positions, velocities } = state;
  const n = params.nodeCount;
  let ke = 0;
  for (let i = 1; i < n; i++) {
    const vx = velocities[i * 2];
    const vy = velocities[i * 2 + 1];
    ke += 0.5 * params.mass * (vx * vx + vy * vy);
  }
  let pe = 0;
  for (let i = 0; i < n - 1; i++) {
    const dx = positions[(i + 1) * 2] - positions[i * 2];
    const dy = positions[(i + 1) * 2 + 1] - positions[i * 2 + 1];
    const ext = Math.hypot(dx, dy) - params.restLength;
    pe += 0.5 * params.stiffness * ext * ext;
  }
  return ke + pe;
}
