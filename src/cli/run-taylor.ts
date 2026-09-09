import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../fixtures/taylorBar.js";
import { solveExplicit } from "../fe/solver.js";
import { metricsPassAcceptance } from "../research/catalog.js";

function main(): void {
  const model = createTaylorBarModel();
  console.log(
    `Taylor bar: ${model.mesh.hexes.length / 8} hexes, ${model.mesh.coords.length / 3} nodes`,
  );
  const result = solveExplicit(model, { maxWallMs: 600_000 });
  const { metrics } = result;
  console.log(
    JSON.stringify(
      {
        finalLength_mm: metrics.finalLength * 1e3,
        finalMaxRadius_mm: metrics.finalMaxRadius * 1e3,
        lengthRatio: metrics.lengthRatio,
        radiusRatio: metrics.radiusRatio,
        axialShortening_mm: metrics.axialShortening * 1e3,
        maxDisplacement_mm: metrics.maxDisplacement * 1e3,
        maxEqPlasticStrain: metrics.maxEqPlasticStrain,
        energyErrorPct: metrics.energyErrorPct,
        nSteps: metrics.nSteps,
        elapsedMs: metrics.elapsedMs,
      },
      null,
      2,
    ),
  );

  if (!metricsPassAcceptance(metrics, TAYLOR_ACCEPTANCE)) {
    console.error("Taylor bar metrics outside acceptance bands");
    process.exit(1);
  }
}

main();
