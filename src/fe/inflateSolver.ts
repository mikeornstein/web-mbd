import { applyKissProjection, punchedThrough } from "./contactKiss.js";
import { membraneWaveSpeed } from "./materialNeoHookean.js";
import {
  accumulateCstForces,
  accumulatePressureTri,
  buildCstRest,
  cstSample,
  splitQuadCsts,
  type CstRest,
} from "./membraneCst.js";
import { ploadAt } from "../inflate/lawCard.js";
import { enclosedVolume, trueEnclosedVolume } from "../inflate/meshA.js";
import {
  createAdaptivePeriodState,
  firstOnRatePerSecond,
  mixRelaxedVelocity,
  omegaFromRate,
  tickAdaptivePeriod,
  type RelaxationSample,
  ENGINE_LISTING_FIRST_ON_TIME_S,
  ADYREL_FIRST_ON_WAIT_STEPS,
  type OnsetSnapshot,
} from "../inflate/adaptivePeriod.js";
import type {
  InflateModelIR,
  InflatePerStepEnergyLedger,
  InflatePerStepEnergySnapshot,
  InflateSolveMetrics,
  InflateSolveResult,
  InflateWarnMetrics,
} from "../inflate/types.js";
import type { EnergySample } from "../ir/types.js";

export interface InflateSolveOptions {
  maxWallMs?: number;
  onProgress?: (info: { t: number; endTime: number; step: number; lambdaMax: number }) => void;
  /**
   * Diagnosis only. Default (omit/false): stop at the first stretch ≥ 2, same
   * as the shipped toy. True keeps sampling to endTime so a kill-off curve can
   * be compared past the warn freeze. Does not change default callers.
   */
  continuePastWarn?: boolean;
  /**
   * Diagnosis only. Default (omit/false): letter A uses true enclosed volume
   * (outward shell required). True uses the signed tetrahedron sum so the
   * as-wound mesh can be run without flipping faces.
   */
  signedRestVolume?: boolean;
  /**
   * Diagnosis only. Default (omit/false): no per-step energy ledger.
   * True accumulates pressure work and damping at every solver step without
   * changing forces, positions, or time-step size.
   */
  recordPerStepEnergy?: boolean;
}

