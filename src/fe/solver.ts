import type { EnergySample, ModelIR, SolveResult, TaylorMetrics } from "../ir/types.js";
import { assertModel } from "../ir/validate.js";
import { applyRigidWallKinematic, applyRigidWallPenalty } from "./contactWall.js";
import {
  characteristicLength,
  createHexGpStates,
  gatherHex,
  hexInternalForces,
  hexLumpedNodalMass,
  type HexForceOptions,
} from "./hex.js";
import { dilatationalWaveSpeed, lame, type J2State } from "./materialJ2.js";
import type { MaterialJ2Linear } from "../ir/types.js";

/** Pluggable hex force eval (defaults to TypeScript `hexInternalForces`). */
export type HexForceFn = (args: {
  x: Float64Array;
  v: Float64Array;
  states: J2State[];
  mat: MaterialJ2Linear;
  dt: number;
  fOut: Float64Array;
  options?: HexForceOptions;
  /** Element index in the model hex list (0..nHex-1). Used by OR SMSTR cache. */
  elementIndex?: number;
}) => number;

export interface SolveOptions {
  maxWallMs?: number;
  /**
   * Optional Radioss-style DT2 schedule (one entry per cycle). When set,
   * overrides adaptive/fixed CFL and uses `dtSchedule[step]` as DT2.
   * Useful for lockstep parity experiments against an OpenRadioss `.out`.
   */
  dtSchedule?: ArrayLike<number>;
  /**
   * Override hex force evaluation (e.g. native shared kernel from `cli/forceNative`).
   * Default: TypeScript `hexInternalForces`.
   */
  hexForce?: HexForceFn;
  /**
   * Optional mesh-level force assembly (replaces per-hex `hexForce` loop).
   * Must fill `f` with the same nodal internal forces as element-major
   * `f -= fHex` (i.e. −FORINT / +∫Bᵀσ convention already applied).
   */
  assembleForces?: (args: {
    x: Float64Array;
    v: Float64Array;
    hexStates: J2State[][];
    hexConn: number[][];
    mat: MaterialJ2Linear;
    dt: number;
    f: Float64Array;
  }) => void;
}

