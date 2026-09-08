import { createTaylorBarModel, TAYLOR_ACCEPTANCE } from "../fixtures/taylorBar.js";
import { solveExplicit } from "../fe/solver.js";

function main(): void {
  const model = createTaylorBarModel();
  console.log(
    `Taylor bar: ${model.mesh.hexes.length / 8} hexes, ${model.mesh.coords.length / 3} nodes`,
  );
  const result = solveExplicit(model);
  const { metrics } = result;
  console.log(
    JSON.stringify(
      {
        finalLength_mm: metrics.finalLength * 1e3,
        finalMaxRadius_mm: metrics.finalMaxRadius * 1e3,
        lengthRatio: metrics.lengthRatio,
        radiusRatio: metrics.radiusRatio,
        energyErrorPct: metrics.energyErrorPct,
        nSteps: metrics.nSteps,
        elapsedMs: metrics.elapsedMs,
      },
      null,
      2,
    ),
  );

  const okLen =
    metrics.lengthRatio >= TAYLOR_ACCEPTANCE.lengthRatio.min &&
    metrics.lengthRatio <= TAYLOR_ACCEPTANCE.lengthRatio.max;
  const okRad =
    metrics.radiusRatio >= TAYLOR_ACCEPTANCE.radiusRatio.min &&
    metrics.radiusRatio <= TAYLOR_ACCEPTANCE.radiusRatio.max;
  const okE = Math.abs(metrics.energyErrorPct) <= TAYLOR_ACCEPTANCE.energyErrorPctAbsMax;
  if (!okLen || !okRad || !okE) {
    console.error("Taylor bar metrics outside acceptance bands");
    process.exit(1);
  }
}

main();
