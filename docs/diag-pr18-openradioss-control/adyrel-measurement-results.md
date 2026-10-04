# MEASUREMENT: ported 11.9 /s relaxation, 0–16 ms

MEASUREMENT. Not a physics pass. Does not gate. Default is still the 0.18 peak kill.

The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.

Prediction file was committed first at the parent of this measurement. Listing extra column uses 50.7 /s after the copied 2.79 ms onset. That column is **what the engine uses, not a proposed setting**.

Each cell is max stretch / volume (mL) / pressure (kPa).

Kill on and kill off and golden columns are **computed by a previous run** (committed tapes). Ported 11.9 /s and listing 50.7 /s are **computed** by this measurement. Pressure is the prescribed ramp (**read from file**). Direction matches the prediction: ported sits near kill-off, slightly lower at 8 and 16 ms; listing 50.7 /s slows further; neither closes the 2 ms golden gap.

| t (ms) | kill on (shipped) | kill off | ported ~11.9 /s | listing 50.7 /s (engine uses, not proposed) | golden |
| ---: | --- | --- | --- | --- | --- |
| 0 | 1.000 / 420.5 / 0.00 | 1.000 / 420.5 / 0.00 | 1.000 / 420.5 / 0.00 | 1.000 / 420.5 / 0.00 | 1.000 / 420.5 / 0.00 |
| 2 | 1.118 / 520.0 / 3.25 | 1.118 / 520.0 / 3.25 | 1.118 / 520.0 / 3.25 | 1.118 / 520.0 / 3.25 | 1.709 / 526.3 / 3.29 |
| 4 | 1.160 / 540.2 / 6.51 | 1.108 / 525.0 / 6.50 | 1.110 / 525.8 / 6.50 | 1.105 / 526.2 / 6.50 | 1.657 / 547.6 / 6.51 |
| 6 | 1.175 / 545.9 / 9.76 | 1.286 / 570.4 / 9.75 | 1.277 / 570.5 / 9.76 | 1.276 / 571.0 / 9.76 | 1.529 / 587.0 / 9.76 |
| 8 | 1.277 / 588.4 / 13.00 | 1.408 / 602.0 / 13.01 | 1.397 / 602.5 / 13.00 | 1.398 / 603.0 / 13.00 | 1.558 / 623.1 / 13.00 |
| 10 | 1.296 / 597.0 / 16.25 | 1.472 / 643.8 / 16.25 | 1.481 / 643.7 / 16.25 | 1.456 / 644.9 / 16.26 | 1.656 / 666.1 / 16.25 |
| 12 | 1.328 / 613.9 / 19.50 | 1.564 / 694.7 / 19.51 | 1.555 / 694.0 / 19.51 | 1.567 / 695.0 / 19.51 | 1.680 / 719.0 / 19.50 |
| 14 | 1.372 / 636.9 / 22.76 | 1.736 / 757.6 / 22.75 | 1.696 / 756.9 / 22.75 | 1.695 / 757.0 / 22.75 | 1.829 / 788.2 / 22.75 |
| 16 | 1.422 / 665.1 / 26.01 | 2.105 / 866.1 / 26.01 | 2.076 / 864.4 / 26.00 | 2.037 / 859.9 / 26.00 | 2.128 / 891.7 / 26.01 |

## Sphere check (analytic 32 kPa at stretch 1.383)

**read from docs:** closed-form peak is about 32 kPa at stretch 1.383. Letter A is not a sphere. Toy pressure is the prescribed ramp, so the crossing time need not carry 32 kPa.
- kill on: stretch 1.383 at **14.47 ms**, pressure **23.51 kPa**, volume 643.4 mL. **computed.**
- kill off: stretch 1.383 at **7.60 ms**, pressure **12.35 kPa**, volume 595.6 mL. **computed.**
- ported 11.9 /s: stretch 1.383 at **7.77 ms**, pressure **12.63 kPa**, volume 598.8 mL. **computed.**

## Toward the golden?

Ported vs kill-off, stretch closer to golden on **2/8** loaded frames; volume closer on **3/8**. Moved toward the golden overall: **no**. **computed.**

Stop: weak damping did not move the frames toward the golden. No more damping variants. Next fork is one time-step convergence check (kill off, no relaxation, listing 2 microsecond cap).

Bands were not widened. Default was not changed.
