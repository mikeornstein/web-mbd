# Plan: refit the toy’s lag on volume change from rest

Written **before** any new number is computed. Do not change this file
after seeing numbers. Do not edit earlier plan files. Do not edit any
other file. Do not tune stiffness, load, mesh, damping, or defaults.
Do not widen any bar. Do not apply a time shift. Do not merge. Do not
publish GitHub Pages. Do not touch the Pages workflow. This pull
request stays a draft. Read-only on data already in the repository:
no engine run, no toy change, no fix. No verdict row. Compare:inflate
is not this job.

## What to refit

Refit the time shift of the toy against each of the golden Belytschko
quad, Ishell 24, and fine decks, and against the triangle deck up to
where it dies, using **volume change from rest**

```
dV(t) = V(t) − V(0)
```

instead of total volume `V(t)`.

Report the shift fitted over three windows — 0 to 4 ms, 4 to 8 ms,
8 to 16 ms — plus the all-frames fit. Triangle only on frames that
exist (the triangle deck died ~11.5 ms; last real requested frame is
10 ms).

This is a recompute, not a gate. Positive shift still means the toy
lags. The shift is never applied.

## Procedure and frames reused (the existing 0.510 ms volume-shift fit)

Reuse the **same shift-fitting procedure** as the committed 0.510 ms
volume shift:

- function `bestTimeShiftMs` in `src/oracle/stretchDiagnosticRules.ts`
- the same call used by `scoreStretchDiagnostics` in that file, and
  by the node-output run `src/cli/diagnose-deck-node-output.ts` (and
  the quad-averaged scorer `src/oracle/deckQuadAveragedScore.ts`),
  which all printed volume shift 0.510 ms
- grid −4 to +4 ms, step 0.01 ms; interpolates the toy series at
  gold time plus shift; RMS; positive = toy lags; never applied

Reuse the **same animation frames**:

- `DECK_NODE_REQUESTED_MS` in `src/oracle/deckNodeOutputRules.ts`,
  identical to `EVERY_FRAME_MS` in `src/oracle/survivingDecks.ts`:
  0, 2, 4, 6, 8, 10, 12, 14, 16 ms
- gold times stay those requested milliseconds, as in the 0.510 fit
- deck `V(t)` is the nearest real animation frame’s enclosed volume
  (not interpolated between frames)

## Data already in the repository (no new solve)

- Deck `V(t)`: `volume_mL` at each `requested_ms` in
  `docs/diag-pr18-openradioss-control/deck-node-output-results.json`
  (the same golden volumes the 0.510 fit used). A null volume is a
  missing frame; do not infer one.
- Toy `V(t)`: the committed kill-off every-frame volumes at those
  nine requested times, the same nearest-animation-interval pairing
  `diagnose-deck-node-output.ts` used when it built `volumeToy` for
  the 0.510 fit. Source: `killOffSamples` in
  `src/oracle/compareInflate.test.ts` (the shipped Letter A tape;
  also the toy column of `every-frame-results.md`). Label each
  sample at the requested millisecond, not at the slightly-offset
  history time, matching the 0.510 call.
- Rest volume `V(0)` is the t = 0 sample of that same series.
  `dV(0) = 0` by construction.

The toy series passed to `bestTimeShiftMs` is the **full** nine-frame
`dV` series so interpolation at gold time plus shift can use
neighbors, exactly as the 0.510 all-frames fit did. Each window
restricts only the gold points being matched:

- 0 to 4 ms: gold frames at 0, 2, 4 ms
- 4 to 8 ms: gold frames at 4, 6, 8 ms
- 8 to 16 ms: gold frames at 8, 10, 12, 14, 16 ms (triangle: 8 and
  10 ms only)
- all-frames: every usable gold frame

## Reading rules (decide the report line)

The deciding pairing is toy versus golden (the same pairing as the
0.510 ms volume-shift fit). The Ishell 24, fine, and triangle fits
are printed beside it. They do not decide the wording.

(1) If the golden all-frames `dV` shift is within 0.35 to 0.65 ms
**and** the three window shifts differ by less than 0.2 ms
(maximum minus minimum of the 0–4, 4–8, and 8–16 fits), the wording
“about half a millisecond behind throughout” stands.

(2) If the early window shift exceeds the later ones by 0.2 ms or
more (0–4 minus 4–8 is ≥ 0.2 ms **and** 0–4 minus 8–16 is ≥ 0.2 ms),
the wording becomes “behind mainly early in the run”, with the
numbers.

(3) Otherwise report the numbers and say the lag is not a single
shift.

Do not propose or apply a fix. Do not add a verdict row. Do not turn
compare:inflate green. Do not change the page.

## What is committed vs gitignored

Commit only this plan first, before any derived table. After the
recompute: `lag-on-volume-change-results.md` and
`lag-on-volume-change-results.json` beside this file. No other file
is edited. No engine output is added.

This file is not changed after numbers exist. Results go in a later
derived file, not here.
