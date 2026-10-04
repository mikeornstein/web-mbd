# CONVERGENCE CHECK: kill-off at listing 2 microsecond step

Not a damping variant. Not a fit. Default stays the 0.18 peak kill.

The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.

Time-step cap **1.9710e-6 s** is **copied** from the golden listing Δt at cycle 200, via the period description. Not computed from the toy, not fitted.

Each cell is max stretch / volume (mL) / pressure (kPa).

| t (ms) | kill off, current step (**computed** earlier) | kill off, 2 μs cap (**computed** this run) | golden (**computed** earlier) |
| ---: | --- | --- | --- |
| 0 | 1.000 / 420.5 / 0.00 | 1.000 / 420.5 / 0.00 | 1.000 / 420.5 / 0.00 |
| 2 | 1.118 / 520.0 / 3.25 | 1.116 / 519.8 / 3.25 | 1.709 / 526.3 / 3.29 |
| 4 | 1.108 / 525.0 / 6.50 | 1.110 / 525.2 / 6.50 | 1.657 / 547.6 / 6.51 |
| 6 | 1.286 / 570.4 / 9.75 | 1.282 / 570.4 / 9.75 | 1.529 / 587.0 / 9.76 |
| 8 | 1.408 / 602.0 / 13.01 | 1.405 / 602.0 / 13.00 | 1.558 / 623.1 / 13.00 |
| 10 | 1.472 / 643.8 / 16.25 | 1.491 / 643.1 / 16.25 | 1.656 / 666.1 / 16.25 |
| 12 | 1.564 / 694.7 / 19.51 | 1.568 / 693.7 / 19.50 | 1.680 / 719.0 / 19.50 |
| 14 | 1.736 / 757.6 / 22.75 | 1.713 / 757.6 / 22.75 | 1.829 / 788.2 / 22.75 |
| 16 | 2.105 / 866.1 / 26.01 | 2.071 / 866.0 / 26.00 | 2.128 / 891.7 / 26.01 |

Verdict: **step-independent** at this listing Δt. Capped-Δt frames stayed inside 2% stretch and 5% volume of the current kill-off at 2, 8, and 16 ms. Step size is cleared. **computed.**

Stop. No further variants.
