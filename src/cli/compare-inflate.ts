import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import {
  compareInflateToGolden,
  diagnosisMissMatchesLock,
  formatInflateCompare,
} from "../oracle/compareInflate.js";
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
  const diagnosis = diagnosisMissMatchesLock(cmp, golden, metrics.warn);
  if (!diagnosis.ok) {
    console.log("DIAGNOSIS LOCK: FAIL");
    for (const r of diagnosis.reasons) console.log(`  - ${r}`);
    process.exit(1);
  }
  console.log(
    "DIAGNOSIS LOCK: item 1 passed; miss is toy snap-through at frame 12 λ≈4.33. Bands 2/5/5 unchanged. Do not retune μ.",
  );
}

main();
