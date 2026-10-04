import { createInflateAModel } from "../fixtures/inflateA.js";
import { solveInflate } from "../fe/inflateSolver.js";
import {
  compareInflateToGolden,
  DIAGNOSIS_TOY_SNAP,
  diagnosisMissMatchesLock,
} from "../oracle/compareInflate.js";
import { assertGoldenLawMatchesLock, loadInflateGolden } from "../oracle/inflateGolden.js";

/**
 * Records the known miss. This is not a physics pass and is not the
 * compare:inflate check. Exit 0 only while the toy still snaps at the locked
 * frame/stretch. Bands stay 2% / 5% / 5%. Do not change shear modulus.
 */
function main(): void {
  assertGoldenLawMatchesLock();
  const golden = loadInflateGolden();
  const result = solveInflate(createInflateAModel(), { maxWallMs: 600_000 });
  const cmp = compareInflateToGolden({ ...result.metrics, law: result.law }, golden);
  const lock = diagnosisMissMatchesLock(cmp, golden, result.metrics.warn);

  console.log("diagnosis: toy snap is expected to miss, locked at frame 12 / stretch 4.33");
  console.log("This is not a physics pass. It is not the compare check.");
  console.log(
    "The letter A toy is expected to miss the 2 percent stretch, 5 percent volume, and 5 percent pressure bands against the oriented Radioss reference.",
  );
  console.log(
    `Locked known miss: frame ${String(DIAGNOSIS_TOY_SNAP.frame)}, stretch ${String(DIAGNOSIS_TOY_SNAP.lambdaMax)}.`,
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