export function solveExplicit(model: ModelIR, options: SolveOptions = {}): SolveResult {
  assertModel(model);
  const wallClock0 = performance.now();
  const hexForce = options.hexForce ?? hexInternalForces;
  const assembleForces = options.assembleForces;

  const nNodes = model.mesh.coords.length / 3;
  const nHex = model.mesh.hexes.length / 8;
  const x = Float64Array.from(model.mesh.coords);
  const v = new Float64Array(nNodes * 3);
  for (let a = 0; a < nNodes; a++) {
    v[a * 3] = model.initialVelocity[0];
    v[a * 3 + 1] = model.initialVelocity[1];
    v[a * 3 + 2] = model.initialVelocity[2];
  }

  const masses = new Float64Array(nNodes);
  const xScratch = new Float64Array(24);
  const vScratch = new Float64Array(24);
  const fHex = new Float64Array(24);
  const hexConn: number[][] = [];
  const hexStates: J2State[][] = [];
  let minH = Infinity;

  for (let e = 0; e < nHex; e++) {
    const conn = model.mesh.hexes.slice(e * 8, e * 8 + 8);
    hexConn.push(conn);
    gatherHex(x, conn, xScratch);
    const m = hexLumpedNodalMass(xScratch, model.material.density);
    for (let a = 0; a < 8; a++) masses[conn[a]!]! += m[a]!;
    hexStates.push(createHexGpStates(Float64Array.from(xScratch)));
    minH = Math.min(minH, characteristicLength(xScratch, model.material.poisson));
  }

  for (let a = 0; a < nNodes; a++) {
    if (!(masses[a]! > 0)) throw new Error(`zero mass at node ${a}`);
  }

  const cd = dilatationalWaveSpeed(model.material);
  const dtCrit0 = minH / cd;
  const dtSchedule = options.dtSchedule;
  let dt =
    dtSchedule && dtSchedule.length > 0
      ? Number(dtSchedule[0])
      : (model.controls.fixedDt ?? model.controls.cfl * dtCrit0);
  if (!(dt > 0) || (!dtSchedule && !model.controls.fixedDt && dt > dtCrit0)) {
    dt = model.controls.cfl * dtCrit0;
  }
  const adaptiveDt =
    !dtSchedule && model.controls.fixedDt === undefined && model.controls.adaptiveDt !== false;

  const recomputeDt = (): void => {
    if (dtSchedule) {
      const next = Number(dtSchedule[step] ?? dtSchedule[dtSchedule.length - 1]);
      if (next > 0 && Number.isFinite(next)) dt = next;
      return;
    }
    if (!adaptiveDt) return;
    let h = Infinity;
    for (let e = 0; e < nHex; e++) {
      gatherHex(x, hexConn[e]!, xScratch);
      h = Math.min(h, characteristicLength(xScratch, model.material.poisson));
    }
    const dtNew = model.controls.cfl * (h / cd);
    // Radioss resol.F: DT2 = MIN(DT2, 1.1*DT2OLD, DTMX)
    if (dtNew > 0 && Number.isFinite(dtNew)) dt = Math.min(dtNew, 1.1 * dt);
  };

  const lameParams = lame(model.material.young, model.material.poisson);
  const bulk = lameParams.bulk;
  const wall = { ...model.wall };
  const wallKind = wall.kind ?? "kinematic";
  if (wallKind === "penalty" && wall.penalty <= 0) {
    wall.penalty = (2 * bulk * Math.PI * model.reference.radius0 ** 2) / minH;
  }

  const history: EnergySample[] = [];
  let internalEnergy = 0;
  let E0 = 0;
  let step = 0;
  let t = 0;
  const maxSteps = model.controls.maxSteps ?? 5_000_000;
  const maxWallMs = options.maxWallMs ?? 180_000;
  let nextSample = 0;
  const runToEnd = model.controls.runToEnd === true;

  const f = new Float64Array(nNodes * 3);
  const acc = new Float64Array(nNodes * 3);

  const sample = (contactEnergy: number): EnergySample => {
    let ke = 0;
    for (let i = 0; i < nNodes; i++) {
      const vx = v[i * 3]!;
      const vy = v[i * 3 + 1]!;
      const vz = v[i * 3 + 2]!;
      ke += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
    }
    const total = ke + internalEnergy + contactEnergy;
    if (history.length === 0) E0 = total;
    const errorPct = Math.abs(E0) < 1e-30 ? 0 : (100 * (total - E0)) / Math.abs(E0);
    return {
      t,
      kinetic: ke,
      internal: internalEnergy,
      contact: contactEnergy,
      total,
      errorPct,
    };
  };

  // Radioss M2LAW / SROTA3 / SRHO3 use DT1 (prior DT2; 0 on cycle 0), not DT2.
  // FORINT runs before DT2 is recomputed — pass dt1 into the force kernel.
  let dt1 = 0;

  const assembleInternal = (): void => {
    f.fill(0);
    if (assembleForces) {
      assembleForces({
        x,
        v,
        hexStates,
        hexConn,
        mat: model.material,
        dt: dt1,
        f,
      });
      return;
    }
    for (let e = 0; e < nHex; e++) {
      const conn = hexConn[e]!;
      gatherHex(x, conn, xScratch);
      gatherHex(v, conn, vScratch);
      hexForce({
        x: xScratch,
        v: vScratch,
        states: hexStates[e]!,
        mat: model.material,
        dt: dt1,
        fOut: fHex,
        elementIndex: e,
      });
      for (let ai = 0; ai < 8; ai++) {
        const n = conn[ai]!;
        f[n * 3]! -= fHex[ai * 3]!;
        f[n * 3 + 1]! -= fHex[ai * 3 + 1]!;
        f[n * 3 + 2]! -= fHex[ai * 3 + 2]!;
      }
    }
  };

  const applyWallForces = (): number => {
    if (wallKind === "penalty") {
      return applyRigidWallPenalty({ wall, coords: x, forces: f }).contactEnergy;
    }
    return 0;
  };

  const applyWallKinematics = (dt2: number, dt12: number): void => {
    if (wallKind === "kinematic") {
      applyRigidWallKinematic({
        wall,
        coords: x,
        velocities: v,
        accelerations: acc,
        dt: dt2,
        dt12,
      });
    }
  };

  // Radioss resol CD: FORINT(X,DT1) → DT2/DT12 → RGWALL → V+=A·DT12 → X+=V·DT2.
  // Cold DT1=0 ⇒ first-cycle constitutive G·DT1=0 (live SIG stays 0) and DT12=DT2/2.
  let contactEnergy = 0;
  history.push(sample(contactEnergy));
  nextSample = model.output.historyInterval;

  while (t < model.controls.endTime - 1e-18 && step < maxSteps) {
    if (performance.now() - wallClock0 > maxWallMs) {
      throw new Error(`solve exceeded ${maxWallMs} ms at t=${t}, step=${step}`);
    }

    let keBefore = 0;
    for (let i = 0; i < nNodes; i++) {
      const vx = v[i * 3]!;
      const vy = v[i * 3 + 1]!;
      const vz = v[i * 3 + 2]!;
      keBefore += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
    }
    const contactBefore = contactEnergy;

    assembleInternal();
    contactEnergy = applyWallForces();
    for (let i = 0; i < nNodes; i++) {
      acc[i * 3] = f[i * 3]! / masses[i]!;
      acc[i * 3 + 1] = f[i * 3 + 1]! / masses[i]!;
      acc[i * 3 + 2] = f[i * 3 + 2]! / masses[i]!;
    }

    // resol.F: DT1 carries prior DT2 (0 on cycle 0); recompute DT2; DT12=½(DT1+DT2).
    recomputeDt();
    const dt12 = 0.5 * (dt1 + dt);
    // RGWAL once before VELOCITY (rgwall.F predicts with DT12/DT2).
    applyWallKinematics(dt, dt12);
    for (let i = 0; i < v.length; i++) v[i]! += dt12 * acc[i]!;

    for (let i = 0; i < x.length; i++) x[i]! += dt * v[i]!;
    t += dt;
    step += 1;
    dt1 = dt;

    let keAfter = 0;
    for (let i = 0; i < nNodes; i++) {
      const vx = v[i * 3]!;
      const vy = v[i * 3 + 1]!;
      const vz = v[i * 3 + 2]!;
      keAfter += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
    }
    // Discrete work identity: ΔIE = -ΔKE - ΔPE_contact (no other external work).
    // Contact energy is re-evaluated after the position update for the sample.
    if (wallKind === "penalty") {
      f.fill(0);
      contactEnergy = applyWallForces();
    }
    internalEnergy += keBefore - keAfter - (contactEnergy - contactBefore);
    if (t + 1e-18 >= nextSample || t >= model.controls.endTime - 1e-18) {
      history.push(sample(contactEnergy));
      nextSample += model.output.historyInterval;
    }

    if (!runToEnd) {
      const last = history[history.length - 1]!;
      if (
        t > 0.25 * model.controls.endTime &&
        last.kinetic < 1e-4 * Math.abs(E0) &&
        last.contact < 1e-4 * Math.abs(E0)
      ) {
        break;
      }
    }
  }

  return {
    coords: x,
    history,
    metrics: makeMetrics(model, x, history, hexStates, step, performance.now() - wallClock0),
  };
}

