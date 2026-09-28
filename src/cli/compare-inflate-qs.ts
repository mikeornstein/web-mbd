import { createInflateAQsIshModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { compareInflateToQsGolden, formatInflateCompare } from "../oracle/compareInflate.js";
import { assertQsGoldenLawMatchesLock, loadInflateQsGolden } from "../oracle/inflateGolden.js";

function main(): void {
  assertQsGoldenLawMatchesLock();
  const golden = loadInflateQsGolden();
  const model = createInflateAQsIshModel();
  console.log(`load family: ${model.law.loadFamily}`);
  console.log(`qs golden status: ${golden.status}`);
  if (golden.status === "EMPTY") {
    const cmp = compareInflateToQsGolden(
      {
        warn: null,
        loadFamily: model.law.loadFamily,
        meshFingerprint: model.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 0,
        law: model.law,
      },
      golden,
    );
    console.log(formatInflateCompare(cmp));
    console.log(
      "FAIL-closed: Radioss QS golden EMPTY. Desk recipe: docs/radioss-qs-desk.md. Dynamic gate is pnpm compare:inflate.",
    );
    process.exit(1);
  }
  const result = solveInflate(model, { maxWallMs: 600_000 });
  const cmp = compareInflateToQsGolden({ ...result.metrics, law: result.law }, golden);
  console.log(JSON.stringify(result.metrics.warn, null, 2));
  console.log(formatInflateCompare(cmp));
  if (!cmp.ok) process.exit(1);
}

main();
