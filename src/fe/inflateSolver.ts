import { applyKissProjection, buildMeshAdjacency, punchedThrough } from "./contactKiss.js";
import { membraneWaveSpeed } from "./materialNeoHookean.js";
import {
  accumulateCstForces,
  accumulatePressureTri,
  cstSample,
  splitQuadCsts,
  type CstRest,
} from "./membraneCst.js";
import { ploadAt } from "../inflate/lawCard.js";
import { enclosedVolume } from "../inflate/meshA.js";
import type {
  InflateModelIR,
  InflateSolveMetrics,
  InflateSolveResult,
  InflateWarnMetrics,
} from "../inflate/types.js";
import type { EnergySample } from "../ir/types.js";

export interface InflateSolveOptions {
  maxWallMs?: number;
  onProgress?: (info: { t: number; endTime: number; step: number; lambdaMax: number }) => void;
}

export function assertInflateModel(model: InflateModelIR): void {
  if (model.kind !== "inflate-nh-membrane") throw new Error("expected inflate-nh-membrane IR");
  if (model.meta.version !== 1) throw new Error("IR version must be 1");
  if (model.meta.units !== "SI") throw new Error("units must be SI");
  const { coords, quads, nNodes, nQuads } = model.mesh;
  if (coords.length !== nNodes * 3) throw new Error("coords/nNodes mismatch");
  if (quads.length !== nQuads * 4) throw new Error("quads/nQuads mismatch");
  if (!(model.law.mu1 > 0)) throw new Error("mu1 must be > 0");
  if (!(model.law.rho > 0)) throw new Error("rho must be > 0");
  if (!(model.controls.endTime > 0)) throw new Error("endTime must be > 0");
  if (!(model.controls.cfl > 0 && model.controls.cfl <= 1)) throw new Error("cfl must be in (0, 1]");
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
  for (let a = 0; a < nNodes; a++) {
    if (!(masses[a]! > 0)) masses[a] = law.rho * law.h0 * minH * minH * 0.25;
  }

  const skip = buildMeshAdjacency(mesh.quads, nNodes);
  const c = membraneWaveSpeed(law.mu1, law.rho, law.nu);
  const dtCrit0 = minH / c;
  let dt = controls.cfl * dtCrit0;
  if (!(dt > 0) || dt > dtCrit0) dt = controls.cfl * dtCrit0;

  const volume0 = enclosedVolume(x, mesh.quads);
  const history: EnergySample[] = [];
  const meshHistory: Float64Array[] = [];
  const lambdaHistory: number[] = [];
  const pressureHistory: number[] = [];
  const volumeHistory: number[] = [];
  const psiHistory: number[] = [];

  let warn: InflateWarnMetrics | null = null;
  let step = 0;
  let t = 0;
  let dt1 = 0;
  let kePrev = 0;
  let kePrev2 = 0;
  let lastKiss: { pushed: number; minGap: number; viol: number } = {
    pushed: 0,
    minGap: law.gapMin,
    viol: 0,
  };
  let punched = false;
  let incompressResidualMax = 0;
  let E0 = 0;
  let nextSample = 0;
  const maxSteps = controls.maxSteps;
  const maxWallMs = options.maxWallMs ?? 180_000;
  const alpha = law.rayleighAlpha;

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
    return { lambdaMax, psi, volume: enclosedVolume(x, mesh.quads), ke };
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

  const recomputeDt = (): void => {
    let h = Infinity;
    for (const rest of rests) {
      const ix = x[rest.i * 3]!,
        iy = x[rest.i * 3 + 1]!,
        iz = x[rest.i * 3 + 2]!;
      const jx = x[rest.j * 3]!,
        jy = x[rest.j * 3 + 1]!,
        jz = x[rest.j * 3 + 2]!;
      const kx = x[rest.k * 3]!,
        ky = x[rest.k * 3 + 1]!,
        kz = x[rest.k * 3 + 2]!;
      const e1 = Math.hypot(jx - ix, jy - iy, jz - iz);
      const e2 = Math.hypot(kx - jx, ky - jy, kz - jz);
      const e3 = Math.hypot(ix - kx, iy - ky, iz - kz);
      h = Math.min(h, e1, e2, e3);
    }
    const dtNew = controls.cfl * (h / c);
    if (dtNew > 0 && Number.isFinite(dtNew)) dt = Math.min(dtNew, 1.1 * dt);
  };

  recordSample(0);
  nextSample = controls.historyInterval;
  options.onProgress?.({ t: 0, endTime: controls.endTime, step: 0, lambdaMax: 1 });

  while (t < controls.endTime - 1e-18 && step < maxSteps && warn === null) {
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
    const dt12 = 0.5 * (dt1 + dt);
    for (let i = 0; i < v.length; i++) v[i]! += dt12 * acc[i]!;
    for (let i = 0; i < x.length; i++) x[i]! += dt * v[i]!;
    lastKiss = applyKissProjection({ coords: x, skip, kiss: law.gapMin });
    t += dt;
    step += 1;
    dt1 = dt;

    let ke = 0;
    for (let i = 0; i < nNodes; i++) {
      const vx = v[i * 3]!,
        vy = v[i * 3 + 1]!,
        vz = v[i * 3 + 2]!;
      ke += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
    }
    if (controls.kineticDamping && ke < kePrev && kePrev >= kePrev2 && kePrev > 0 && t > dt) {
      const scale = controls.kineticDampingScale;
      if (scale === 0) {
        v.fill(0);
        ke = 0;
      } else {
        for (let i = 0; i < v.length; i++) v[i]! *= scale;
        ke *= scale * scale;
      }
    }
    kePrev2 = kePrev;
    kePrev = ke;

    const vol = enclosedVolume(x, mesh.quads);
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
    metrics,
    law,
  };
}