function makeMetrics(
  model: ModelIR,
  x: Float64Array,
  history: EnergySample[],
  hexStates: J2State[][],
  nSteps: number,
  elapsedMs: number,
): TaylorMetrics {
  let zMin = Infinity;
  let zMax = -Infinity;
  let rMax = 0;
  let maxDisplacement = 0;
  const nNodes = x.length / 3;
  const x0 = model.mesh.coords;
  for (let a = 0; a < nNodes; a++) {
    const xx = x[a * 3]!;
    const yy = x[a * 3 + 1]!;
    const zz = x[a * 3 + 2]!;
    zMin = Math.min(zMin, zz);
    zMax = Math.max(zMax, zz);
    rMax = Math.max(rMax, Math.hypot(xx, yy));
    const dx = xx - x0[a * 3]!;
    const dy = yy - x0[a * 3 + 1]!;
    const dz = zz - x0[a * 3 + 2]!;
    maxDisplacement = Math.max(maxDisplacement, Math.hypot(dx, dy, dz));
  }
  let maxEqPlasticStrain = 0;
  for (const gps of hexStates) {
    for (const gp of gps) {
      maxEqPlasticStrain = Math.max(maxEqPlasticStrain, gp.eqPlasticStrain);
    }
  }
  const finalLength = zMax - zMin;
  const last = history[history.length - 1]!;
  return {
    finalLength,
    finalMaxRadius: rMax,
    lengthRatio: finalLength / model.reference.length0,
    radiusRatio: rMax / model.reference.radius0,
    axialShortening: model.reference.length0 - finalLength,
    maxDisplacement,
    maxEqPlasticStrain,
    energyErrorPct: last.errorPct,
    nSteps,
    elapsedMs,
  };
}
