import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { compareInflateToGolden, formatInflateCompare } from "../oracle/compareInflate.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "../oracle/inflateGolden.js";
import { LAW_CARD_DUMP_LINES } from "../inflate/lawCard.js";

function main(): void {
  assertGoldenLawMatchesLock();
  const golden = loadInflateGolden();
  const model = createInflateAModel();
  console.log(LAW_CARD_DUMP_LINES.join("\n"));
  console.log(
    `Inflate A: ${model.mesh.nQuads} quads, ${model.mesh.nNodes} nodes, fingerprint ${model.mesh.fingerprint}`,
  );
  console.log(`load family: ${model.law.loadFamily}`);
  const result = solveInflate(model, { maxWallMs: 600_000 });
  const { metrics } = result;
  const payload = {
    loadFamily: metrics.loadFamily,
    meshFingerprint: metrics.meshFingerprint,
    nSteps: metrics.nSteps,
    elapsedMs: metrics.elapsedMs,
    warn: metrics.warn,
    lambdaMax: metrics.lambdaMax,
    p: metrics.p,
    volume_mL: metrics.volume_mL,
    psi_J: metrics.psi_J,
    punchedThrough: metrics.punchedThrough,
    minGap: metrics.minGap,
    incompressResidualMax: metrics.incompressResidualMax,
  };
  console.log(JSON.stringify(payload, null, 2));
  const cmp = compareInflateToGolden({ ...metrics, law: result.law }, golden);
  console.log(formatInflateCompare(cmp));
  if (!cmp.ok) {
    console.log(
      "This is the physics check. It fails because the toy misses the 2 percent stretch, 5 percent volume, and 5 percent pressure bands against the oriented Radioss reference. That is the honest result until the toy dynamics are fixed. Do not widen the bands. Do not change shear modulus or the load law.",
    );
    process.exit(1);
  }
}

main();
