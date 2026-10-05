# Lag on volume change from rest (recompute, not a gate)

Plan was committed first in `lag-on-volume-change-plan.md` (commit `685cc33`)
and was not changed after this run. No other file was edited. No bar was
widened. No time shift was applied. No verdict row was added. No fix was
proposed. Compare:inflate is not this job. No engine run. No toy change.

Reuse: `bestTimeShiftMs` in `src/oracle/stretchDiagnosticRules.ts` (grid
−4 to +4 ms, step 0.01 ms; interpolates toy at gold time plus shift; RMS;
positive = toy lags; never applied). Same call as the committed 0.510 ms
volume-shift fit in `scoreStretchDiagnostics` /
`src/cli/diagnose-deck-node-output.ts`. Frames:
`DECK_NODE_REQUESTED_MS` / `EVERY_FRAME_MS` = 0, 2, 4, 6, 8, 10, 12, 14,
16 ms. Series is `dV(t) = V(t) − V(0)`, not total `V(t)`.

Toy `V(t)`: `killOffSamples` in `src/oracle/compareInflate.test.ts`,
labeled at the requested milliseconds. Deck `V(t)`:
`docs/diag-pr18-openradioss-control/deck-node-output-results.json`
`volume_mL` at each `requested_ms`. Triangle 12, 14, 16 ms are missing
(died ~11.5 ms; last real requested frame 10 ms).

Sanity (not a bar): all-frames total-volume `V(t)` shift vs golden is
still 0.510 ms, so this recompute used the same series and procedure as
the existing 0.510 ms fit.

MEASUREMENT, not a gate. Does not change compare:inflate. Does not
widen any bar. Do not add a verdict row. Do not propose or apply a
fix. Do not change the page.

## dV series (mL)

requested ms | toy dV | golden dV | Ishell 24 dV | fine dV | triangle dV
---: | ---: | ---: | ---: | ---: | ---:
0 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000
2 | 99.466 | 105.785 | 99.780 | 106.383 | 99.874
4 | 104.465 | 127.009 | 121.676 | 129.892 | 122.691
6 | 149.851 | 166.426 | 158.839 | 162.990 | 154.605
8 | 181.438 | 202.566 | 194.890 | 199.598 | 189.501
10 | 223.276 | 245.505 | 236.336 | 243.524 | 231.245
12 | 274.107 | 298.502 | 288.102 | 298.016 | n/a
14 | 337.054 | 367.603 | 357.217 | 368.057 | n/a
16 | 445.535 | 471.163 | 457.473 | 469.494 | n/a

## Fitted dV shifts (ms)

Positive = toy lags. Diagnostic only; never applied. RMS is millilitres
of dV. Deciding pairing is toy versus golden.

deck | 0–4 ms | 4–8 ms | 8–16 ms | all-frames | window spread | gold frames in 8–16
--- | ---: | ---: | ---: | ---: | ---: | ---:
golden Belytschko quad | 0.180 | 1.010 | 0.680 | 0.510 | 0.830 | 5
Ishell 24 ismstr 2 | 0.130 | 0.680 | 0.430 | 0.320 | 0.550 | 5
fine re-oriented | 0.200 | 0.970 | 0.660 | 0.500 | 0.770 | 5
triangle /SH3N | 0.140 | 0.550 | 0.340 | 0.200 | 0.410 | 2 (8 and 10 ms only)

Golden window RMS (mL): 0–4 = 12.32; 4–8 = 0.42; 8–16 = 5.50;
all-frames = 11.91.

## Reading-rule outcome

Deciding numbers (toy vs golden): all-frames 0.510 ms; windows 0.180,
1.010, 0.680 ms; spread 0.830 ms.

(1) all-frames in 0.35–0.65 ms **and** window spread < 0.2 ms: all-frames
is 0.510 (inside) but spread is 0.830 (not < 0.2). Does not fire.

(2) early window exceeds the later ones by 0.2 ms or more: 0–4 minus
4–8 = −0.830 ms; 0–4 minus 8–16 = −0.500 ms. Early is smaller, not
larger. Does not fire.

(3) otherwise: fires. The lag is not a single shift.

Outcome: **(3) the lag is not a single shift.** Golden all-frames dV
shift is still 0.510 ms, but the three windows are 0.180, 1.010, and
0.680 ms. The page wording is not changed in this run.

Do not add a verdict row.
Do not propose or apply a fix in this run.
