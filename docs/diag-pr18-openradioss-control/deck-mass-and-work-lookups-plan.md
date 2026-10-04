# Plan: film mass, p ΔV work, and kinetic ringing (lookup, not a gate)

Written **before** any new number is computed. Do not change this file
after seeing numbers. Do not edit earlier plan files
(`deck-energy-split-prediction.md`, `deck-quad-averaged-prediction.md`,
`deck-node-output-prediction.md`, or any other plan in this folder).
Do not tune stiffness, load, mesh, damping, or defaults. Do not
widen any bar. Do not apply a time shift. Do not merge. Do not
publish GitHub Pages. Do not touch the Pages workflow. This pull
request stays a draft. Read-only on the toy: no fix. No new engine
run. No verdict row. Compare:inflate is not this job.

Reuse the already-committed four-deck node-output products and the
toy per-step energy ledger. They are not a fifth deck and they are
not a physics change.

Package pin (unchanged): OpenCourant linux64 tag `latest-20261003`,
zip sha256
`e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8`,
size 83864216 bytes, engine commit
`6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`.

Keep raw animation, VTK, listing, restart, and engine time-history
files out of the repository. Commit only this plan first, then later
the derived tables, the simple plot, scripts, and package version.

## Lookup 1 — film mass

Print total film mass for the toy and for each of the four decks
(golden Belytschko quad, Ishell 24, fine re-oriented, triangle).
Mass is density × thickness × rest area. Write density, thickness,
and rest area next to the mass, and name where each came from.

- Toy density: `RHO` in `src/inflate/constants.ts` (Desmopan 85085A,
  1130 kg/m³). Toy thickness: `H0` in that same file
  (`0.015 × 0.0254` m). Toy rest area: sum of rest triangle areas
  on the outward-oriented ship mesh the toy actually solves
  (`loadShipMesh` / `splitQuadCsts`).
- Deck density: `/MAT/LAW42/1` field `RHO_I` in that deck’s committed
  starter `Ainflate_0000.rad`. Deck thickness: `/PROP/SHELL/1` field
  `Thick` in the same file. Deck rest area: sum of rest element
  areas from that starter’s `/NODE` plus `/SHELL` or `/SH3N`
  connectivity. Quad decks split each four-node shell on the same
  first-to-third diagonal the toy uses. The triangle deck uses the
  written `/SH3N` triangles. The fine deck uses its own 6,216 shells.
  Do not use deformed area.

Print each deck’s mass as a percent difference from the toy:
`100 × (m_deck − m_toy) / m_toy`. Name which input (density,
thickness, or rest area) carries any difference.

## Lookup 2 — work at 4 ms and 8 ms

For the toy and each deck, at **4 ms and 8 ms**, print:

1. change in enclosed volume from rest, `ΔV = V(t) − V_rest`
   (not the total volume)
2. applied pressure at that time
3. the pressure-times-volume-change they imply, `p × ΔV`
4. the recorded external work next to it

Name the source of each series. Do not interpolate a missing
channel. If a named column is absent, say so.

- Toy volume: the solver’s enclosed volume at that time, rest from
  the first step. Toy pressure: the committed ramp
  `P_MAX ×` the unit function of time (`0 → 65_000` Pa in `0.04` s,
  `src/inflate/constants.ts`). Toy recorded external work: the
  per-step trapezoid of pressure times volume change (same ledger
  as the energy-split run). Solve the toy to the golden deck’s real
  animation TIME at 4 ms and 8 ms. No time shift.
- Deck recorded external work: `AinflateT01.csv` column
  `EXTERNAL WORK` at the sample nearest that deck’s real animation
  TIME. Time-history step is 1 ms (`/TFILE 0.001`). The listing
  `Ainflate_0001.out` (every 200 cycles) is not the scored source
  when that column exists.
- Deck applied pressure: the committed starter `/FUNCT/1` times
  `/PLOAD` `Fscale_y` (65_000 Pa) evaluated at that sample’s TIME.
  That is the prescribed load card, not a measured channel. If
  `AinflateT01.csv` also has a pressure column, print it as
  information and name it; do not invent one if it is absent.
- Deck volume: inspect `AinflateT01.csv` for a volume column. If
  one is present, use the sample nearest the requested time. If
  none is present, say so, and take enclosed volume from the
  **nearest animation frame** (VTK `TIME` and node positions,
  same `enclosedVolume` function, that deck’s rest connectivity).
  Rest volume is the first animation frame, or the starter `/NODE`
  rest if that frame is missing. Do not interpolate between frames.
  Do not rebuild external work from those volumes; `p × ΔV` is
  printed beside the recorded channel, not as a replacement.

Implied work is `p × ΔV` at that instant, not the trapezoid
integral. The trapezoid is the recorded toy external work only.

## Lookup 3 — ringing, 4 ms to 8 ms

- Toy: kinetic energy `½ m |v|²` at **every solver step** from 4 ms
  through 8 ms. Write that series as a table (CSV is the every-step
  table) and a simple plot.
- Decks: kinetic energy from `AinflateT01.csv` column
  `KINETIC ENERGY`, once per millisecond (`/TFILE 0.001`), over the
  same window. The listing every 200 cycles is not the scored
  source when that column exists. If a deck has no sample in the
  window, say so; do not infer one.

State whether the toy’s curve **rises and falls** (ringing) or
**stays high**. Oscillation means the 4–8 ms toy series is not
monotonic: there exist three times `4 ms ≤ t1 < t2 < t3 ≤ 8 ms`
with a peak (`KE(t2) > KE(t1)` and `KE(t2) > KE(t3)`) or a trough
(`KE(t2) < KE(t1)` and `KE(t2) < KE(t3)`). Otherwise it does not
oscillate. “Stays high” is the non-oscillating case in this window.

## Reading rules (decide the report line)

The 5% mass bar is the only numeric threshold in this lookup. Do
not invent another.

(a) If any deck’s total film mass differs from the toy by **more
than 5%**, the candidate cause is that mass difference. Name the
exact input that differs (density, thickness, or rest area) and by
what percent.

(b) If every deck’s mass is within 5% of the toy **and** the toy’s
kinetic energy oscillates in the 4–8 ms window, report **ringing**
and show the traces.

(c) If every deck’s mass is within 5% of the toy **and** there is
no oscillation, report the cause as **open**.

Do not propose or apply a fix in this run. Do not add a verdict
row. Do not turn compare:inflate green.

## What is committed vs gitignored

Commit only this plan first, before any derived table. After the
lookups: derived tables, the simple plot, scripts, and package
version. Raw node, animation, VTK, T01, listing, and restart files
stay gitignored. Compare:inflate is not this job. No bar is
widened. No verdict row is added.

This file is not changed after numbers exist. Results go in a later
derived file, not here.
