# Prediction: one measurement of ported 11.9 /s relaxation

Written **before** any new measurement run. Not a physics pass. Default
stays the 0.18 peak kill. Bands, stiffness, load law, mesh, golden, and
Pages stay unchanged. One run, not a sweep.

This is a **measurement** of the already-ported continuous relaxation
(about 11.9 per second from the toy’s own 10⁻⁴ / Δt). It is not a
proposal to change the default.

## Physics direction (before numbers)

Damping only **removes motion**. Adding the weak ported relaxation to
the **kill-off** toy should **lower** stretch and volume slightly at 8
and 16 ms, not raise them.

Over 16 ms, a constant 11.9 per second mix removes at most about

\[
1 - e^{-11.9 \times 0.016} \approx 0.17
\]

of the velocity (**computed** from that exponential, using 11.9 /s from
the live port print and 16 ms). That is a small drain next to Rayleigh
80 per second (**read from docs**) and next to the 0.18 peak kill.

So the relaxation run should land **between kill-on and kill-off, close
to kill-off**, and should **not** close the gap to the golden by itself.

Kill-on at 16 ms is stretch **1.422** versus golden **2.128**. That lag
is the 0.18 velocity kill removing energy, not “relaxation too weak.”
**computed by a previous run.** Even the engine listing’s **50.7 per
second** (copied from the description table; **not** a proposed toy
setting) would slow the film **further**, not inflate it faster toward
the 2 ms golden hot spot.

## References already on disk (not re-run for this prediction)

**computed by a previous run** (`toy-history.json`, `kill-off-results.json`
run A, `oriented-ismstr2-metrics.json`):

| t (ms) | kill on stretch / mL | kill off stretch / mL | golden stretch / mL | p (kPa) |
| ---: | --- | --- | --- | ---: |
| 2 | 1.118 / 520.0 | 1.118 / 520.0 | 1.709 / 526.3 | 3.25 |
| 8 | 1.277 / 588.4 | 1.408 / 602.0 | 1.558 / 623.1 | 13.00 |
| 16 | 1.422 / 665.1 | 2.105 / 866.1 | 2.128 / 891.7 | 26.01 |

At 2 ms, kill on and kill off have not diverged. Ported first-on in the
rate print was 2.03 ms, so the 2 ms sample is still undamped by this
card. **computed** by that print.

## Own numbers and direction (guess, before the run)

Ported relaxation = existing per-second option, live first-on **11.86
per second** (called 11.9 /s here). Extra column = mix at the listing
**50.7 per second** after the copied 2.79 ms onset, labeled **what the
engine uses, not a proposed setting**.

### 2 ms

| column | max stretch | volume (mL) | pressure (kPa) |
| --- | ---: | ---: | ---: |
| ported 11.9 /s | **1.118** | **520** | 3.25 |
| listing 50.7 /s (not proposed) | **1.118** | **520** | 3.25 |

**guess:** same as kill on and kill off. First-on is at or after 2 ms.
Does **not** move toward golden 1.709.

### 8 ms

| column | max stretch | volume (mL) | pressure (kPa) |
| --- | ---: | ---: | ---: |
| ported 11.9 /s | **1.40** | **600** | 13.00 |
| listing 50.7 /s (not proposed) | **1.36** | **585** | 13.00 |

**guess:** ported sits a hair below kill-off 1.408 / 602 mL, still well
above kill-on 1.277 / 588 mL, still below golden 1.558 / 623 mL. Listing
50.7 /s slows more, so it sits lower still, **farther** from the golden
than kill-off. Pressure stays the prescribed ramp.

### 16 ms

| column | max stretch | volume (mL) | pressure (kPa) |
| --- | ---: | ---: | ---: |
| ported 11.9 /s | **2.08** | **855** | 26.01 |
| listing 50.7 /s (not proposed) | **1.92** | **800** | 26.01 |

**guess:** ported close to kill-off 2.105 / 866 mL, not kill-on 1.422 /
665 mL, and not a new match to golden 2.128 / 892 mL. Kill-off is already
near the golden at this one freeze; a small extra drain should not be
read as “relaxation fixed 16 ms.” Listing 50.7 /s slows more, so stretch
and volume drop **away** from the golden relative to kill-off.

## Sphere check (analytic)

**read from docs** / the closed-form already in the repo: peak **32 kPa
at stretch 1.383** for the equivalent sphere (`p(λ) = 2 μ (H₀/R₀)
(λ⁻¹ − λ⁻⁷)`, λ\* = 7^{1/6}). Letter A is not a sphere. Pressure on
the toy is the prescribed ramp, so the time when max stretch crosses
1.383 does **not** have to carry 32 kPa.

**guess:** kill on crosses 1.383 near 14–15 ms (~24 kPa on the ramp).
Kill off crosses earlier (~8 ms, ~13 kPa). Ported 11.9 /s tracks kill
off. None of the three should be called a 32 kPa sphere peak. Relaxation
must not look wildly unlike kill off on that same crossing.

Tolerance for “damage” is the existing closed-form digits in
`tests/inflate-a-pr18-control.test.ts` item 4 (`toBeCloseTo(32.0, 1)`
kPa and `toBeCloseTo(1.383, 3)` stretch). Those digits are not chosen
here. This measurement only **prints** the three toy crossings next to
that closed form. It does not gate.

## What would refute the direction

- Ported 11.9 /s at 8 or 16 ms **raises** stretch or volume above
  kill-off (damping that adds motion).
- Ported 11.9 /s at 2 ms moves max stretch toward golden 1.71.
- Ported 11.9 /s at 16 ms sits as lagged as kill-on (within 2% of 1.422).
- Listing 50.7 /s **inflates faster** than kill-off toward the golden.

## Stop rule after this measurement

If the weak ported damping does **not** move the 0–16 ms frames toward
the golden, make **no more damping variants**. The next fork is one
convergence check: kill off, no relaxation, toy time step capped at the
listing **2 microseconds** (copied Δt 1.971×10⁻⁶ s), same 0–16 ms
table next to the current step. That is a convergence check, not a fit.
Then stop. Do not go on.

## Runs after this file is committed

1. Ported adaptive-period, per-second, as already implemented (~11.9 /s).
2. One extra column: constant listing 50.7 /s after the copied 2.79 ms
   onset, labeled what the engine uses, not a proposed setting.
3. Kill on and kill off columns from the already-committed tapes, not
   retuned.
4. Print 0, 2, 4, 6, 8, 10, 12, 14, 16 ms. Commit the table as a
   measurement. Do not change the default. Do not gate CI on this table.
