# Prediction: energy and damping split (measurement, not a gate)

Written **before** any new number is computed. Do not change this file
after seeing numbers. Do not tune stiffness, load, mesh, damping, or
defaults. Do not widen any bar. Do not apply a time shift. Do not
merge. Do not publish GitHub Pages. Do not touch the Pages workflow.
This pull request stays a draft. Read-only on the toy: no fix.

Do not edit `deck-quad-averaged-prediction.md`. Chiron and Themis
read the quad-averaged result and asked for this energy and damping
split. The four-deck node-output frames and engine time-history files
from that re-run are reused; they are not a fifth deck and they are
not a physics change.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.

Package pin (unchanged): OpenCourant linux64 tag `latest-20261003`,
zip sha256
`e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8`,
size 83864216 bytes, engine commit
`6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`.

Keep raw animation, VTK, listing, restart, and engine time-history
files out of the repository. Commit only this plan, then later the
derived tables, scripts, and package version. Do not turn
compare:inflate green. Do not add a verdict row.

## What to measure

At **2, 4, 8 and 16 ms** (use each deck’s real frame time from the
animation TIME stamp and solve the toy to that same time) report four
numbers in joules for the toy and for each of the four decks (golden
Belytschko quad, Ishell 24, fine re-oriented, triangle). The triangle
deck stops about 11.5 ms, so it has **no 16 ms row**.

For each of those times, print:

1. pressure (external) work
2. internal energy
3. kinetic energy
4. dissipated = external work minus internal minus kinetic

Also print each as a share of the external work (that number divided
by the external work at the same time). If external work is missing
or zero, say so and do not invent a share.

## How (engine files and channels, locked before numbers)

Do **not** sum between animation frames. Sampling between animation
frames is what fooled the earlier bookkeeping.

### Decks

Read the engine’s own energy history. Two products exist in each
gitignored `run/` folder from the already-committed node-output
re-run. Name them and their resolution here, before any scored
number:

- Time-history file `AinflateT01`, converted with the package
  `th_to_csv` to `AinflateT01.csv`. The committed engine card is
  `/TFILE 0.001`, so this file is one sample per millisecond, **not**
  one sample per cycle. The converter’s global columns to use, when
  present, are exactly: `EXTERNAL WORK` (pressure / external work),
  `INTERNAL ENERGY`, `KINETIC ENERGY`. Hourglass, as information
  only: `HOURGLASS ENERGY`. Contact viscosity, as information only
  if present: `DAMPING CONTACT ENERGY`. There is no column named
  numerical viscosity in that header. If a named column is absent
  for a deck, say so plainly and report what does exist; do not
  infer or invent a value.
- Listing `Ainflate_0001.out` cycle table (`CYCLE`, `TIME`,
  `I-ENERGY`, `K-ENERGY T`, `EXT-WORK`). The committed engine card
  is `/PRINT/-200`, so that table is every 200 cycles, **not** every
  cycle. It is a coarser print than the time-history file. It is
  not the scored source when the time-history channels above exist.

Scored deck numbers come from the time-history channels at the sample
nearest the deck’s real animation TIME for that requested frame. Say
in the results which file, which column, and that the time-history
step is 1 ms (`/TFILE 0.001`) while the listing step is 200 cycles
(`/PRINT/-200`). Do not rebuild external work from volume change
between VTK frames.

### Toy

Use the per-step sums already built for the energy gate, same
definitions as before: pressure work (trapezoid of pressure times
volume change at every solver step), strain energy (the toy’s own
function on the toy’s own nodes), kinetic energy (½ m |v|²), and
logged damping (trapezoid of twice the Rayleigh mass rate times
kinetic energy). Rayleigh mass rate stays 80 per second.

Toy external work is that pressure work. Toy internal energy is that
strain energy. Toy kinetic energy is that kinetic energy. Toy
dissipated is external work minus internal minus kinetic, as locked
above. Solve the toy to the golden deck’s real animation TIME at
each requested frame (same interpolation in time already used for
the quad-averaged measurement). Do not apply a time shift.

## Locked rules (compare shares at 4 ms and 8 ms)

The range is min to max over the four decks; include the triangle
deck at a frame only if it has that frame.

(a) If the toy’s dissipated share is **above** the decks’ range at
4 ms **and** at 8 ms, the outcome is: the toy damps too much early;
that is one place the 0.5 ms lag could come from.

(b) If the toy’s kinetic share is **outside** the decks’ range at
4 ms **and** at 8 ms, the outcome is: the lag points to how mass is
spread.

(c) If dissipated and kinetic shares **both sit inside** the decks’
range at 4 ms **and** at 8 ms, the outcome is: the difference is in
how strain is distributed.

Report any other combination exactly as it is. Do not add a verdict
row. Do not force (a), (b), or (c) if the booleans do not match.

Also print how much of each deck’s dissipated energy is hourglass
energy, or contact damping energy, if the engine reports that column,
as **information only**. Those columns do not rescore (a), (b), or
(c).

Print 2 ms and 16 ms in the table. They do not decide (a), (b), or
(c). 16 ms has no triangle row.

## Page wording only (text, no numbers or bars changed)

This wording is locked here, before any new number from this split.
It is applied to the page in the same commit as the derived tables,
clearly separated from the new table. It does not widen a bar, does
not apply a shift, and does not add a verdict row.

Chiron’s corrected lag line **replaces** the earlier “state the
volume and median-stretch lag as about 0.5 ms”. Say **reference
solvers**, not “the solver”.

1. Retire the maximum-stretch lag as a claim about the toy, because
   on the wobble-blind measure its shift went from 3.46 ms to minus
   0.08 ms and the earlier value was a yardstick artifact. Keep the
   number in the table; label it as a yardstick artifact, not a
   claim about the toy.

2. The film runs about half a millisecond behind the reference
   solvers throughout the run. That shows up as roughly 12% low in
   median stretch mid-run (8 ms) and about 3% low at the 16 ms
   freeze; the 0.5 ms fit was made across all frames, so the lag
   does not disappear at the freeze, it only looks smaller there
   because stretch changes more slowly near the end. Neither the
   page nor any caption may imply the film is physically exact or
   that the shape matches: node positions sit about three times
   farther from the decks than the decks sit from each other.

3. State the node-position result as: the toy sits about three times
   farther from the decks than the decks (golden and Ishell 24, same
   nodes, same winding) sit from each other, not that the toy is
   wrong.

4. Print the strict energy bar facts as they are (toy 0.771 J versus
   lowest deck 0.774 J, 0.003 J under the spread) without calling it
   a pass.

Look for an on-canvas caption in the web app. If one exists, the
same lag line goes there as text only and must not change how the
mesh is drawn. If there is none, say so in the results and **do not
add one**.

## What is committed vs gitignored

Commit only this plan first, before any derived table. After the
measurement: derived tables, scripts, and package version. Raw node,
animation, VTK, T01, listing, and restart files stay gitignored.
Compare:inflate is not this job. No bar is widened. No verdict row
is added.

This file is not changed after numbers exist. Results go in a later
derived file, not here.
