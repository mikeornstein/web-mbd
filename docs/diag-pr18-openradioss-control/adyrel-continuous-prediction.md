# Prediction: documented continuous relaxation in the toy

Written **before** any new toy run of a continuous-relaxation option.
Diagnosis only. Stiffness, load law, bands (2% stretch / 5% volume /
5% pressure), the golden, and the Pages workflow stay unchanged.

This file records what I expect a **documented** Radioss relaxation
(the `/DYREL` per-step velocity update that `/ADYREL` is based on) to
do at 2, 8, and 16 ms against the already-committed references, and
what result would refute that. It is not a fit to a curve.

Numbers below for the current toy and for Radioss decks are
**computed by a previous run** (already committed in
`kill-off-results.md` and `element-type.md`). They are not new
results for this step.

## What is being predicted

Replace the toy’s 0.18 kinetic-energy-peak velocity kill with the
**documented continuous** `/DYREL` velocity update, keeping the
already-present Rayleigh mass damping of 80 per second (the deck’s
`/DAMP` card). Do not invent a period or a factor. Use only the
documented formula plus this deck’s actual settings: a bare `/ADYREL`
(no start time, no stop time, no factor, no period on the card).

The deck and the help text for that card are already quoted in
`kill-off-prediction.md`. This prediction assumes that the help pages
plus the deck pin every constant the toy needs. If they do not, this
prediction is not tested, because the option must not be implemented
with a fitted constant.

## References already on disk (not re-run)

Maximum stretch at 2 / 8 / 16 ms (**computed by a previous run**):

| source | 2 ms | 8 ms | 16 ms |
| --- | ---: | ---: | ---: |
| toy, 0.18 peak kill **on** (shipped default) | 1.118 | 1.277 | 1.422 |
| toy, 0.18 peak kill **off** | 1.118 | 1.408 | 2.105 |
| golden four-node Belytschko (Ishell 1) | 1.709 | 1.558 | 2.128 |
| three-node shells | 1.106 | 1.364 | dies at 11.5 ms |
| physically stabilized four-node (Ishell 24, small-strain 2) | 1.197 | 1.432 | 2.176 |
| fine re-oriented four-node | 1.236 | 1.463 | 2.237 |

At 2 ms, kill on and kill off are the **same** stretch 1.118. The 0.18
peak kill has not yet changed the run. Volume is about 520 mL and
pressure about 3.25 kPa on the toy and on every surviving Radioss
deck. **computed by a previous run.**

The 1.70 golden peak at 2 ms is a coarse four-node Belytschko
artifact (triangle 1.04 near element 90, other four-node formulation
1.03, fine mesh 1.18). **computed by a previous run** in
`element-type.md`. The reviewer has already ruled that.

## Prediction (the claim under test)

If the documented continuous update is a **per-step damper of one
period**, not a 0.18 peak kill, and if it is no stronger than the
Radioss decks already use (those decks all carry the same bare
`/ADYREL` plus Rayleigh 80 per second), then:

1. **2 ms.** Toy maximum stretch stays near **1.12**, the same as
   both current kill-on and kill-off, and the same neighborhood as
   the triangle deck (1.11). It does **not** move toward golden
   1.71. Volume stays near 520 mL. Pressure stays near 3.25 kPa.
2. **8 ms.** Toy maximum stretch sits nearer **kill-off 1.41** and
   the surviving Radioss decks (triangle 1.36, Ishell 24 1.43, fine
   1.46, golden 1.56) than **kill-on 1.28**. Volume nearer 600 mL
   than the lagged kill-on 588 mL. Pressure still ~13 kPa (the load
   law is unchanged).
3. **16 ms.** Toy maximum stretch sits nearer **kill-off 2.11** and
   the surviving four-node decks (golden 2.13, Ishell 24 2.18, fine
   2.24) than **kill-on 1.42**. Volume nearer 870 mL than the lagged
   kill-on 665 mL. Pressure still ~26 kPa.

Matching the golden’s 1.70 at 2 ms would be chasing an element-type
artifact, not supporting the prediction. Matching a **single** freeze
(including 16 ms alone) does not count as support. The whole 0–16 ms
sampled curve must be compared.

**guess (clearly marked):** because kill on and kill off have not yet
diverged at 2 ms, a continuous damper that is milder than the 0.18
peak kill should also be invisible at 2 ms and should only show up
later, where the 0.18 peak kill currently lags the Radioss decks.

## What result would refute this

Any one of these refutes the prediction:

- At **2 ms**, maximum stretch moves toward golden **1.71** (for
  example ≥ 1.4). That would be tracking the Belytschko artifact,
  not the documented relaxation.
- At **2 ms**, stretch, volume, or pressure **leaves** the band that
  both kill-on and kill-off already share with the triangle deck
  (stretch ~1.12, volume ~520 mL, pressure ~3.25 kPa). Continuous
  relaxation that distorts the early answer relative to both current
  options is the wrong default.
- At **8 ms** or **16 ms**, stretch stays as lagged as kill-on
  (within 2% of 1.277 at 8 ms, or within 2% of 1.422 at 16 ms). Then
  the documented formula, as implemented, is as aggressive as the
  0.18 peak kill and does not justify a default change.
- At **16 ms**, stretch or volume leaves the spread of the Radioss
  decks that survive that frame (stretch about 2.13–2.24, volume
  about 878–892 mL) **and** is not inside 2%/5% of kill-off. Then
  continuous relaxation is a third, unphysical curve.
- The analytic sphere peak (about 32 kPa at stretch 1.383) is
  distorted compared with both current kill-on and kill-off. That
  check is step 3 of the work order; a fail there stops the default
  change even if 2/8/16 ms look better.

No scale, period, or factor will be fitted afterward. If the help
pages plus the deck do not pin a constant the toy needs, this
prediction is not run.

## Runs that will be made only after this file is committed

None yet. Next is reading the `/DYREL` and `/ADYREL` help pages and
writing the formula, period, factor, and defaults with the page
cited. Implementation, sphere check, and default change wait on
that.
