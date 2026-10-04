# Stretch diagnostics (measurement, not a gate)

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree. Rules were committed first in `stretch-diagnostics-prediction.md`
and were not changed after this run.

## Locked rules (unchanged)

- MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar.
- Main evidence is the 2, 4, 8 and 16 ms rows. Interpolated rows (10, 12, 14 ms) are reported but decide nothing.
- 0. Bookkeeping gate (toy): pressure work = strain energy + kinetic energy + damping loss within 3% at every frame. If it fails anywhere, STOP and report that the energy numbers are not trustworthy; do not report verdicts. Toy damping loss is the trapezoid of twice the Rayleigh mass rate times kinetic energy (the Rayleigh force −α m v removes power α m |v|² = 2 α KE). Pressure work is the trapezoid of pressure times volume change. This is not the remainder identity. Deck kinetic energy only if that deck’s output has velocities; otherwise say so and report that deck’s damping loss as the remainder after pressure work and strain energy.
- 1. Energy agrees: the toy's strain energy is within 5% of the golden's at 8 and 16 ms (4 ms reported), AND inside the min-to-max range of the surviving decks. Strain energy is (shear modulus / 2) × rest thickness × sum over triangles of (first invariant − 3) × rest area, from node positions with the toy’s own function. A deck that has no usable node positions at a frame does not enter that frame’s min-to-max. If the golden has no usable node positions at 8 or 16 ms, energy-agrees and energy-low are both false and the energy rows of the verdict table cannot score.
- 2. One shift fits: the time shifts for volume, median stretch and maximum stretch are each fitted separately, all three land within 0.5 ms of each other, and the shift is under 2 ms. Diagnostic only; never applied to results. A positive shift means the toy lags the golden (golden at t matches toy at t + shift).
- 3. Median agrees: the toy's median strain (stretch minus 1) is within 5% of the golden's at 8 and 16 ms.
- 4. The 2 and 4 ms rows are judged against the spread of all decks, not the golden alone (the golden's 2 ms stretch is a coarse-element artifact).
- If bookkeeping fails at any frame: STOP, no verdicts. Otherwise collect every matching verdict row in the printed order. If more than one matches, print every match. If none match, print NO-ROW with energy-agrees, energy-low, one-shift-fits, and median-agrees.
- Energy agrees and median agrees: the low maximum stretch is a convention or hot-spot effect in how the decks report it; the toy's physics is not at fault.
- Energy low by more than 5% and one shift fits: the toy is a dynamic lag (split of work between motion and damping); toy physics; look at kinetic and damping numbers next.
- Energy low and shifts disagree: the toy spreads strain differently from the decks; toy physics, not timing.
- Energy agrees but shifts disagree: MIXED, no verdict, report as mixed.

## Corrected Themis tally (committed max-stretch tapes + this solve)

```
gating bar: themis-deck-spread
old stretch bar: golden-max-2-percent (printed, not the gate)
triangle `/SH3N` in the gating spread up to ~11.5 ms (last snapshot 8 ms; 6 ms interpolated)
t_ms | toy λ | golden λ | deck min–max | Δλ golden | old 2% | Themis | ΔV | Δp | triangle λ
0 | 1.0000 | 1.0000 | 1.0000–1.0000 | 0.000% | inside | inside | 0.000% | 0.000% | 1.0000
    triangle: triangle in the gating spread
2 | 1.1183 | 1.7087 | 1.1063–1.7087 | 34.552% | outside | inside | 1.200% | 0.949% | 1.1063
    triangle: triangle in the gating spread
4 | 1.1083 | 1.6570 | 1.1604–1.6570 | 33.112% | outside | outside | 4.117% | 0.060% | 1.1604
    triangle: triangle in the gating spread
6 | 1.2855 | 1.5294 | 1.2622–1.5294 interp | 15.945% | outside | inside | 2.824% | 0.053% | 1.2622
    triangle: triangle interpolated; in the gating spread
8 | 1.4078 | 1.5578 | 1.3640–1.5578 | 9.635% | outside | inside | 3.391% | 0.042% | 1.3640
    triangle: triangle in the gating spread
10 | 1.4716 | 1.6560 | 1.6181–1.6562 interp | 11.132% | outside | outside | 3.337% | 0.024% | —
    triangle: no triangle snapshot at this tick (last 8 ms; died ~11.5 ms); not a late-window reference
12 | 1.5644 | 1.6799 | 1.6799–1.8497 interp | 6.870% | outside | outside | 3.393% | 0.034% | —
    triangle: triangle deck died ~11.5 ms; not a late-window reference
14 | 1.7364 | 1.8291 | 1.8291–2.0433 interp | 5.068% | outside | outside | 3.876% | 0.013% | —
    triangle: triangle deck died ~11.5 ms; not a late-window reference
16 | 2.1052 | 2.1282 | 2.1282–2.2369 | 1.079% | inside | outside | 2.874% | 0.001% | —
    16 ms: a miss of the edge of the spread, within the old 2% bar and well inside the roughly 5% disagreement between decks; not waved through
    triangle: triangle deck died ~11.5 ms; not a late-window reference
tally per frame:
  0 ms: inside
  2 ms: inside
  4 ms: outside (4.48% below the triangle deck)
  6 ms: inside (deck min/max interpolated)
  8 ms: inside
  10 ms: outside (9.05% below Ishell 24 ismstr 2; deck min/max interpolated)
  12 ms: outside (6.87% below golden Belytschko quad; deck min/max interpolated)
  14 ms: outside (5.07% below golden Belytschko quad; deck min/max interpolated)
  16 ms: outside (1.08% below golden Belytschko quad; a miss of the edge of the spread, within the old 2% bar and well inside the roughly 5% disagreement between decks; not waved through)
tally total: 4 inside, 5 outside of 9 frames
Themis reading (not the score): 2, 6 and 8 ms inside, 4 ms about 4.5% below the triangle deck, 10 to 16 ms outside
Difference from Themis reading: inside/outside match at 2–16 ms. 4 ms is 4.48% below the triangle deck (she said about 4.5%). 0 ms is inside (she did not mention 0).
```

16 ms note: a miss of the edge of the spread, within the old 2% bar and well inside the roughly 5% disagreement between decks; not waved through

## Node positions

golden A-inflate VTK files: 0
oriented-ismstr2 VTK files: 0
triangle /SH3N VTK files: 0
Ishell 24 VTK files: 0
fine re-oriented VTK files: 0
- golden Belytschko quad: no usable node positions (no animation frames in this repository)
- Ishell 24 ismstr 2: no usable node positions (no animation frames in this repository)
- fine re-oriented: no usable node positions (no animation frames in this repository)
- triangle /SH3N: no usable node positions (no animation frames in this repository)

## Energy table

Toy strain energy is the toy function on this solve’s node positions.
Radioss own strain is `Psi_J` from `oriented-ismstr2-metrics.json` — a
different quantity, not used to score energy-agrees.

```
t_ms | toy strain (J, toy function on node positions) | toy kinetic (J) | toy damping (J, Rayleigh integral) | toy pressure work (J) | bookkeeping rel | Radioss own strain (J, not the toy function) | interpolated
0 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.02% | 0.000000 | no
2 | 0.085942 | 0.124173 | 0.019897 | 0.161874 | 29.62% | 0.466021 | no
4 | 0.150849 | 0.065074 | 0.050152 | 0.186259 | 30.00% | 0.589457 | no
6 | 0.442878 | 0.090700 | 0.075081 | 0.555140 | 8.79% | 0.762496 | no
8 | 0.772281 | 0.090972 | 0.104192 | 0.914603 | 5.46% | 1.225281 | no
10 | 1.363426 | 0.075319 | 0.130770 | 1.526738 | 2.73% | 1.982969 | yes (decides nothing)
12 | 2.264367 | 0.081463 | 0.155883 | 2.435637 | 2.64% | 3.045096 | yes (decides nothing)
14 | 3.566180 | 0.120256 | 0.188093 | 3.765688 | 2.81% | 4.601525 | yes (decides nothing)
16 | 6.203683 | 0.109271 | 0.224871 | 6.410311 | 1.95% | 7.313070 | no
```

Bookkeeping worst relative residual: 30.00%. Pass at 3%: NO — STOP

Deck kinetic energy: none of the committed deck tapes store velocities,
so deck kinetic energy is not computed. Deck damping loss as remainder
is not computed either, because deck strain energy from the toy function
on node positions is missing when animation frames are missing.

## Median and strain table

```
t_ms | source | max | median | median strain (λ−1) | volume-averaged stretch | strain from volume-averaged | interpolated
0 | toy (this solve, toy function on node positions) | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | no
0 | golden (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | no
0 | toy kill-off (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | no
0 | Ishell 24 ismstr 2 | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | no
0 | fine re-oriented | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | no
0 | triangle /SH3N | 1.0000 | 1.0000 | 0.0000 | 1.0000 | 0.0000 | no
2 | toy (this solve, toy function on node positions) | 1.1183 | 1.0270 | 0.0270 | 1.0293 | 0.0293 | no
2 | golden (stretch-measure, committed field stats) | 1.6965 | 1.0460 | 0.0460 | 1.0662 | 0.0662 | no
2 | toy kill-off (stretch-measure, committed field stats) | 1.1179 | 1.0269 | 0.0269 | 1.0292 | 0.0292 | no
2 | Ishell 24 ismstr 2 | 1.1969 | 1.0296 | 0.0296 | 1.0339 | 0.0339 | no
2 | fine re-oriented | 1.2357 | 1.0345 | 0.0345 | 1.0430 | 0.0430 | no
2 | triangle /SH3N | 1.1063 | 1.0256 | 0.0256 | 1.0282 | 0.0282 | no
4 | toy (this solve, toy function on node positions) | 1.1083 | 1.0384 | 0.0384 | 1.0395 | 0.0395 | no
4 | golden (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | no
4 | toy kill-off (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | no
4 | Ishell 24 ismstr 2 | 1.3750 | 1.0431 | 0.0431 | 1.0505 | 0.0505 | no
4 | fine re-oriented | 1.2567 | 1.0469 | 0.0469 | 1.0524 | 0.0524 | no
4 | triangle /SH3N | 1.1604 | 1.0389 | 0.0389 | 1.0400 | 0.0400 | no
6 | toy (this solve, toy function on node positions) | 1.2855 | 1.0642 | 0.0642 | 1.0668 | 0.0668 | no
6 | golden (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | no
6 | toy kill-off (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | no
6 | Ishell 24 ismstr 2 | n/a | n/a | n/a | n/a | n/a | no
6 | fine re-oriented | n/a | n/a | n/a | n/a | n/a | no
6 | triangle /SH3N | n/a | n/a | n/a | n/a | n/a | no
8 | toy (this solve, toy function on node positions) | 1.4078 | 1.0833 | 0.0833 | 1.0871 | 0.0871 | no
8 | golden (stretch-measure, committed field stats) | 1.5577 | 1.1055 | 0.1055 | 1.1166 | 0.1166 | no
8 | toy kill-off (stretch-measure, committed field stats) | 1.4075 | 1.0832 | 0.0832 | 1.0870 | 0.0870 | no
8 | Ishell 24 ismstr 2 | 1.4321 | 1.0884 | 0.0884 | 1.0982 | 0.0982 | no
8 | fine re-oriented | 1.4626 | 1.0919 | 0.0919 | 1.0985 | 0.0985 | no
8 | triangle /SH3N | 1.3640 | 1.0771 | 0.0771 | 1.0826 | 0.0826 | no
10 | toy (this solve, toy function on node positions) | 1.4716 | 1.1105 | 0.1105 | 1.1154 | 0.1154 | yes (decides nothing)
10 | golden (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
10 | toy kill-off (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
10 | Ishell 24 ismstr 2 | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
10 | fine re-oriented | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
10 | triangle /SH3N | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
12 | toy (this solve, toy function on node positions) | 1.5644 | 1.1436 | 0.1436 | 1.1466 | 0.1466 | yes (decides nothing)
12 | golden (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
12 | toy kill-off (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
12 | Ishell 24 ismstr 2 | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
12 | fine re-oriented | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
12 | triangle /SH3N | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
14 | toy (this solve, toy function on node positions) | 1.7364 | 1.1760 | 0.1760 | 1.1828 | 0.1828 | yes (decides nothing)
14 | golden (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
14 | toy kill-off (stretch-measure, committed field stats) | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
14 | Ishell 24 ismstr 2 | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
14 | fine re-oriented | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
14 | triangle /SH3N | n/a | n/a | n/a | n/a | n/a | yes (decides nothing)
16 | toy (this solve, toy function on node positions) | 2.1052 | 1.2259 | 0.2259 | 1.2393 | 0.2393 | no
16 | golden (stretch-measure, committed field stats) | 2.1276 | 1.2483 | 0.2483 | 1.2702 | 0.2702 | no
16 | toy kill-off (stretch-measure, committed field stats) | 2.1044 | 1.2257 | 0.2257 | 1.2391 | 0.2391 | no
16 | Ishell 24 ismstr 2 | 2.1761 | 1.2309 | 0.2309 | 1.2502 | 0.2502 | no
16 | fine re-oriented | 2.2369 | 1.2321 | 0.2321 | 1.2458 | 0.2458 | no
16 | triangle /SH3N | n/a | n/a | n/a | n/a | n/a | no
```

2 and 4 ms vs the spread of all decks (not the golden alone):
  2 ms: toy max 1.1183 vs deck spread 1.1063–1.7087 → inside. Members: golden Belytschko quad 1.7087; Ishell 24 ismstr 2 1.1969; fine re-oriented 1.2357; triangle /SH3N 1.1063.
  4 ms: toy max 1.1083 vs deck spread 1.1604–1.6570 → outside. Members: golden Belytschko quad 1.6570; Ishell 24 ismstr 2 1.3750; fine re-oriented 1.2567; triangle /SH3N 1.1604.

## Time shift (diagnostic only; never applied)

volume shift 0.510 ms; median stretch shift 1.880 ms; maximum stretch shift 3.460 ms; shifts disagree or exceed 2 ms; diagnostic only, never applied

energy-agrees=false energy-low=false one-shift-fits=false median-agrees=false energy-comparable=false
energy 8 ms toy 0.772281 J vs golden n/a J rel n/a
energy 16 ms toy 6.203683 J vs golden n/a J rel n/a
energy 4 ms toy 0.150849 J vs golden n/a J (reported, not a decide row)
median strain 8 ms toy 0.083258 vs golden 0.105452 rel 21.05%
median strain 16 ms toy 0.225913 vs golden 0.248304 rel 9.02%

## Verdict

STOP: energy numbers are not trustworthy (bookkeeping failed). No verdicts.
