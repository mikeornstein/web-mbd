# Prediction: four-deck node-output re-run (measurement, not a gate)

Written **before** any engine run and **before** any derived table. Do not
change this file after seeing numbers. Do not tune stiffness, load, mesh,
damping, or defaults. Do not widen any bar. Do not apply a time shift. Do
not merge. Do not publish GitHub Pages. Do not touch the Pages workflow.
This pull request stays a draft.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.

Package pin (also in `opencourant-linux64-pin.json`, recorded before the
run): OpenCourant linux64 tag `latest-20261003`, zip
`OpenCourant_linux64.zip`, sha256
`e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8`,
size 83864216 bytes, engine commit
`6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`. The run script must refuse a
different hash. Runner: `scripts/run-deck-node-output.sh`, same copy /
starter / engine / `anim_to_vtk` pattern as `scripts/run-element-type.sh`.

## What is run (same four decks, unchanged)

The surviving table’s four decks, from committed starter and engine
inputs. No new deck variants. Physics cards are not edited. The only
overlay is `/ANIM/VECT/VEL` in the **gitignored run copy**, after
`/ANIM/VECT/DISP`. That overlay is output-only. `/DT/ANIM` is forbidden
(it would change the time-stepping). `/ANIM/DT 0.0 0.002` stays as
committed.

| Table name | Committed starter/engine | Why this folder |
| --- | --- | --- |
| golden Belytschko quad | `radioss/diag-oriented-ismstr2` | Tape source for `GOLDEN_TAPE` / `oriented-ismstr2-metrics.json`. Ishell=1, Ismstr=2. 1554 four-node shells. |
| Ishell 24 ismstr 2 | `radioss/diag-element-type/qeph-ismstr2` | Surviving Ishell 24 row. 1554 four-node shells. |
| fine re-oriented | `radioss/diag-element-type/fine` | Surviving fine row. 6216 four-node shells, 1-to-4 of the ship, re-oriented. |
| triangle /SH3N | `radioss/diag-element-type/sh3n` | Surviving triangle row. 3108 three-node shells. Stops around 11.5 ms; report it up to there. |

Not run (not in the surviving table; would be a new variant):

- `radioss/A-inflate` requests Ismstr=10. It is **not** the table golden
  and is **not** a fifth deck. Do not alter it.
- `radioss/diag-element-type/qeph` (Ishell 24, Ismstr=10) died at 0 ms
  and is not in the table.

If a deck cannot be reproduced from its committed starter/engine inputs,
say so and skip it. Do not alter the committed cards.

## Requested times (real frames, not interpolated)

Write node output at the committed animation interval so that frames
exist at the requested times **0, 2, 4, 6, 8, 10, 12, 14 and 16 ms**.
The triangle deck stops at about 11.5 ms; report it up to there.

`/DT/ANIM` is not used. The engine writes an animation frame at the
first cycle on or after each requested time, so the VTK TIME may be a
few tenths of a millisecond late (historically about 2.022 ms rather
than 2.000 ms). That is a real frame, not an interpolation of node
coordinates. Record both the requested time and the actual VTK TIME.
Pick the nearest real frame to each requested time. Never interpolate
node coordinates. Never interpolate 10, 12 or 14 ms from 8 and 16.

The locked Chiron/Themis deciding rows stay **4, 8 and 16 ms** as
already written. 10, 12 and 14 ms may now be reported as real; they
still decide nothing.

## Velocities and energy columns

Save node **velocities** as well as positions (`/ANIM/VECT/VEL` in the
run copy). Each deck’s kinetic energy from nodes is ½ m |v|² at that
frame, with lumped masses from the same rest split used for strain
energy (toy rule: one-third of ρ H0 A0 onto each triangle corner).

Record, side by side, at each requested time:

1. Strain energy from the toy’s function on that deck’s node positions
   (primary split).
2. Kinetic energy from that deck’s node velocities (same masses).
3. That deck’s own internal energy from the engine time history.
4. That deck’s own kinetic energy from the engine time history.

If (1) and (3) disagree for the same deck, that is a **convention
difference** in how the decks account for energy, not evidence about
the toy. If velocities are missing from a converted animation file, say
so; engine kinetic energy may still be readable from the time history.