export function assertInflateModel(model: InflateModelIR): void {
  if (model.kind !== "inflate-nh-membrane") throw new Error("expected inflate-nh-membrane IR");
  if (model.meta.version !== 1) throw new Error("IR version must be 1");
  if (model.meta.units !== "SI") throw new Error("units must be SI");
  const { coords, quads, tris, nNodes, nQuads, nTris } = model.mesh;
  if (coords.length !== nNodes * 3) throw new Error("coords/nNodes mismatch");
  if (quads.length !== nQuads * 4) throw new Error("quads/nQuads mismatch");
  if (tris.length !== nTris * 3) throw new Error("tris/nTris mismatch");
  if (!(model.law.mu1 > 0)) throw new Error("mu1 must be > 0");
  if (!(model.law.rho > 0)) throw new Error("rho must be > 0");
  if (!(model.controls.endTime > 0)) throw new Error("endTime must be > 0");
  if (!(model.controls.cfl > 0 && model.controls.cfl <= 1)) throw new Error("cfl must be in (0, 1]");
  const kind = model.controls.contactKind;
  switch (kind) {
    case "node-node":
      break;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unhandled contactKind ${String(_exhaustive)}`);
    }
  }
  const damping = model.controls.damping;
  switch (damping.kind) {
    case "peak-kill":
      if (!(damping.scale >= 0) || !Number.isFinite(damping.scale)) {
        throw new Error("peak-kill scale must be a finite number ≥ 0");
      }
      if (!(damping.minInterval >= 0) || !Number.isFinite(damping.minInterval)) {
        throw new Error("peak-kill minInterval must be a finite number ≥ 0");
      }
      break;
    case "off":
      break;
    case "adaptive-period": {
      const port = damping.port;
      switch (port) {
        case "per-second":
        case "per-step":
          break;
        default: {
          const _exhaustive: never = port;
          throw new Error(`unhandled adaptive-period port ${String(_exhaustive)}`);
        }
      }
      break;
    }
    case "listing-rate-measurement":
      if (!(damping.ratePerSecond >= 0) || !Number.isFinite(damping.ratePerSecond)) {
        throw new Error("listing-rate-measurement rate must be a finite number ≥ 0");
      }
      break;
    default: {
      const _exhaustive: never = damping;
      throw new Error(`unhandled damping ${String(_exhaustive)}`);
    }
  }
  const dtMax = model.controls.dtMax;
  if (dtMax !== undefined && (!(dtMax > 0) || !Number.isFinite(dtMax))) {
    throw new Error("dtMax must be a positive finite number when set");
  }
}

export function solveInflate(model: InflateModelIR, options: InflateSolveOptions = {}): InflateSolveResult {
  assertInflateModel(model);
  const wallClock0 = performance.now();
  const { law, mesh, controls } = model;
  const nNodes = mesh.nNodes;
  const x = Float64Array.from(mesh.coords);
  const v = new Float64Array(nNodes * 3);
  const f = new Float64Array(nNodes * 3);
  const acc = new Float64Array(nNodes * 3);
  const masses = new Float64Array(nNodes);
  const rests: CstRest[] = [];
  const contactKind = controls.contactKind;

  let minH = Infinity;
  for (let e = 0; e < mesh.nQuads; e++) {
    const i0 = mesh.quads[e * 4]!,
      i1 = mesh.quads[e * 4 + 1]!,
      i2 = mesh.quads[e * 4 + 2]!,
      i3 = mesh.quads[e * 4 + 3]!;
    const pair = splitQuadCsts(mesh.coords, i0, i1, i2, i3);
    if (!pair) continue;
    rests.push(pair.a, pair.b);
    const massA = (law.rho * law.h0 * pair.a.A0) / 3;
    const massB = (law.rho * law.h0 * pair.b.A0) / 3;
    masses[pair.a.i]! += massA;
    masses[pair.a.j]! += massA;
    masses[pair.a.k]! += massA;
    masses[pair.b.i]! += massB;
    masses[pair.b.j]! += massB;
    masses[pair.b.k]! += massB;
    minH = Math.min(minH, Math.sqrt(2 * pair.a.A0), Math.sqrt(2 * pair.b.A0));
  }
  for (let e = 0; e < mesh.nTris; e++) {
    const rest = buildCstRest(
      mesh.coords,
      mesh.tris[e * 3]!,
      mesh.tris[e * 3 + 1]!,
      mesh.tris[e * 3 + 2]!,
    );
    if (!rest) continue;
    rests.push(rest);
    const mass = (law.rho * law.h0 * rest.A0) / 3;
    masses[rest.i]! += mass;
    masses[rest.j]! += mass;
    masses[rest.k]! += mass;
    minH = Math.min(minH, Math.sqrt(2 * rest.A0));
  }
  for (let a = 0; a < nNodes; a++) {
    if (!(masses[a]! > 0)) masses[a] = law.rho * law.h0 * minH * minH * 0.25;
  }

  const c = membraneWaveSpeed(law.mu1, law.rho, law.nu);
  const dtCrit0 = minH / c;
  let dt = controls.cfl * dtCrit0;
  if (!(dt > 0) || dt > dtCrit0) dt = controls.cfl * dtCrit0;
  const dtMax = controls.dtMax;
  if (dtMax !== undefined && dt > dtMax) dt = dtMax;

  const volume0 =
    options.signedRestVolume === true || mesh.letter !== "A"
      ? enclosedVolume(x, mesh.quads, mesh.tris)
      : trueEnclosedVolume(x, mesh.quads, mesh.tris);
  const stopAtWarn = options.continuePastWarn !== true;
  const history: EnergySample[] = [];
  const meshHistory: Float64Array[] = [];
  const lambdaHistory: number[] = [];
  const pressureHistory: number[] = [];
  const volumeHistory: number[] = [];
  const psiHistory: number[] = [];
  const relaxationHistory: RelaxationSample[] = [];

  let warn: InflateWarnMetrics | null = null;
  let step = 0;
  let t = 0;
  let dt1 = 0;
  let kePrev = 0;
  let kePrev2 = 0;
  let lastKiss: {
    pushed: number;
    minGap: number;
    viol: number;
    contactClass: InflateSolveMetrics["contactClass"];
  } = {
    pushed: 0,
    minGap: law.gapMin,
    viol: 0,
    contactClass: "type19-class-gapmin-node-node",
  };
  let punched = false;
  let incompressResidualMax = 0;
  let E0 = 0;
  let nextSample = 0;
  const maxSteps = controls.maxSteps;
  const maxWallMs = options.maxWallMs ?? 180_000;
  const alpha = law.rayleighAlpha;
  const damping = controls.damping;
  const recordPerStepEnergy = options.recordPerStepEnergy === true;
  let pressW = 0;
  let dampLogged = 0;
  let keIntegral = 0;
  let dampForce = 0;
  let dtSum = 0;
  let minDt = Infinity;
  let maxDt = 0;
  let kissPushedTotal = 0;
  let peakKillEvents = 0;
  let volPrev = enclosedVolume(x, mesh.quads, mesh.tris);
  const energySnapshots: InflatePerStepEnergySnapshot[] = [];
  let tKeDamp = -Infinity;
  let periodState = createAdaptivePeriodState();
  let lastOmega = 0;
  let perStepOnset: OnsetSnapshot | null = null;
  let perSecondOnset: OnsetSnapshot | null = null;
  let appliedOnset: OnsetSnapshot | null = null;

  const measure = (): {
    lambdaMax: number;
    psi: number;
    volume: number;
    ke: number;
  } => {
    let lambdaMax = 1;
    let psi = 0;
    let resid = 0;
    for (const rest of rests) {
      const s = cstSample(x, rest, law.mu1, law.h0);
      lambdaMax = Math.max(lambdaMax, s.lam1, s.lam2);
      psi += s.W;
      resid = Math.max(resid, s.incompressResidual);
    }
    incompressResidualMax = Math.max(incompressResidualMax, resid);
    let ke = 0;
    for (let i = 0; i < nNodes; i++) {
      const vx = v[i * 3]!,
        vy = v[i * 3 + 1]!,
        vz = v[i * 3 + 2]!;
      ke += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
    }
    return { lambdaMax, psi, volume: enclosedVolume(x, mesh.quads, mesh.tris), ke };
  };

  const recordSample = (p: number): void => {
    const m = measure();
    const total = m.ke + m.psi;
    if (history.length === 0) E0 = total;
    const errorPct = Math.abs(E0) < 1e-30 ? 0 : (100 * (total - E0)) / Math.abs(E0);
    history.push({
      t,
      kinetic: m.ke,
      internal: m.psi,
      contact: 0,
      total,
      errorPct,
    });
    meshHistory.push(Float64Array.from(x));
    lambdaHistory.push(m.lambdaMax);
    pressureHistory.push(p);
    volumeHistory.push(m.volume);
    psiHistory.push(m.psi);
    if (recordPerStepEnergy) {
      energySnapshots.push({
        t,
        pressureWork_J: pressW,
        strain_J: m.psi,
        kinetic_J: m.ke,
        dampingLogged_J: dampLogged,
        keIntegral_J_s: keIntegral,
        dampingForceWork_J: dampForce,
        nSteps: step,
        meanDt_s: step > 0 ? dtSum / step : 0,
        minDt_s: step > 0 ? minDt : 0,
        maxDt_s: maxDt,
        kissPushed: kissPushedTotal,
        peakKillEvents,
      });
    }
    if (damping.kind === "adaptive-period") {
      relaxationHistory.push({
        step,
        t,
        dt,
        ratePerSecond: periodState.ratePerSecond,
        omegaPerStep: lastOmega,
        maxRiseInternal: periodState.maxRiseInternal,
        maxRiseKinetic: periodState.maxRiseKinetic,
        periodFrom: periodState.periodFrom,
        perStepFirstOnRatePerSecond: firstOnRatePerSecond(dt),
        perSecondFirstOnRatePerSecond: firstOnRatePerSecond(dt),
      });
    }
    if (warn === null && m.lambdaMax >= law.warnLam) {
      warn = {
        frame: history.length - 1,
        t,
        lambdaMax: m.lambdaMax,
        p,
        volume_mL: m.volume * 1e6,
        psi_J: m.psi,
        warn: true,
      };
    }
  };

  const assemble = (p: number): void => {
    f.fill(0);
    for (const rest of rests) {
      accumulateCstForces(x, rest, f, law.mu1, law.h0);
      accumulatePressureTri(x, rest.i, rest.j, rest.k, p, f);
    }
    if (alpha > 0) {
      for (let i = 0; i < nNodes; i++) {
        const m = masses[i]!;
        f[i * 3]! -= alpha * m * v[i * 3]!;
        f[i * 3 + 1]! -= alpha * m * v[i * 3 + 1]!;
        f[i * 3 + 2]! -= alpha * m * v[i * 3 + 2]!;
      }
    }
  };

  const triMinEdge = (rest: CstRest): number => {
    const ix = x[rest.i * 3]!,
      iy = x[rest.i * 3 + 1]!,
      iz = x[rest.i * 3 + 2]!;
    const jx = x[rest.j * 3]!,
      jy = x[rest.j * 3 + 1]!,
      jz = x[rest.j * 3 + 2]!;
    const kx = x[rest.k * 3]!,
      ky = x[rest.k * 3 + 1]!,
      kz = x[rest.k * 3 + 2]!;
    return Math.min(
      Math.hypot(jx - ix, jy - iy, jz - iz),
      Math.hypot(kx - jx, ky - jy, kz - jz),
      Math.hypot(ix - kx, iy - ky, iz - kz),
    );
  };
  const recomputeDt = (): void => {
    let h = Infinity;
    for (const rest of rests) h = Math.min(h, triMinEdge(rest));
    const dtNew = controls.cfl * (h / c);
    if (dtNew > 0 && Number.isFinite(dtNew)) dt = Math.min(dtNew, 1.1 * dt);
    if (dtMax !== undefined && dt > dtMax) dt = dtMax;
  };

  if (damping.kind === "adaptive-period") {
    const restMeasure = measure();
    periodState = tickAdaptivePeriod(periodState, {
      step: 0,
      time: 0,
      dt,
      internal: restMeasure.psi,
      kinetic: restMeasure.ke,
      port: damping.port,
    }).state;
  }
  recordSample(0);
  nextSample = controls.historyInterval;
  options.onProgress?.({ t: 0, endTime: controls.endTime, step: 0, lambdaMax: 1 });

  while (t < controls.endTime - 1e-18 && step < maxSteps && !(stopAtWarn && warn !== null)) {
    if (performance.now() - wallClock0 > maxWallMs) {
      throw new Error(`inflate solve exceeded ${maxWallMs} ms at t=${t}, step=${step}`);
    }
    const p = ploadAt(t, law);
    assemble(p);
    for (let i = 0; i < nNodes; i++) {
      const rtmp = 1 / masses[i]!;
      acc[i * 3] = f[i * 3]! * rtmp;
      acc[i * 3 + 1] = f[i * 3 + 1]! * rtmp;
      acc[i * 3 + 2] = f[i * 3 + 2]! * rtmp;
    }
    recomputeDt();
    let keAssemble = 0;
    if (recordPerStepEnergy) {
      for (let i = 0; i < nNodes; i++) {
        const vx = v[i * 3]!,
          vy = v[i * 3 + 1]!,
          vz = v[i * 3 + 2]!;
        keAssemble += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
      }
    }
    const dt12 = 0.5 * (dt1 + dt);
    lastOmega = 0;
    if (damping.kind === "adaptive-period" && periodState.ratePerSecond > 0) {
      lastOmega = omegaFromRate(periodState.ratePerSecond, dt12);
      for (let i = 0; i < v.length; i++) {
        v[i] = mixRelaxedVelocity(v[i]!, acc[i]!, dt12, lastOmega);
      }
    } else if (damping.kind === "listing-rate-measurement" && t >= ENGINE_LISTING_FIRST_ON_TIME_S) {
      lastOmega = omegaFromRate(damping.ratePerSecond, dt12);
      for (let i = 0; i < v.length; i++) {
        v[i] = mixRelaxedVelocity(v[i]!, acc[i]!, dt12, lastOmega);
      }
    } else {
      for (let i = 0; i < v.length; i++) v[i]! += dt12 * acc[i]!;
    }
    for (let i = 0; i < x.length; i++) x[i]! += dt * v[i]!;
    lastKiss = applyKissProjection({
      coords: x,
      quads: mesh.quads,
      tris: mesh.tris,
      kiss: law.gapMin,
      kind: contactKind,
    });
    t += dt;
    step += 1;
    dt1 = dt;
    const firstOnRateNow = firstOnRatePerSecond(dt);
    const onsetSnap = (): OnsetSnapshot => ({
      step,
      t,
      dt,
      firstOnRatePerSecond: firstOnRateNow,
      omegaPerStep: omegaFromRate(firstOnRateNow, dt),
    });
    if (perStepOnset === null && step >= ADYREL_FIRST_ON_WAIT_STEPS) {
      perStepOnset = onsetSnap();
    }
    if (perSecondOnset === null && t >= ENGINE_LISTING_FIRST_ON_TIME_S) {
      perSecondOnset = onsetSnap();
    }

    let ke = 0;
    for (let i = 0; i < nNodes; i++) {
      const vx = v[i * 3]!,
        vy = v[i * 3 + 1]!,
        vz = v[i * 3 + 2]!;
      ke += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
    }
    if (damping.kind === "peak-kill") {
      if (
        ke < kePrev &&
        kePrev >= kePrev2 &&
        kePrev > 0 &&
        t > dt &&
        t - tKeDamp >= damping.minInterval
      ) {
        const scale = damping.scale;
        if (scale === 0) {
          v.fill(0);
          ke = 0;
        } else {
          for (let i = 0; i < v.length; i++) v[i]! *= scale;
          ke *= scale * scale;
        }
        tKeDamp = t;
        peakKillEvents += 1;
      }
      kePrev2 = kePrev;
      kePrev = ke;
    } else if (damping.kind === "off") {
      kePrev2 = kePrev;
      kePrev = ke;
    } else if (damping.kind === "adaptive-period") {
      let psi = 0;
      for (const rest of rests) psi += cstSample(x, rest, law.mu1, law.h0).W;
      const tick = tickAdaptivePeriod(periodState, {
        step,
        time: t,
        dt,
        internal: psi,
        kinetic: ke,
        port: damping.port,
      });
      periodState = tick.state;
      if (tick.firstOn && appliedOnset === null) {
        appliedOnset = {
          step,
          t,
          dt,
          firstOnRatePerSecond: periodState.ratePerSecond,
          omegaPerStep: omegaFromRate(periodState.ratePerSecond, dt),
        };
      }
    } else if (damping.kind === "listing-rate-measurement") {
      kePrev2 = kePrev;
      kePrev = ke;
    } else {
      const _exhaustive: never = damping;
      throw new Error(`unhandled damping ${String(_exhaustive)}`);
    }

    const vol = enclosedVolume(x, mesh.quads, mesh.tris);
    if (recordPerStepEnergy) {
      const pNow = ploadAt(t, law);
      pressW += 0.5 * (p + pNow) * (vol - volPrev);
      dampLogged += alpha * (ke + keAssemble) * dt;
      keIntegral += 0.5 * (ke + keAssemble) * dt;
      dampForce += 2 * alpha * keAssemble * dt;
      volPrev = vol;
      dtSum += dt;
      if (dt < minDt) minDt = dt;
      if (dt > maxDt) maxDt = dt;
      kissPushedTotal += lastKiss.pushed;
    }
    if (punchedThrough(vol, volume0)) {
      punched = true;
      break;
    }

    if (t + 1e-18 >= nextSample || t >= controls.endTime - 1e-18) {
      recordSample(ploadAt(t, law));
      nextSample += controls.historyInterval;
      const lastLam = lambdaHistory[lambdaHistory.length - 1] ?? 1;
      options.onProgress?.({ t, endTime: controls.endTime, step, lambdaMax: lastLam });
    }
  }

  if (history.length === 0 || history[history.length - 1]!.t !== t) {
    recordSample(ploadAt(t, law));
  }

  const last = history[history.length - 1]!;
  const lastLam = lambdaHistory[lambdaHistory.length - 1] ?? 1;
  const lastP = pressureHistory[pressureHistory.length - 1] ?? 0;
  const lastV = volumeHistory[volumeHistory.length - 1] ?? volume0;
  const lastPsi = psiHistory[psiHistory.length - 1] ?? 0;

  const metrics: InflateSolveMetrics = {
    nSteps: step,
    elapsedMs: performance.now() - wallClock0,
    energyErrorPct: last.errorPct,
    lambdaMax: lastLam,
    p: lastP,
    volume_mL: lastV * 1e6,
    psi_J: lastPsi,
    t,
    warn,
    loadFamily: law.loadFamily,
    meshFingerprint: mesh.fingerprint,
    punchedThrough: punched,
    minGap: lastKiss.minGap,
    contactViol: lastKiss.viol,
    contactClass: lastKiss.contactClass,
    incompressResidualMax,
  };

  return {
    kind: "inflate-nh-membrane",
    coords: x,
    history,
    meshHistory,
    lambdaHistory,
    pressureHistory,
    volumeHistory,
    psiHistory,
    relaxationHistory,
    adaptiveOnset: {
      perStep: perStepOnset,
      perSecond: perSecondOnset,
      applied: appliedOnset,
      periodFrom: periodState.periodFrom,
    },
    metrics,
    law,
    ...(recordPerStepEnergy
      ? {
          perStepEnergy: {
            alpha,
            snapshots: energySnapshots,
            nSteps: step,
            meanDt_s: step > 0 ? dtSum / step : 0,
            minDt_s: step > 0 && minDt !== Infinity ? minDt : 0,
            maxDt_s: maxDt,
          } satisfies InflatePerStepEnergyLedger,
        }
      : {}),
  };
}
