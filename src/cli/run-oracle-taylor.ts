import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../fixtures/taylorBar.js";
import { solveExplicit } from "../fe/solver.js";
import { alignedCoordGap, compareToOracle, nearestNeighborGap } from "../oracle/compare.js";
import { scrubNearZeros } from "../oracle/shapeFromF64bin.js";
import { metricsPassAcceptance } from "../research/catalog.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "./forceNative.js";
import { openRadiossAvailable, runOpenRadiossTaylorOracle } from "./openRadiossRunner.js";

/** Parse NODES%MS from patched `wmbd_postforint_0.f64bin` (ID-sorted). */
function parsePostForintMs(path: string, expectedNodes: number): Float64Array {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 4;
  const numnod = view.getInt32(o, true);
  o += 4 + 24;
  const ms = new Float64Array(numnod);
  const ids = new Int32Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4 + 72;
    ms[i] = view.getFloat64(o, true);
    o += 8;
  }
  if (numnod !== expectedNodes) {
    throw new Error(`postforint MS nodes ${numnod} != expected ${expectedNodes}`);
  }
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  return Float64Array.from(order, (i) => ms[i]!);
}

function main(): void {
  if (!openRadiossAvailable()) {
    console.error("OPENRADIOSS_PATH not set or starter missing — cannot run oracle");
    process.exit(2);
  }

  // Default Object.is path: OR mesh SCUMU3 + starter MS from live dump.
  // Set WMBD_OR_MESH=0 to force the TypeScript force backend (ulp floor).
  const useOrMesh = process.env["WMBD_OR_MESH"] !== "0";
  if (useOrMesh) {
    process.env["WMBD_OR_CALL_S8E"] = "1";
    if (!loadOrForceKernel()) {
      console.error("OR mesh path needs libwmbd_or_hex.so (relink-or-hex.sh)");
      process.exit(2);
    }
  }

  const model = createTaylorBarModel();
  const workDir = join(process.cwd(), "artifacts", "oracle-taylor");
  mkdirSync(workDir, { recursive: true });
  const expectedNodes = model.mesh.coords.length / 3;

  console.log("Running OpenRadioss oracle…");
  const oracle = runOpenRadiossTaylorOracle(model, workDir);
  console.log("oracle metrics", oracle.metrics);

  let nodalMasses: Float64Array | undefined;
  if (useOrMesh) {
    const msPath = join(workDir, "wmbd_postforint_0.f64bin");
    if (!existsSync(msPath)) {
      console.error(
        `missing ${msPath} — patched engine required for OR-mesh Object.is (resol.av-dump.patch)`,
      );
      process.exit(2);
    }
    nodalMasses = parsePostForintMs(msPath, expectedNodes);
    resetOrElementState();
  }

  console.log(
    `web-mbd Taylor: ${model.mesh.hexes.length / 8} hexes, ${expectedNodes} nodes` +
      (useOrMesh ? " [OR mesh SCUMU3 + live MS]" : " [TS forces]"),
  );
  const ours = solveExplicit(model, {
    maxWallMs: 600_000,
    ...(useOrMesh && nodalMasses
      ? {
          assembleForces: (a: Parameters<typeof assembleInternalForcesOrMesh>[0]) =>
            assembleInternalForcesOrMesh(a),
          nodalMasses,
        }
      : {}),
  });
  console.log("web-mbd metrics", {
    lengthRatio: ours.metrics.lengthRatio,
    radiusRatio: ours.metrics.radiusRatio,
    axialShortening_mm: ours.metrics.axialShortening * 1e3,
    maxDisplacement_mm: ours.metrics.maxDisplacement * 1e3,
    maxEqPlasticStrain: ours.metrics.maxEqPlasticStrain,
    energyErrorPct: ours.metrics.energyErrorPct,
    nSteps: ours.metrics.nSteps,
    elapsedMs: ours.metrics.elapsedMs,
  });

  const cmp = compareToOracle(ours.metrics, oracle.metrics);
  const nn = nearestNeighborGap(ours.coords, oracle.coords);
  const oursCoords =
    oracle.metrics.coordSource === "f64bin" ? scrubNearZeros(ours.coords) : ours.coords;
  const aligned =
    oracle.metrics.coordSource === "sta" || oracle.metrics.coordSource === "f64bin"
      ? alignedCoordGap(oursCoords, scrubNearZeros(oracle.coords))
      : { max: nn.max, mean: nn.mean, bitwiseEqual: false };
  const gate = metricsPassAcceptance(ours.metrics, TAYLOR_ACCEPTANCE);
  const report = {
    webmbd: {
      lengthRatio: ours.metrics.lengthRatio,
      radiusRatio: ours.metrics.radiusRatio,
      axialShortening: ours.metrics.axialShortening,
      maxDisplacement: ours.metrics.maxDisplacement,
      maxEqPlasticStrain: ours.metrics.maxEqPlasticStrain,
      energyErrorPct: ours.metrics.energyErrorPct,
      nSteps: ours.metrics.nSteps,
      forceBackend: useOrMesh ? "or-mesh-scumu3+live-ms" : "ts",
    },
    oracle: oracle.metrics,
    compare: {
      ...cmp,
      nearestNeighborMax: nn.max,
      nearestNeighborMean: nn.mean,
      alignedMax: aligned.max,
      alignedMean: aligned.mean,
      coordsBitwiseEqual: aligned.bitwiseEqual,
      coordSource: oracle.metrics.coordSource,
    },
    acceptancePass: gate,
    acceptance: TAYLOR_ACCEPTANCE,
  };
  writeFileSync(join(workDir, "taylor-bar-oracle.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(process.cwd(), "src/oracle/taylor-bar-oracle.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));

  if (!gate || !cmp.ok) {
    console.error("Oracle compare or acceptance gate failed");
    process.exit(1);
  }
  if (useOrMesh && (!cmp.bitwiseEqual || !aligned.bitwiseEqual)) {
    console.error("OR-mesh Object.is gate failed (metrics or coords)");
    process.exit(1);
  }
}

main();
