# Prediction: stretch tally fix and read-only stretch diagnostics

Written **before** any new diagnostic run. Not a physics pass. Not a
gate. Do not tune stiffness, load, mesh, damping, or defaults. Do not
widen any bar. Do not apply a time shift to any result.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.

## A. Tally (re-score of committed max-stretch tapes; not this diagnostic run)

Triangle `/SH3N` is **in** the Themis gating spread up to about 11.5 ms
(last snapshot 8 ms; 6 ms interpolated from 4 and 8). 10, 12 and 14 ms
deck min/max stay labeled interpolated. The 16 ms row says, in these
words: a miss of the edge of the spread, within the old 2% bar and well
inside the roughly 5% disagreement between decks; not waved through.

The page says stretch is validated at the 16 ms freeze and lags the
decks earlier in the run. Compare stays red under
`compare:inflate — Themis deck-spread bar (currently misses)`.

Themis’s reading (not the score): 2, 6 and 8 ms inside, 4 ms about 4.5%
below the triangle deck, 10 to 16 ms outside. The printed tally is what
the code computes. Any difference is flagged.

## B. Decision rules (locked before the run)

MEASUREMENT, not a gate. Does not change compare:inflate. Does not
widen any bar.

Main evidence is the 2, 4, 8 and 16 ms rows. Interpolated rows (10, 12,
14 ms) are reported but decide nothing.

0. Bookkeeping gate (toy): pressure work = strain energy + kinetic
   energy + damping loss within 3% at every frame. If it fails
   anywhere, STOP and report that the energy numbers are not
   trustworthy; do not report verdicts. Toy damping loss is the
   trapezoid of twice the Rayleigh mass rate times kinetic energy (the
   Rayleigh force −α m v removes power α m |v|² = 2 α KE). Pressure
   work is the trapezoid of pressure times volume change. This is not
   the remainder identity. Deck kinetic energy only if that deck’s
   output has velocities; otherwise say so and report that deck’s
   damping loss as the remainder after pressure work and strain energy.

1. Energy agrees: the toy's strain energy is within 5% of the golden's
   at 8 and 16 ms (4 ms reported), AND inside the min-to-max range of
   the surviving decks. Strain energy is (shear modulus / 2) × rest
   thickness × sum over triangles of (first invariant − 3) × rest area,
   from node positions with the toy’s own function. A deck that has no
   usable node positions at a frame does not enter that frame’s
   min-to-max. If the golden has no usable node positions at 8 or 16
   ms, energy-agrees and energy-low are both false and the energy rows
   of the verdict table cannot score.

2. One shift fits: the time shifts for volume, median stretch and
   maximum stretch are each fitted separately, all three land within
   0.5 ms of each other, and the shift is under 2 ms. Diagnostic only;
   never applied to results. A positive shift means the toy lags the
   golden (golden at t matches toy at t + shift).

3. Median agrees: the toy's median strain (stretch minus 1) is within
   5% of the golden's at 8 and 16 ms.

4. The 2 and 4 ms rows are judged against the spread of all decks, not
   the golden alone (the golden's 2 ms stretch is a coarse-element
   artifact).

If bookkeeping fails at any frame: STOP, no verdicts. Otherwise collect
every matching verdict row in the printed order. If more than one
matches, print every match. If none match, print NO-ROW with
energy-agrees, energy-low, one-shift-fits, and median-agrees.

Verdict table:

- Energy agrees and median agrees: the low maximum stretch is a
  convention or hot-spot effect in how the decks report it; the toy's
  physics is not at fault.
- Energy low by more than 5% and one shift fits: the toy is a dynamic
  lag (split of work between motion and damping); toy physics; look at
  kinetic and damping numbers next.
- Energy low and shifts disagree: the toy spreads strain differently
  from the decks; toy physics, not timing.
- Energy agrees but shifts disagree: MIXED, no verdict, report as mixed.

Report the verdict by exactly these rules, plus every underlying
number, even if the result is inconvenient.

## What will be read (no new physics)

- Toy: shipped kill-off Letter A solve, same defaults. Strain energy
  and kinetic energy from that solve’s node positions and velocities.
  Median and volume-averaged stretch from the same samples.
- Decks: committed `element-type.json` and `stretch-measure.json`
  field stats (max, median, area-weighted mean) at the snapshots those
  files already hold. Radioss’s own strain energy in
  `oriented-ismstr2-metrics.json` is a different quantity and is
  printed only as such.
- Node positions for Radioss decks: animation frames are **not** in
  this repository. If they are still missing at run time, that deck’s
  toy-function strain energy is not computed, and that fact is stated.

This file is not changed after the run. Results go in
`stretch-diagnostics-results.md`.
