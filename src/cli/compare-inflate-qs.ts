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
  const frame28p = 22752.1125;
  let nearest = 0;
  let nearestErr = Infinity;
  for (let i = 0; i < result.pressureHistory.length; i++) {
    const err = Math.abs(result.pressureHistory[i]! - frame28p);
    if (err < nearestErr) {
      nearestErr = err;
      nearest = i;
    }
  }
  console.log(
    JSON.stringify(
      {
        dump: "matched-p vs Radioss frame 28",
        radioss: { t: 0.140013, p: frame28p, lambdaMax: 1.6178630031665837, volume_mL: 382.8648773010279, psi_J: 3.3318434001829504 },
        toy: {
          frame: nearest,
          t: result.history[nearest]?.t ?? null,
          p: result.pressureHistory[nearest] ?? null,
          lambdaMax: result.lambdaHistory[nearest] ?? null,
          volume_mL: result.volumeHistory[nearest] !== undefined ? result.volumeHistory[nearest]! * 1e6 : null,
          psi_J: result.psiHistory[nearest] ?? null,
        },
        minGap_mm: result.metrics.minGap * 1e3,
        contactViol: result.metrics.contactViol,
        contactClass: result.metrics.contactClass,
      },
      null,
      2,
    ),
  );
  console.log(formatInflateCompare(cmp));
  if (!cmp.ok) process.exit(1);
}

main();