Engine time history: committed `/TFILE 0.001` and `/TH/PART` `DEF`.
Convert with the package `th_to_csv` (or `th_to_csv_linux64_gf` if that
is the binary name). Map the converter’s internal-energy and
kinetic-energy columns. If a column is missing, say so.

## Quad split (fixed before the run)

The toy’s `splitQuadCsts` in `src/fe/membraneCst.ts` builds each quad
(i0, i1, i2, i3) as triangles (i0, i1, i2) and (i0, i2, i3). The toy’s
diagonal is first node to third node (i0–i2). That gives the toy’s
3,108 triangles from 1,554 quads.

The toy runs its quads **after** the outward re-winding
(`orientQuadShellOutward` in `src/inflate/orientShell.ts`).
`reverseQuad` is (i0, i3, i2, i1); the unordered pair {i0, i2} does not
change under that reverse. Confirm from the oriented quads that the
toy’s diagonal node pair is what every 1554-quad deck uses.

**PRIMARY split (decides):** map each deck quad to the matching toy
oriented quad by the same four-node set. Split that deck quad on the
**same node pair** as the toy (diagonal i0–i2 of the oriented toy
quad). All three 1554-node decks (golden, Ishell 24, triangle parents)
use the identical diagonal on the identical quad.

The triangle deck is already two `/SH3N` per parent, built as (i0,i1,i2)
and (i0,i2,i3) of each parent four-node shell. Confirm those triangles
use the toy’s {i0, i2} pair; if they do, the committed triangles **are**
the primary split. Do not rewrite the starter.

**Fine mesh caveat (locked, not a new variant):** 6,216 nodes and 6,216
four-node shells, 1-to-4 of the ship. A parent-level four-node set does
not exist on the fine mesh. Primary for each fine shell is that shell’s
own written first-to-third node pair (the same local rule as
`splitQuadCsts`). Sensitivity is the other diagonal of that same fine
shell. This is stated, not changed.

**SENSITIVITY column only (decides nothing):** the other diagonal
(i1–i3 of the same four nodes). Print primary strain energy, sensitivity
strain energy, and the size of the difference (absolute and relative).
It decides nothing.

Strain energy with the toy’s function, exactly as it is, including the
wrinkle clamp (in-plane compression is killed): sum over triangles of
0.5 × shear modulus × (first invariant − 3) × rest thickness × rest
area (`cstSample`). Do not rewrite that function.

## What is committed vs gitignored

Commit only: this plan, the locked rules module, the run script, the
package pin, tests of the plan text, a cat-only CI job, page copy that
says results are not yet written, and (after the run) the **derived**
table (strain energy, kinetic energy from nodes, engine internal and
kinetic energy, median and maximum stretch, per frame per deck, plus
the sensitivity energy difference and the locked-rule verdict).

Raw node, animation, VTK, T01, and listing files stay **out of the
repository** (`radioss/**/run/` is gitignored). CI does not need those
raw files; the cat-only job prints the plan and, later, the derived
table. If a later check needed the raw frames, say so rather than
committing them.

## Locked Chiron/Themis rules (unchanged)

Rule 0 is the per-step energy gate, already closed under 3% at both
step sizes (sampling, not a toy defect). It is not reopened. The 3%
bar is not widened. The 5% energy and median bars are not widened.
Compare:inflate is not this job.

Then, unchanged:

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

The 10, 12 and 14 ms rows may now be reported as real, but the deciding
rows stay 4, 8 and 16 ms as written.

Verdict table (unchanged):

- Energy agrees and median agrees: the low maximum stretch is a
  convention or hot-spot effect in how the decks report it; the toy's
  physics is not at fault.
- Energy low by more than 5% and one shift fits: the toy is a dynamic
  lag (split of work between motion and damping); toy physics; look at
  kinetic and damping numbers next.
- Energy low and shifts disagree: the toy spreads strain differently
  from the decks; toy physics, not timing.
- Energy agrees but shifts disagree: MIXED, no verdict, report as mixed.

If none match: NO-ROW with energy-agrees, energy-low, one-shift-fits,
and median-agrees.

Report the verdict by exactly these rules, plus every underlying
number, even if the result is inconvenient.

This file is not changed after the run. Results go in
`deck-node-output-results.md`.
