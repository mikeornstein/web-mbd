# Sphere result (for the kill-off default)

Copied onto this stacked PR so the sphere check sits in the docs next to
the kill-off change. Original Part 1 and probe result files on PR 21 are
**not edited**.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.

## Recorded checks

| check | number | bar | result | mark |
| --- | --- | --- | --- | --- |
| Rising branch \|p − p_closed\|/p_closed | 0.9% | 5% | **PASS** | **computed** (Part 1 tape) |
| Limit-point stretch vs 1.383 | 4.7% (1.318 at 400 ms, still 1.340 at 420 ms) | 2% | **MISS** | **computed** (Part 1 tape) |
| Why the 4.7% miss | stretch 1.318 is 99.07% of the 32.02 kPa limit pressure; 1.340 is 99.62%. Slow creep near the flat top of the pressure curve. | — | explanation | **computed** |
| Snap-through at stretch 1.60, slower ramp | 32.38 kPa vs 32.02 kPa (1.1%) | 5%, slower ramp only | **PASS** | **computed** (probe tape) |
| Settled stretch at 28 kPa | 1.18558 vs 1.18757 (0.2%) | 2% | **PASS** | **computed** (probe tape) |
| Same four checks at 1.971 μs cap | same pass/miss | same | **PASS** where the uncapped run passed | **computed** |

Damping on the sphere probe: velocity kill off, Rayleigh mass 80 /s.
**read from docs.** Letter A default at the time of those tapes was
still 0.18 peak-kill. **read from file.**

## Robustness of the 1.60 snap pick (report, not a retry)

Snap-through remains defined as prescribed pressure when equivalent
stretch first crosses **1.60**. **read from the description** of the
probe. Extra crossings below are **computed** from the same committed
CSV tapes (faster/slower ramps, with and without the 2 μs cap). No new
solver run.

| run | p at stretch 1.50 | p at stretch 1.60 | p at stretch 2.00 |
| --- | ---: | ---: | ---: |
| Faster 400 ms | 32.45 kPa (1.3%) | 32.52 kPa (1.5%) | 32.60 kPa (1.8%) |
| Slower 800 ms | 32.34 kPa (1.0%) | 32.38 kPa (1.1%) | 32.41 kPa (1.2%) |
| Faster, 2 μs | 32.45 kPa (1.3%) | 32.52 kPa (1.5%) | 32.60 kPa (1.8%) |
| Slower, 2 μs | 32.34 kPa (1.0%) | 32.39 kPa (1.1%) | 32.41 kPa (1.2%) |

The slower-ramp 1.1% at 1.60 does not swing outside 5% if the pick is
1.50 or 2.00. Existing data was enough.

Sources: `slow-sphere-results.md`, `sphere-probe-results.md`,
`sphere-probe-snap-*.csv` on PR 21.
