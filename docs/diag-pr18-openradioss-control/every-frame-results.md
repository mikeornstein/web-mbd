# Every-frame 0–16 ms (kill-off default, Themis deck-spread gate)

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree. AGPL solver is not shipped in the Pages bundle.

Live Letter A freeze matched the committed kill-off tape
(frame 8, stretch 2.105201010510652, 866.08 mL, punch-through false).
**computed.** Table below uses that tape. Bands stay 2% / 5% / 5%.
Do not widen.

Gating bar: **themis-deck-spread**. Surviving decks: golden four-node
Belytschko, Ishell 24 with small-strain flag 2, fine re-oriented, and
triangle `/SH3N` up to about 11.5 ms (last snapshot 8 ms; 6 ms
interpolated from 4 and 8). 6 / 10 / 12 / 14 ms deck min–max are
linearly interpolated from the nearest committed snapshots. Stretch is
validated at the 16 ms freeze and lags the decks earlier in the run.

| t (ms) | toy λ | golden λ | deck min–max | Δλ golden | old 2% | Themis | ΔV | Δp | triangle λ |
| ---: | ---: | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 0 | 1.0000 | 1.0000 | 1.0000–1.0000 | 0.000% | inside | inside | 0.000% | 0.000% | 1.0000 |
| 2 | 1.1183 | 1.7087 | 1.1063–1.7087 | 34.552% | outside | **inside** | 1.200% | 0.949% | 1.1063 |
| 4 | 1.1083 | 1.6570 | 1.1604–1.6570 | 33.112% | outside | **outside** | 4.117% | 0.060% | 1.1604 |
| 6 | 1.2855 | 1.5294 | 1.2622–1.5294 (interp) | 15.945% | outside | **inside** | 2.824% | 0.053% | 1.2622 (interp) |
| 8 | 1.4078 | 1.5578 | 1.3640–1.5578 | 9.635% | outside | **inside** | 3.391% | 0.042% | 1.3640 |
| 10 | 1.4716 | 1.6560 | 1.6181–1.6562 (interp) | 11.132% | outside | **outside** | 3.337% | 0.024% | — (no snapshot; died ~11.5 ms) |
| 12 | 1.5644 | 1.6799 | 1.6799–1.8497 (interp) | 6.870% | outside | **outside** | 3.393% | 0.034% | — (died ~11.5 ms) |
| 14 | 1.7364 | 1.8291 | 1.8291–2.0433 (interp) | 5.068% | outside | **outside** | 3.876% | 0.013% | — (died ~11.5 ms) |
| 16 | 2.1052 | 2.1282 | 2.1282–2.2369 | 1.079% | inside | **outside** | 2.874% | 0.001% | — (died ~11.5 ms) |

16 ms: a miss of the edge of the spread, within the old 2% bar and well
inside the roughly 5% disagreement between decks; not waved through.

Tally per frame: 0 inside; 2 inside; 4 outside; 6 inside; 8 inside; 10
outside (interpolated); 12 outside (interpolated); 14 outside
(interpolated); 16 outside. Total: **4 inside, 5 outside of 9 frames**.

Themis reading (not the score): 2, 6 and 8 ms inside, 4 ms about 4.5%
below the triangle deck, 10 to 16 ms outside. The code’s inside/outside
marks match that reading at 2–16 ms. 0 ms is inside (she did not
mention 0). The exact 4 ms miss versus the triangle deck is printed by
the test.

Volume and pressure stay inside 5% at every tick. The old 2% of
golden-max bar is a miss at 2–14 ms and a pass at 16 ms. Themis’s bar
is a miss overall (4, 10, 12, 14, 16 ms). Compare is **FAIL**. That is
the honest mark. Stretch is validated at the 16 ms freeze and lags the
decks earlier in the run. Do not widen.

Sources: `kill-off-results.json` run A, `oriented-ismstr2-metrics.json`,
`element-type.json`. Original Part 1 and probe tapes were not edited.
