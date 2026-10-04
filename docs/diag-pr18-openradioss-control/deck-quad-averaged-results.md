# Quad-averaged stretch and node-distance (measurement, not a gate)

Plan was committed first in `deck-quad-averaged-prediction.md` and was not
changed after this run. Engine internal energy is the **primary** energy
column. Toy-function energy on deck nodes is a convention difference, not
evidence about the toy. No bar was widened. No time shift was applied.

OpenCourant latest-20261003 sha256 `e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8`, engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`.

## Table A — engine energy (primary) vs toy-function on nodes (convention)

### golden Belytschko quad

requested ms | actual VTK ms | engine internal (J, **primary**) | toy-function on nodes (J, convention difference, not evidence about the toy) | note
0 | 0.0000 | 0.000000 | 0.000000 | convention difference, not evidence about the toy; engine column is primary
2 | 2.0222 | 0.083462 | 0.394748 | convention difference, not evidence about the toy; engine column is primary
4 | 4.0037 | 0.157433 | 0.550496 | convention difference, not evidence about the toy; engine column is primary
6 | 6.0049 | 0.413565 | 0.765334 | convention difference, not evidence about the toy; engine column is primary
8 | 8.0014 | 0.794436 | 1.232988 | convention difference, not evidence about the toy; engine column is primary
10 | 10.0002 | 1.400737 | 1.970835 | convention difference, not evidence about the toy; engine column is primary
12 | 12.0007 | 2.335770 | 3.034473 | convention difference, not evidence about the toy; engine column is primary
14 | 14.0025 | 3.783358 | 4.605772 | convention difference, not evidence about the toy; engine column is primary
16 | 16.0038 | 6.290036 | 7.297366 | convention difference, not evidence about the toy; engine column is primary

### Ishell 24 ismstr 2

requested ms | actual VTK ms | engine internal (J, **primary**) | toy-function on nodes (J, convention difference, not evidence about the toy) | note
0 | 0.0000 | 0.000000 | 0.000000 | convention difference, not evidence about the toy; engine column is primary
2 | 2.0096 | 0.083215 | 0.111495 | convention difference, not evidence about the toy; engine column is primary
4 | 4.0034 | 0.167206 | 0.235200 | convention difference, not evidence about the toy; engine column is primary
6 | 6.0071 | 0.406073 | 0.523049 | convention difference, not evidence about the toy; engine column is primary
8 | 8.0053 | 0.786568 | 0.960946 | convention difference, not evidence about the toy; engine column is primary
10 | 10.0023 | 1.368432 | 1.611540 | convention difference, not evidence about the toy; engine column is primary
12 | 12.0006 | 2.271828 | 2.595031 | convention difference, not evidence about the toy; engine column is primary
14 | 14.0024 | 3.713076 | 4.122838 | convention difference, not evidence about the toy; engine column is primary
16 | 16.0004 | 6.136814 | 6.649384 | convention difference, not evidence about the toy; engine column is primary

### fine re-oriented

requested ms | actual VTK ms | engine internal (J, **primary**) | toy-function on nodes (J, convention difference, not evidence about the toy) | note
0 | 0.0000 | 0.000000 | 0.000000 | convention difference, not evidence about the toy; engine column is primary
2 | 2.0008 | 0.081491 | 0.177143 | convention difference, not evidence about the toy; engine column is primary
4 | 4.0029 | 0.159691 | 0.256082 | convention difference, not evidence about the toy; engine column is primary
6 | 6.0024 | 0.387681 | 0.538666 | convention difference, not evidence about the toy; engine column is primary
8 | 8.0004 | 0.773949 | 0.971121 | convention difference, not evidence about the toy; engine column is primary
10 | 10.0008 | 1.389956 | 1.638352 | convention difference, not evidence about the toy; engine column is primary
12 | 12.0015 | 2.349280 | 2.639728 | convention difference, not evidence about the toy; engine column is primary
14 | 14.0015 | 3.818424 | 4.174994 | convention difference, not evidence about the toy; engine column is primary
16 | 16.0019 | 6.278884 | 6.703378 | convention difference, not evidence about the toy; engine column is primary

### triangle /SH3N

requested ms | actual VTK ms | engine internal (J, **primary**) | toy-function on nodes (J, convention difference, not evidence about the toy) | note
0 | 0.0000 | 0.000000 | 0.000000 | convention difference, not evidence about the toy; engine column is primary
2 | 2.0031 | 0.091737 | 0.099088 | convention difference, not evidence about the toy; engine column is primary
4 | 4.0057 | 0.174295 | 0.193366 | convention difference, not evidence about the toy; engine column is primary
6 | 6.0012 | 0.402471 | 0.438337 | convention difference, not evidence about the toy; engine column is primary
8 | 8.0021 | 0.774510 | 0.832261 | convention difference, not evidence about the toy; engine column is primary
10 | 10.0002 | 1.363037 | 1.453835 | convention difference, not evidence about the toy; engine column is primary
12 | n/a | n/a | n/a | triangle deck died ~11.5 ms; not a late-window reference
14 | n/a | n/a | n/a | triangle deck died ~11.5 ms; not a late-window reference
16 | n/a | n/a | n/a | triangle deck died ~11.5 ms; not a late-window reference

Toy own strain energy (this solve, interpolated to the golden VTK TIME):
4 ms 0.150936 J; 8 ms 0.771347 J; 16 ms 6.203835 J.

## Table B — node-to-node distance (no strain formula)

requested ms | actual VTK ms | golden–Ishell RMS (m) | golden–Ishell p95 (m) | toy–golden RMS (m) | toy–golden p95 (m) | toy–Ishell RMS (m) | toy–fine parent RMS (m) | RMS ratio toy–golden / golden–Ishell | p95 ratio | note
0 | 0.0000 | 0.00000000 | 0.00000000 | 0.00000004 | 0.00000006 | 0.00000004 | 0.00000004 | n/a | n/a | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554
2 | 2.0222 | 0.00042498 | 0.00088815 | 0.00052440 | 0.00117122 | 0.00053615 | 0.00037221 | 1.2340 | 1.3187 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554 report only, decides nothing
4 | 4.0037 | 0.00064469 | 0.00133855 | 0.00182904 | 0.00280809 | 0.00198161 | 0.00196242 | 2.8371 | 2.0979 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554 bar frame (factor 1.0)
6 | 6.0049 | 0.00041958 | 0.00067293 | 0.00115720 | 0.00196962 | 0.00110971 | 0.00117153 | 2.7580 | 2.9269 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554 report only, decides nothing
8 | 8.0014 | 0.00044977 | 0.00068223 | 0.00117677 | 0.00194810 | 0.00127699 | 0.00115919 | 2.6164 | 2.8555 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554 bar frame (factor 1.0)
10 | 10.0002 | 0.00074538 | 0.00145492 | 0.00125754 | 0.00194473 | 0.00114084 | 0.00115772 | 1.6871 | 1.3367 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554
12 | 12.0007 | 0.00063737 | 0.00118675 | 0.00173764 | 0.00308052 | 0.00133727 | 0.00175491 | 2.7262 | 2.5958 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554
14 | 14.0025 | 0.00038200 | 0.00063090 | 0.00140318 | 0.00212850 | 0.00119668 | 0.00138020 | 3.6733 | 3.3737 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554
16 | 16.0038 | 0.00044134 | 0.00070829 | 0.00142612 | 0.00243488 | 0.00139633 | 0.00126749 | 3.2313 | 3.4377 | real frames; toy interpolated to golden VTK TIME; fine uses parent nodes 1–1554 bar frame (factor 1.0)

## Table C — quad-averaged stretch (four-corner centre, larger principal)

Toy (this solve, interpolated to golden VTK TIME):
requested ms | median | p95 | max
0 | 1.000000 | 1.000000 | 1.000000
2 | 1.023225 | 1.037635 | 1.078016
4 | 1.033437 | 1.050981 | 1.083485
6 | 1.053810 | 1.091295 | 1.193870
8 | 1.072444 | 1.131727 | 1.311517
10 | 1.097933 | 1.176372 | 1.348601
12 | 1.131900 | 1.213595 | 1.415147
14 | 1.163394 | 1.278465 | 1.541776
16 | 1.211143 | 1.394687 | 1.831541

### golden Belytschko quad

requested ms | actual VTK ms | median | p95 | max | n quads | note
0 | 0.0000 | 1.000004 | 1.000015 | 1.000023 | 1554 | quad-centre stretch from four corners; real frame
2 | 2.0222 | 1.027683 | 1.042687 | 1.073810 | 1554 | quad-centre stretch from four corners; real frame
4 | 4.0037 | 1.040205 | 1.058267 | 1.094430 | 1554 | quad-centre stretch from four corners; real frame
6 | 6.0049 | 1.061021 | 1.097811 | 1.192221 | 1554 | quad-centre stretch from four corners; real frame
8 | 8.0014 | 1.082760 | 1.138995 | 1.265131 | 1554 | quad-centre stretch from four corners; real frame
10 | 10.0002 | 1.107365 | 1.185899 | 1.324089 | 1554 | quad-centre stretch from four corners; real frame
12 | 12.0007 | 1.138347 | 1.238437 | 1.396334 | 1554 | quad-centre stretch from four corners; real frame
14 | 14.0025 | 1.172975 | 1.307286 | 1.573240 | 1554 | quad-centre stretch from four corners; real frame
16 | 16.0038 | 1.217571 | 1.404287 | 1.826747 | 1554 | quad-centre stretch from four corners; real frame

### Ishell 24 ismstr 2

requested ms | actual VTK ms | median | p95 | max | n quads | note
0 | 0.0000 | 1.000004 | 1.000015 | 1.000023 | 1554 | quad-centre stretch from four corners; real frame
2 | 2.0096 | 1.024463 | 1.041066 | 1.074581 | 1554 | quad-centre stretch from four corners; real frame
4 | 4.0034 | 1.035860 | 1.053811 | 1.097899 | 1554 | quad-centre stretch from four corners; real frame
6 | 6.0071 | 1.056899 | 1.089207 | 1.205156 | 1554 | quad-centre stretch from four corners; real frame
8 | 8.0053 | 1.078295 | 1.130581 | 1.263900 | 1554 | quad-centre stretch from four corners; real frame
10 | 10.0023 | 1.102304 | 1.174903 | 1.326211 | 1554 | quad-centre stretch from four corners; real frame
12 | 12.0006 | 1.133896 | 1.231030 | 1.415933 | 1554 | quad-centre stretch from four corners; real frame
14 | 14.0024 | 1.168270 | 1.306511 | 1.587744 | 1554 | quad-centre stretch from four corners; real frame
16 | 16.0004 | 1.213568 | 1.396127 | 1.817790 | 1554 | quad-centre stretch from four corners; real frame

### fine re-oriented

requested ms | actual VTK ms | median | p95 | max | n quads | note
0 | 0.0000 | 1.000000 | 1.000000 | 1.000000 | 6216 | quad-centre stretch from four corners; real frame
2 | 2.0008 | 1.025101 | 1.045891 | 1.095294 | 6216 | quad-centre stretch from four corners; real frame
4 | 4.0029 | 1.038071 | 1.059047 | 1.113930 | 6216 | quad-centre stretch from four corners; real frame
6 | 6.0024 | 1.056250 | 1.091190 | 1.188736 | 6216 | quad-centre stretch from four corners; real frame
8 | 8.0004 | 1.078485 | 1.131369 | 1.269240 | 6216 | quad-centre stretch from four corners; real frame
10 | 10.0008 | 1.105357 | 1.181536 | 1.367378 | 6216 | quad-centre stretch from four corners; real frame
12 | 12.0015 | 1.136710 | 1.236583 | 1.472800 | 6216 | quad-centre stretch from four corners; real frame
14 | 14.0015 | 1.171959 | 1.306888 | 1.653189 | 6216 | quad-centre stretch from four corners; real frame
16 | 16.0019 | 1.216419 | 1.397420 | 1.919471 | 6216 | quad-centre stretch from four corners; real frame

### triangle /SH3N

requested ms | actual VTK ms | median | p95 | max | n quads | note
0 | 0.0000 | 1.000004 | 1.000015 | 1.000023 | 1554 | quad-centre stretch from four corners; real frame
2 | 2.0031 | 1.024937 | 1.039162 | 1.084052 | 1554 | quad-centre stretch from four corners; real frame
4 | 4.0057 | 1.037778 | 1.056425 | 1.118595 | 1554 | quad-centre stretch from four corners; real frame
6 | 6.0012 | 1.055502 | 1.091382 | 1.191367 | 1554 | quad-centre stretch from four corners; real frame
8 | 8.0021 | 1.075880 | 1.126709 | 1.266638 | 1554 | quad-centre stretch from four corners; real frame
10 | 10.0002 | 1.100853 | 1.175131 | 1.346138 | 1554 | quad-centre stretch from four corners; real frame
12 | n/a | n/a | n/a | n/a | n/a | triangle deck died ~11.5 ms; not a late-window reference
14 | n/a | n/a | n/a | n/a | n/a | triangle deck died ~11.5 ms; not a late-window reference
16 | n/a | n/a | n/a | n/a | n/a | triangle deck died ~11.5 ms; not a late-window reference

## Bars

Rule A energy (engine column): 8 ms toy 0.771347 vs golden engine 0.794436 (rel 2.91%); 16 ms toy 6.203835 vs golden engine 6.290036 (rel 1.37%); 4 ms reported toy 0.150936 vs golden engine 0.157433 (rel 4.13%). energy-agrees=false energy-low=false.
Rule B distance (factor 1.0 at 4, 8, 16 ms): 4 ms ratio 2.8371 holds=false; 8 ms ratio 2.6164 holds=false; 16 ms ratio 3.2313 holds=false. distance-bar-holds=false. 2 ms and 6 ms ratios are a report that decides nothing.
Rule C median strain: 8 ms toy 0.072444 vs golden 0.082760 (rel 12.46%, bar 0.004465, Ishell 0.078295); 16 ms toy 0.211143 vs golden 0.217571 (rel 2.95%, bar 0.010879, Ishell 0.213568). median-agrees=false.
Rule C shifts (ms, diagnostic only, never applied): volume 0.510, median 0.480, maximum -0.080. shifts disagree or exceed 2 ms; diagnostic only, never applied one-shift-fits=false.

## Verdict

Locked table: NO-ROW: no printed verdict row matches. Report the four booleans and every underlying number. energy-agrees=false energy-low=false one-shift-fits=false median-agrees=false energy-comparable=true
Rule C outcome: Median still low means the toy genuinely stores strain more evenly than the decks, and the next step is the energy and damping partition (report only, do not change it).
