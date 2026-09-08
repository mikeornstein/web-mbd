import type { EnergySample, ModelIR, SolveResult, TaylorMetrics } from "../ir/types.js";
import { assertModel } from "../ir/validate.js";
import { applyRigidWallPenalty } from "./contactWall.js";
import {
  characteristicLength,
  createHexGpStates,
  gatherHex,
  hexInternalForces,
  hexLumpedNodalMass,
} from "./hex.js";
import { dilatationalWaveSpeed, lame, type J2State } from "./materialJ2.js";

export interface SolveOptions {
  maxWallMs?: number;
}

export function solveExplicit(model: ModelIR, options: SolveOptions = {}): SolveResult {
  assertModel(model);
  const wallClock0 = performance.now();

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
    hexStates.push(createHexGpStates());
    minH = Math.min(minH, characteristicLength(xScratch));
  }

  for (let a = 0; a < nNodes; a++) {
    if (!(masses[a]! > 0)) throw new Error(`zero mass at node ${a}`);
  }

  const cd = dilatationalWaveSpeed(model.material);
  const dtCrit = minH / cd;
  let dt = model.controls.fixedDt ?? model.controls.cfl * dtCrit;
  if (!(dt > 0) || dt > dtCrit) dt = model.controls.cfl * dtCrit;

  const lameParams = lame(model.material.young, model.material.poisson);
  const bulk = lameParams.bulk;
  const wall = { ...model.wall };
  if (wall.penalty <= 0) {
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

  const assemble = (): { contactEnergy: number } => {
    f.fill(0);
    for (let e = 0; e < nHex; e++) {
      const conn = hexConn[e]!;
      gatherHex(x, conn, xScratch);
      gatherHex(v, conn, vScratch);
      hexInternalForces({
        x: xScratch,
        v: vScratch,
        states: hexStates[e]!,
        mat: model.material,
        dt,
        fOut: fHex,
      });
      for (let ai = 0; ai < 8; ai++) {
        const n = conn[ai]!;
        f[n * 3]! -= fHex[ai * 3]!;
        f[n * 3 + 1]! -= fHex[ai * 3 + 1]!;
        f[n * 3 + 2]! -= fHex[ai * 3 + 2]!;
      }
    }
    return applyRigidWallPenalty({ wall, coords: x, forces: f });
  };

  // Initial force evaluation for the half-step kick; do not accumulate energy yet.
  let { contactEnergy } = assemble();
  for (let i = 0; i < nNodes; i++) {
    acc[i * 3] = f[i * 3]! / masses[i]!;
    acc[i * 3 + 1] = f[i * 3 + 1]! / masses[i]!;
    acc[i * 3 + 2] = f[i * 3 + 2]! / masses[i]!;
  }
  for (let i = 0; i < v.length; i++) v[i]! += 0.5 * dt * acc[i]!;

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

    for (let i = 0; i < x.length; i++) x[i]! += dt * v[i]!;
    t += dt;
    step += 1;

    ({ contactEnergy } = assemble());

    for (let i = 0; i < nNodes; i++) {
      acc[i * 3] = f[i * 3]! / masses[i]!;
      acc[i * 3 + 1] = f[i * 3 + 1]! / masses[i]!;
      acc[i * 3 + 2] = f[i * 3 + 2]! / masses[i]!;
    }
    for (let i = 0; i < v.length; i++) v[i]! += dt * acc[i]!;

    let keAfter = 0;
    for (let i = 0; i < nNodes; i++) {
      const vx = v[i * 3]!;
      const vy = v[i * 3 + 1]!;
      const vz = v[i * 3 + 2]!;
      keAfter += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
    }
    // Discrete work identity: ΔIE = -ΔKE - ΔPE_contact (no other external work).
    internalEnergy += keBefore - keAfter - (contactEnergy - contactBefore);
    if (t + 1e-18 >= nextSample || t >= model.controls.endTime - 1e-18) {
      history.push(sample(contactEnergy));
      nextSample += model.output.historyInterval;
    }

    const last = history[history.length - 1]!;
    if (
      t > 0.25 * model.controls.endTime &&
      last.kinetic < 1e-4 * Math.abs(E0) &&
      last.contact < 1e-4 * Math.abs(E0)
    ) {
      break;
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
