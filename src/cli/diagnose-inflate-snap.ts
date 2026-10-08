import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import {
  compareInflateToGolden,
  SHIPPED_KILL_OFF_FREEZE,
  diagnosisMissMatchesLock,
  toySamplesFromSolve,
} from "../oracle/compareInflate.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "../oracle/inflateGolden.js";

/**
 * Records the known Themis miss on the shipped kill-off path. This is not a
 * physics pass and is not the compare:inflate check. Exit 0 only while the
 * freeze and the Themis miss stay locked. Bands stay 2% / 5% / 5%. Do not
 * change shear modulus.
 */
function main(): void {
  assertGoldenLawMatchesLock();
  const golden = loadInflateGolden();
  const result = solveInflate(createInflateAModel(), { maxWallMs: 600_000 });
  const cmp = compareInflateToGolden(
    { ...result.metrics, law: result.law, samples: toySamplesFromSolve(result) },
    golden,
  );
  const lock = diagnosisMissMatchesLock(cmp, golden, result.metrics.warn);

  console.log("diagnosis: kill-off freeze is locked; Themis deck-spread bar is expected to miss");
  console.log("This is not a physics pass. It is not the compare check.");
  console.log(
    "The letter A toy is expected to miss Themis’s surviving-deck stretch spread overall. Triangle `/SH3N` is in the spread up to ~11.5 ms. Stretch is validated at the 16 ms freeze and lags the decks earlier in the run.",
  );
  console.log(
    `Locked freeze: frame ${String(SHIPPED_KILL_OFF_FREEZE.frame)}, stretch ${String(SHIPPED_KILL_OFF_FREEZE.lambdaMax)}.`,
  );
  if (result.metrics.warn !== null) {
    console.log(
      `This run: frame ${String(result.metrics.warn.frame)}, stretch ${String(result.metrics.warn.lambdaMax)}, volume ${String(result.metrics.warn.volume_mL)} millilitres.`,
    );
  }
  if (cmp.lambdaRelError !== null && cmp.volumeRelError !== null && cmp.pressureRelError !== null) {
    console.log(
      `Relative error versus Radioss: stretch ${(100 * cmp.lambdaRelError).toFixed(1)} percent, volume ${(100 * cmp.volumeRelError).toFixed(1)} percent, pressure ${(100 * cmp.pressureRelError).toFixed(1)} percent.`,
    );
  }
  if (!lock.ok) {
    console.log("DIAGNOSIS LOCK FAILED (the recorded miss changed; do not widen the bands):");
    for (const r of lock.reasons) console.log(`  - ${r}`);
    process.exit(1);
  }
  console.log("DIAGNOSIS LOCK HELD. Expected miss is unchanged. Not a physics pass.");
}

main();
