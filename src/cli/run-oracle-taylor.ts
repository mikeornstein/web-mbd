import { mkdirSync, writeFileSync } from "node:fs";
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

function main(): void {
  if (!openRadiossAvailable()) {
    console.error("OPENRADIOSS_PATH not set or starter missing — cannot run oracle");
    process.exit(2);
  }

  const useOrMesh = process.env["WMBD_OR_MESH"] === "1";
  if (useOrMesh) {
    process.env["WMBD_OR_CALL_S8E"] = "1";
    if (!loadOrForceKernel()) {
      console.error("WMBD_OR_MESH=1 but libwmbd_or_hex.so failed to load");
      process.exit(2);
    }
    resetOrElementState();
  }

  const model = createTaylorBarModel();
  const workDir = join(process.cwd(), "artifacts", "oracle-taylor");
  mkdirSync(workDir, { recursive: true });

  console.log(
    `web-mbd Taylor: ${model.mesh.hexes.length / 8} hexes, ${model.mesh.coords.length / 3} nodes` +
      (useOrMesh ? " [OR mesh SCUMU3]" : ""),
  );
  const ours = solveExplicit(model, {
    maxWallMs: 600_000,
    ...(useOrMesh
      ? {
          assembleForces: (
            a: Parameters<typeof assembleInternalForcesOrMesh>[0],
          ) => assembleInternalForcesOrMesh(a),
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

  console.log("Running OpenRadioss oracle…");
  const oracle = runOpenRadiossTaylorOracle(model, workDir);
  console.log("oracle metrics", oracle.metrics);

  const cmp = compareToOracle(ours.metrics, oracle.metrics);
  const nn = nearestNeighborGap(ours.coords, oracle.coords);
  const oursCoords =
    oracle.metrics.coordSource === "f64bin" ? scrubNearZeros(ours.coords) : ours.coords;
  const aligned =
    oracle.metrics.coordSource === "sta" || oracle.metrics.coordSource === "f64bin"
      ? alignedCoordGap(oursCoords, oracle.coords)
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
      forceBackend: useOrMesh ? "or-mesh-scumu3" : "ts",
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
}

main();
