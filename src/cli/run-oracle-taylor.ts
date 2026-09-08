import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../fixtures/taylorBar.js";
import { solveExplicit } from "../fe/solver.js";
import { compareToOracle } from "../oracle/compare.js";
import { metricsPassAcceptance } from "../research/catalog.js";
import { openRadiossAvailable, runOpenRadiossTaylorOracle } from "./openRadiossRunner.js";

function main(): void {
  if (!openRadiossAvailable()) {
    console.error("OPENRADIOSS_PATH not set or starter missing — cannot run oracle");
    process.exit(2);
  }

  const model = createTaylorBarModel();
  const workDir = join(process.cwd(), "artifacts", "oracle-taylor");
  mkdirSync(workDir, { recursive: true });

  console.log(
    `web-mbd Taylor: ${model.mesh.hexes.length / 8} hexes, ${model.mesh.coords.length / 3} nodes`,
  );
  const ours = solveExplicit(model, { maxWallMs: 600_000 });
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
    },
    oracle: oracle.metrics,
    compare: cmp,
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
