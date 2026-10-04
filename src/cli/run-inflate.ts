import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";

function main(): void {
  const model = createInflateAModel();
  console.log(
    `Inflate A: ${model.mesh.nQuads} shells, ${model.mesh.nNodes} nodes, ${model.law.loadFamily}`,
  );
  const result = solveInflate(model, { maxWallMs: 600_000 });
  console.log(
    JSON.stringify(
      {
        nSteps: result.metrics.nSteps,
        elapsedMs: result.metrics.elapsedMs,
        warn: result.metrics.warn,
        lambdaMax: result.metrics.lambdaMax,
        p: result.metrics.p,
        volume_mL: result.metrics.volume_mL,
        psi_J: result.metrics.psi_J,
        punchedThrough: result.metrics.punchedThrough,
      },
      null,
      2,
    ),
  );
}

main();
