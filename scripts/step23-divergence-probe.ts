/**
 * Diagnose step 2→3 Object.is break vs live `.f64bin`.
 *
 * Checks: wall involvement, X0 parity, impact-face vs mid-bar first diffs,
 * and whether disabling RWALL delays the break.
 *
 *   OPENRADIOSS_PATH=... WMBD_OR_CALL_S8E=1 pnpm exec tsx scripts/step23-divergence-probe.ts
 */
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { hexInternalForces, hexLumpedNodalMass, gatherHex } from "../src/fe/hex.js";
import { exportTaylorRadiossDecks, formatRadiossF20 } from "../src/oracle/exportRadioss.js";
import { shapeFromF64bin, scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import type { ModelIR } from "../ir/types.js";

const fixedDt = 2.5e-8;
const nSide = 2;
const nZ = 4;
const INTEREST = [18, 20, 24, 26];

function f20(v: number): string {
  return formatRadiossF20(v);
}

function countDiffs(a: Float64Array, b: Float64Array) {
  let n = 0;
  let maxAbs = 0;
  let maxI = -1;
  for (let i = 0; i < a.length; i++) {
    if (Object.is(a[i], b[i])) continue;
    n++;
    const d = Math.abs(a[i]! - b[i]!);
    if (d > maxAbs) {
      maxAbs = d;
      maxI = i;
    }
  }
  return { n, maxAbs, maxI, maxNode: maxI >= 0 ? Math.floor(maxI / 3) : null };
}

function firstDiffs(ours: Float64Array, live: Float64Array, limit = 8) {
  const out: { i: number; node: number; dof: string; ours: number; live: number; abs: number }[] =
    [];
  const names = ["x", "y", "z"];
  for (let i = 0; i < ours.length; i++) {
    if (Object.is(ours[i], live[i])) continue;
    out.push({
      i,
      node: Math.floor(i / 3),
      dof: names[i % 3]!,
      ours: ours[i]!,
      live: live[i]!,
      abs: Math.abs(ours[i]! - live[i]!),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function nodeInfo(model: ModelIR, nodes: number[]) {
  const c = model.mesh.coords;
  const wallZ = model.wall.point[2];
  return nodes.map((node) => {
    const x = c[node * 3]!;
    const y = c[node * 3 + 1]!;
    const z = c[node * 3 + 2]!;
    return {
      node,
      x,
      y,
      z,
      r: Math.hypot(x, y),
      onImpactFace: Math.abs(z - wallZ) < 1e-15,
      gap: z - wallZ,
    };
  });
}

function runLive(model: ModelIR, endTime: number, workDir: string, opts?: { noWall?: boolean }) {
  const decks = exportTaylorRadiossDecks(model);
  let starter = decks.starter;
  if (opts?.noWall) {
    // Drop /RWALL block from starter (between /RWALL and next / or end).
    starter = starter.replace(/\/RWALL\/[\s\S]*?(?=\n\/[A-Z]|\n*$)/, "\n");
  }
  const engine = `#RADIOSS ENGINE
/RUN/${decks.root}/1
${f20(endTime)}
/DTIX
${f20(fixedDt)}${f20(fixedDt)}
/DT
${f20(1.0)}${f20(0)}
/ANIM/DT
${f20(0)}${f20(endTime)}
/ANIM/NODA/DT
/STATE/DT/ALL
${f20(endTime)}${f20(endTime)}
/PRINT/-1/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;
  mkdirSync(workDir, { recursive: true });
  for (const f of readdirSync(workDir)) {
    try {
      unlinkSync(join(workDir, f));
    } catch {
      /* */
    }
  }
  writeFileSync(join(workDir, `${decks.root}_0000.rad`), starter);
  writeFileSync(join(workDir, `${decks.root}_0001.rad`), engine);

  const orPath = process.env["OPENRADIOSS_PATH"]!;
  const env = {
    ...process.env,
    RAD_CFG_PATH: join(orPath, "hm_cfg_files"),
    RAD_H3D_PATH: join(orPath, "extlib/h3d/lib/linux64"),
    OMP_STACKSIZE: "400m",
    OMP_NUM_THREADS: "1",
    LD_LIBRARY_PATH: [
      join(orPath, "extlib/hm_reader/linux64"),
      join(orPath, "extlib/h3d/lib/linux64"),
      process.env["LD_LIBRARY_PATH"] ?? "",
    ].join(":"),
  };
  let r = spawnSync(
    join(orPath, "exec/starter_linux64_gf"),
    ["-i", join(workDir, `${decks.root}_0000.rad`), "-np", "1", "-nt", "1"],
    { cwd: workDir, env, encoding: "utf8", maxBuffer: 32 << 20 },
  );
  if (r.status !== 0) throw new Error(`starter ${workDir}: ${(r.stdout ?? "").slice(-600)}`);
  r = spawnSync(join(orPath, "exec/engine_linux64_gf"), ["-i", join(workDir, `${decks.root}_0001.rad`), "-nt", "1"], {
    cwd: workDir,
    env,
    encoding: "utf8",
    maxBuffer: 32 << 20,
  });
  if (r.status !== 0) throw new Error(`engine ${workDir}: ${(r.stdout ?? "").slice(-600)}`);

  const staName = readdirSync(workDir)
    .filter((f) => f.endsWith(".sta"))
    .sort()[0];
  if (!staName) throw new Error(`no .sta in ${workDir}`);
  const f64Path = join(workDir, staName.replace(/\.sta$/i, ".f64bin"));
  if (!existsSync(f64Path)) throw new Error(`missing ${f64Path}`);
  return shapeFromF64bin(readFileSync(f64Path), model.reference.length0, model.reference.radius0, {
    expectedNodes: model.mesh.coords.length / 3,
  });
}

function makeBase(endSteps: number, noWall = false): ModelIR {
  const m = createTaylorBarModel({ nSide, nZ });
  m.controls.endTime = fixedDt * endSteps;
  m.controls.runToEnd = true;
  m.controls.fixedDt = fixedDt;
  m.controls.adaptiveDt = false;
  if (noWall) {
    // Move wall far away / disable kinematics by kind swap to unused penalty=0 far plane
    m.wall.point = [0, 0, -1e6];
    m.wall.kind = "kinematic";
  }
  return m;
}

/** Instrument last-step nodal A = f/m after FORINT (before wall kinematics). */
function captureLastAcc(endSteps: number, driver: "ts" | "or", noWall = false) {
  const model = makeBase(endSteps, noWall);
  const nNodes = model.mesh.coords.length / 3;
  const nHex = model.mesh.hexes.length / 8;
  const masses = new Float64Array(nNodes);
  // Mirror solver lumped mass build
  const xS = new Float64Array(24);
  for (let e = 0; e < nHex; e++) {
    const conn = model.mesh.hexes.slice(e * 8, e * 8 + 8);
    gatherHex(Float64Array.from(model.mesh.coords), conn, xS);
    const m = hexLumpedNodalMass(xS, model.material.density);
    for (let a = 0; a < 8; a++) masses[conn[a]!]! += m[a]!;
  }

  let lastF = new Float64Array(nNodes * 3);
  let lastA = new Float64Array(nNodes * 3);
  let calls = 0;
  const wrap = (args: Parameters<typeof hexInternalForces>[0]) => {
    if (driver === "ts") hexInternalForces({ ...args, options: { jcvt: 0 } });
    else hexInternalForcesOr(args);
    calls++;
    if ((calls - 1) % nHex === 0) lastF.fill(0);
    const e = args.elementIndex ?? 0;
    for (let ai = 0; ai < 8; ai++) {
      const n = model.mesh.hexes[e * 8 + ai]!;
      lastF[n * 3]! -= args.fOut[ai * 3]!;
      lastF[n * 3 + 1]! -= args.fOut[ai * 3 + 1]!;
      lastF[n * 3 + 2]! -= args.fOut[ai * 3 + 2]!;
    }
    if (calls % nHex === 0) {
      for (let i = 0; i < nNodes; i++) {
        lastA[i * 3] = lastF[i * 3]! / masses[i]!;
        lastA[i * 3 + 1] = lastF[i * 3 + 1]! / masses[i]!;
        lastA[i * 3 + 2] = lastF[i * 3 + 2]! / masses[i]!;
      }
    }
  };

  if (driver === "or") resetOrElementState();
  const res = solveExplicit(model, {
    maxWallMs: 120_000,
    hexForce: wrap,
  });
  return {
    coords: scrubNearZeros(res.coords),
    f: lastF.slice(),
    a: lastA.slice(),
    masses: masses.slice(),
    interest: INTEREST.map((node) => ({
      node,
      f: [lastF[node * 3], lastF[node * 3 + 1], lastF[node * 3 + 2]],
      a: [lastA[node * 3], lastA[node * 3 + 1], lastA[node * 3 + 2]],
      m: masses[node],
      x: [res.coords[node * 3], res.coords[node * 3 + 1], res.coords[node * 3 + 2]],
    })),
  };
}

if (!process.env["OPENRADIOSS_PATH"]) {
  console.error("OPENRADIOSS_PATH required");
  process.exit(2);
}
loadOrForceKernel();
process.env["WMBD_OR_CALL_S8E"] = "1";

const model0 = makeBase(1);
const report: Record<string, unknown> = {
  interestNodes: nodeInfo(model0, INTEREST),
  impactFaceNodes: nodeInfo(model0, [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  waveEstimate: {
    note: "dilatational travel in 3×Δt vs mid-bar height",
    cdApprox: Math.sqrt(117e9 / 8930 / ((1 + 0.35) * (1 - 2 * 0.35) / ((1 - 0.35) /* rough */))),
    midBarZ: 0.0162,
    threeDt: 3 * fixedDt,
  },
};

// X0 parity: live STATE at t=0 is not written; compare starter NODE via running 0-step
// by reading f64bin after 1 step with V0=0 instead — or parse starter. Simpler: compare
// web-mbd coords to live after 1 step Object.is already proven ⇒ X0 matched.
{
  const live1 = runLive(makeBase(1), fixedDt, "/tmp/or-step23-s1");
  const ts1 = solveExplicit(makeBase(1), { maxWallMs: 60_000 });
  const x0LiveVsTs = countDiffs(scrubNearZeros(Float64Array.from(model0.mesh.coords)), scrubNearZeros(live1.coords));
  // After 1 step coords Object.is ⇒ X0 must have matched; also direct X0 vs pre-impact:
  report.x0 = {
    note: "web-mbd snapped X0 vs itself (baseline); 1-step Object.is implies X0 parity with live",
    step1CoordsBitwise: alignedCoordGap(scrubNearZeros(ts1.coords), scrubNearZeros(live1.coords)).bitwiseEqual,
    nNodes: model0.mesh.coords.length / 3,
  };
}

// With wall: steps 2 and 3
for (const steps of [2, 3]) {
  const endTime = fixedDt * steps;
  const live = runLive(makeBase(steps), endTime, `/tmp/or-step23-s${steps}`);
  const liveScrub = scrubNearZeros(live.coords);
  const ts = solveExplicit(makeBase(steps), { maxWallMs: 60_000 });
  resetOrElementState();
  const or1 = solveExplicit(makeBase(steps), {
    maxWallMs: 60_000,
    hexForce: (a) => hexInternalForcesOr(a),
  });
  report[`withWall_step${steps}`] = {
    ts: {
      ...countDiffs(scrubNearZeros(ts.coords), liveScrub),
      coordsBitwise: alignedCoordGap(scrubNearZeros(ts.coords), liveScrub).bitwiseEqual,
      metricsBitwise: compareToOracle(ts.metrics, live).bitwiseEqual,
      first: firstDiffs(scrubNearZeros(ts.coords), liveScrub),
    },
    or1: {
      ...countDiffs(scrubNearZeros(or1.coords), liveScrub),
      coordsBitwise: alignedCoordGap(scrubNearZeros(or1.coords), liveScrub).bitwiseEqual,
      first: firstDiffs(scrubNearZeros(or1.coords), liveScrub),
    },
  };
}

// No wall (wall moved to z=-1e6): does Object.is hold longer?
{
  const steps = 3;
  const endTime = fixedDt * steps;
  const m = makeBase(steps, true);
  const live = runLive(m, endTime, "/tmp/or-step23-nowall-s3", { noWall: true });
  const liveScrub = scrubNearZeros(live.coords);
  const ts = solveExplicit(makeBase(steps, true), { maxWallMs: 60_000 });
  resetOrElementState();
  const or1 = solveExplicit(makeBase(steps, true), {
    maxWallMs: 60_000,
    hexForce: (a) => hexInternalForcesOr(a),
  });
  report.noWall_step3 = {
    note: "RWALL removed from live starter; web-mbd wall point moved to z=-1e6",
    ts: {
      ...countDiffs(scrubNearZeros(ts.coords), liveScrub),
      coordsBitwise: alignedCoordGap(scrubNearZeros(ts.coords), liveScrub).bitwiseEqual,
      first: firstDiffs(scrubNearZeros(ts.coords), liveScrub),
    },
    or1: {
      ...countDiffs(scrubNearZeros(or1.coords), liveScrub),
      coordsBitwise: alignedCoordGap(scrubNearZeros(or1.coords), liveScrub).bitwiseEqual,
      first: firstDiffs(scrubNearZeros(or1.coords), liveScrub),
    },
    // free-flight: coords should be X0 + V0*t exactly if no internal force
    freeFlightCheck: INTEREST.map((node) => {
      const x0 = model0.mesh.coords[node * 3]!;
      const y0 = model0.mesh.coords[node * 3 + 1]!;
      const z0 = model0.mesh.coords[node * 3 + 2]!;
      const t = endTime;
      const pred = [x0, y0, z0 - 227 * t];
      const got = [ts.coords[node * 3]!, ts.coords[node * 3 + 1]!, ts.coords[node * 3 + 2]!];
      return {
        node,
        pred,
        got,
        d: pred.map((p, i) => Math.abs(p - got[i]!)),
        objectIs: pred.every((p, i) => Object.is(p, got[i]!)),
      };
    }),
  };
}

// Forces/A after FORINT at end of step 2 and 3 (TS vs OR)
{
  const s2ts = captureLastAcc(2, "ts");
  const s2or = captureLastAcc(2, "or");
  const s3ts = captureLastAcc(3, "ts");
  const s3or = captureLastAcc(3, "or");
  report.forcesAfterForint = {
    step2: {
      fTsVsOr: countDiffs(s2ts.f, s2or.f),
      aTsVsOr: countDiffs(s2ts.a, s2or.a),
      interestTs: s2ts.interest,
      interestOr: s2or.interest,
      interestFDiff: INTEREST.map((node) => ({
        node,
        dF: [
          Math.abs(s2ts.f[node * 3]! - s2or.f[node * 3]!),
          Math.abs(s2ts.f[node * 3 + 1]! - s2or.f[node * 3 + 1]!),
          Math.abs(s2ts.f[node * 3 + 2]! - s2or.f[node * 3 + 2]!),
        ],
        objectIsF: [0, 1, 2].map((k) => Object.is(s2ts.f[node * 3 + k], s2or.f[node * 3 + k])),
      })),
    },
    step3: {
      fTsVsOr: countDiffs(s3ts.f, s3or.f),
      aTsVsOr: countDiffs(s3ts.a, s3or.a),
      interestFDiff: INTEREST.map((node) => ({
        node,
        dF: [
          Math.abs(s3ts.f[node * 3]! - s3or.f[node * 3]!),
          Math.abs(s3ts.f[node * 3 + 1]! - s3or.f[node * 3 + 1]!),
          Math.abs(s3ts.f[node * 3 + 2]! - s3or.f[node * 3 + 2]!),
        ],
        objectIsF: [0, 1, 2].map((k) => Object.is(s3ts.f[node * 3 + k], s3or.f[node * 3 + k])),
      })),
    },
  };
}

// IXS / connectivity: web-mbd hexes vs starter /BRICK cards
{
  const decks = exportTaylorRadiossDecks(makeBase(1));
  const brickLines = decks.starter
    .split("\n")
    .slice(decks.starter.split("\n").findIndex((l) => l.startsWith("/BRICK")) + 1);
  const liveConn: number[][] = [];
  for (const line of brickLines) {
    if (line.startsWith("/")) break;
    const parts = line.trim().split(/\s+/).map(Number);
    if (parts.length >= 9 && Number.isFinite(parts[0]) && parts[0]! > 0) {
      liveConn.push(parts.slice(1, 9).map((id) => id - 1));
    }
  }
  const ours = makeBase(1).mesh.hexes;
  let nMismatch = 0;
  const mismatches: { e: number; ours: number[]; live: number[] }[] = [];
  for (let e = 0; e < liveConn.length; e++) {
    const o = [...ours.slice(e * 8, e * 8 + 8)];
    const L = liveConn[e]!;
    if (o.some((v, i) => v !== L[i])) {
      nMismatch++;
      if (mismatches.length < 4) mismatches.push({ e, ours: o, live: L });
    }
  }
  report.connectivity = {
    nHex: liveConn.length,
    nMismatch,
    mismatches,
    note: nMismatch === 0 ? "IXS order matches web-mbd hexes exactly" : "IXS mismatch",
  };
}

const outPath = join(process.cwd(), "docs/research/step23-divergence-probe.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.error(`wrote ${outPath}`);
