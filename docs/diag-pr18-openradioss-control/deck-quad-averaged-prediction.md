# Prediction: quad-averaged stretch and node-distance measurement (not a gate)

Written **before** any new number is computed. Do not change this file
after seeing numbers. Do not tune stiffness, load, mesh, damping, or
defaults. Do not widen any bar. Do not apply a time shift. Do not
merge. Do not publish GitHub Pages. Do not touch the Pages workflow.
This pull request stays a draft. Read-only on the toy: no fix.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.

This file sits next to `deck-node-output-prediction.md`. Chiron and
Themis already ruled on the four-deck node-output re-run. The frames
from that re-run are reused; they are not a fifth deck and they are
not a physics change.

Package pin (unchanged): OpenCourant linux64 tag `latest-20261003`,
zip sha256
`e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8`,
size 83864216 bytes, engine commit
`6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`.

Keep raw animation and VTK files out of the repository. Commit only
this plan, then later the derived tables, scripts, and package
version. Do not turn compare:inflate green.

## Themis additions (locked in this file before any number)

These two items are part of this plan. They were written before any
quad-averaged, node-distance, or engine-primary number from this
measurement exists. They do not move a bar.

### (1) Shared node numbering (golden and Ishell 24)

Golden (`radioss/diag-oriented-ismstr2`) and Ishell 24
(`radioss/diag-element-type/qeph-ismstr2`) share node numbering, so
node-by-node distance between them is meaningful.

Checked from the committed starters, before any new number:

- both `/NODE` blocks have 1,554 nodes, ids 1 through 1,554 in the
  same order
- rest coordinates match with maximum |Δ| = 0
- both `/SHELL/1` blocks have 1,554 elements with identical element
  ids and identical four-node winding (first three shells are
  (367, 445, 470, 439), (869, 941, 972, 947), (232, 295, 347, 288)
  in both files)
- only `/PROP/SHELL/1` Ishell differs (golden 1, Ishell 24 24);
  Ismstr is 2 in both

The fine mesh does not share this numbering (6,216 nodes). Triangle
`/SH3N` shares the 1,554 nodes but is already two triangles per
parent. Toy versus golden node-to-node distance uses the same 1,554
ids.

### (2) Rule B report at 2 ms and 6 ms (decides nothing)

Also print the ratio (toy-versus-golden distance) / (golden-versus-
Ishell-24 distance) at 2 ms and at 6 ms, for root-mean-square and
for the 95th percentile. That print is a report only; it decides
nothing. The bar stays at 4, 8 and 16 ms, factor 1.0.

## RULE A (engine energy is primary)

For every deck (golden, Ishell 24, fine re-oriented, triangle) print
the deck’s own engine-reported internal energy, and the toy-function
energy on the deck’s node positions as a second column labeled
**convention difference, not evidence about the toy**.

Score energy on the engine column: energy agrees if the toy’s strain
energy is within 5% of the golden’s engine internal energy at 8 and
16 ms (4 ms reported) and is inside the min to max of the decks’
engine internal energies at the same frames. Show the engine
energies for Ishell 24 and the fine mesh too, so the spread can be
judged.

The verdict table stays as locked: energy agrees plus shifts
disagree is MIXED, no verdict.

## RULE B (direct node positions, no strain formula)

The toy and the decks share the same 1,554-quad node set. At each
reported frame (use the deck’s real frame time and solve the toy to
that same time), measure the root-mean-square node-to-node distance
and the 95th percentile distance between golden and Ishell 24 (they
share the mesh). Then measure the same two distances for toy versus
golden.

Bar: toy-versus-golden RMS distance at 4, 8 and 16 ms must not
exceed the golden-versus-Ishell-24 RMS distance at the same frame
(factor 1.0). Also report toy versus Ishell 24 and toy versus fine
where node sets allow (fine only via the parent quads’ original
nodes). Report the ratios.

Also print the toy-versus-golden over golden-versus-Ishell-24
distance ratio at 2 ms and at 6 ms, as a report that decides
nothing. The bar stays at 4, 8 and 16 ms, factor 1.0.

## RULE C (quad-averaged stretch, blind to node-scale wobble and to the diagonal)

For each quad, compute the stretch from its averaged deformation
using all four corners: the in-plane deformation gradient at the
quad centre from the four corner positions against the rest shape,
and take the larger principal stretch. Compute median, 95th
percentile and maximum of that measure for the toy and every deck at
every reported frame. Refit the three time shifts (volume unchanged;
median of this measure; maximum of this measure), diagnostic only,
never applied.

Bars (Chiron’s):

1. the toy’s median strain (stretch minus 1) must be within 5% of
   the golden’s at 8 and 16 ms, OR within the distance between
   golden and Ishell 24 median strain at the same frame, whichever
   is larger
2. the three shifts must land within 0.5 ms of each other and each
   be under 2 ms

Outcomes:

- both pass means the stretch lag is the decks’ node-wobble
  convention and the page says so
- median still low means the toy genuinely stores strain more
  evenly than the decks, and the next step is the energy and
  damping partition (report only, do not change it)
- anything else, report as it is

## What is committed vs gitignored

Commit only this plan first, before any derived table. After the
measurement: derived tables, scripts, and package version. Raw node,
animation, VTK, T01, and listing files stay gitignored. Compare:inflate
is not this job. No bar is widened.

This file is not changed after numbers exist. Results go in a later
derived file, not here.
