# Energy and damping split (measurement, not a gate)

Plan was committed first in `deck-energy-split-prediction.md` and was not
changed after this run. No bar was widened. No time shift was applied.
No verdict row was added. Compare:inflate is not this job.

OpenCourant latest-20261003 sha256 `e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8`, engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`.

Scored deck numbers come from AinflateT01.csv columns EXTERNAL WORK, INTERNAL ENERGY, and KINETIC ENERGY at the sample nearest the deck's real animation TIME. Do not rebuild external work from volume change between VTK frames. If a named column is absent, say so and do not invent a value.
time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Toy external work is per-step pressure work. Toy internal energy is per-step strain energy. Toy kinetic energy is per-step ½ m |v|². Toy dissipated is external work minus internal minus kinetic. Solve the toy to the golden deck's real animation TIME. Do not apply a time shift.
MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar. Do not add a verdict row.
Do not add a verdict row.

## Sources

- golden Belytschko quad: scored from `radioss/diag-oriented-ismstr2/run/AinflateT01.csv`; columns present: EXTERNAL WORK, INTERNAL ENERGY, KINETIC ENERGY, HOURGLASS ENERGY, DAMPING CONTACT ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
- Ishell 24 ismstr 2: scored from `radioss/diag-element-type/qeph-ismstr2/run/AinflateT01.csv`; columns present: EXTERNAL WORK, INTERNAL ENERGY, KINETIC ENERGY, HOURGLASS ENERGY, DAMPING CONTACT ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
- fine re-oriented: scored from `radioss/diag-element-type/fine/run/AinflateT01.csv`; columns present: EXTERNAL WORK, INTERNAL ENERGY, KINETIC ENERGY, HOURGLASS ENERGY, DAMPING CONTACT ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
- triangle /SH3N: scored from `radioss/diag-element-type/sh3n/run/AinflateT01.csv`; columns present: EXTERNAL WORK, INTERNAL ENERGY, KINETIC ENERGY, HOURGLASS ENERGY, DAMPING CONTACT ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.

## Table — joules and shares of external work

### toy (this solve, interpolated to golden VTK TIME)

requested ms | actual VTK ms | time-history ms | external work (J) | internal (J) | kinetic (J) | dissipated (J) | external share | internal share | kinetic share | dissipated share | hourglass (J, info) | contact damping (J, info) | hourglass / dissipated | contact damping / dissipated | source | note
2 | 2.0222 | 2.0222 | 0.222750 | 0.086566 | 0.123605 | 0.012578 | 100.00% | 38.86% | 55.49% | 5.65% | n/a | n/a | n/a | n/a | toy per-step pressure work / strain / kinetic | Toy external work is per-step pressure work. Toy internal energy is per-step strain energy. Toy kinetic energy is per-step ½ m |v|². Toy dissipated is external work minus internal minus kinetic. Solve the toy to the golden deck's real animation TIME. Do not apply a time shift. interpolated to golden VTK TIME 2.0222 ms.
4 | 4.0037 | 4.0037 | 0.251127 | 0.151197 | 0.065105 | 0.034825 | 100.00% | 60.21% | 25.93% | 13.87% | n/a | n/a | n/a | n/a | toy per-step pressure work / strain / kinetic | Toy external work is per-step pressure work. Toy internal energy is per-step strain energy. Toy kinetic energy is per-step ½ m |v|². Toy dissipated is external work minus internal minus kinetic. Solve the toy to the golden deck's real animation TIME. Do not apply a time shift. interpolated to golden VTK TIME 4.0037 ms.
8 | 8.0014 | 8.0014 | 0.947340 | 0.771733 | 0.090972 | 0.084635 | 100.00% | 81.46% | 9.60% | 8.93% | n/a | n/a | n/a | n/a | toy per-step pressure work / strain / kinetic | Toy external work is per-step pressure work. Toy internal energy is per-step strain energy. Toy kinetic energy is per-step ½ m |v|². Toy dissipated is external work minus internal minus kinetic. Solve the toy to the golden deck's real animation TIME. Do not apply a time shift. interpolated to golden VTK TIME 8.0014 ms.
16 | 16.0038 | 16.0038 | 6.446422 | 6.203864 | 0.109271 | 0.133287 | 100.00% | 96.24% | 1.70% | 2.07% | n/a | n/a | n/a | n/a | toy per-step pressure work / strain / kinetic | Toy external work is per-step pressure work. Toy internal energy is per-step strain energy. Toy kinetic energy is per-step ½ m |v|². Toy dissipated is external work minus internal minus kinetic. Solve the toy to the golden deck's real animation TIME. Do not apply a time shift. interpolated to golden VTK TIME 16.0038 ms.

### golden Belytschko quad

requested ms | actual VTK ms | time-history ms | external work (J) | internal (J) | kinetic (J) | dissipated (J) | external share | internal share | kinetic share | dissipated share | hourglass (J, info) | contact damping (J, info) | hourglass / dissipated | contact damping / dissipated | source | note
2 | 2.0222 | 2.0222 | 0.229689 | 0.083462 | 0.138976 | 0.007250 | 100.00% | 36.34% | 60.51% | 3.16% | 0.002331 | 0.000000 | 32.15% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
4 | 4.0037 | 4.0037 | 0.225722 | 0.157433 | 0.048264 | 0.020025 | 100.00% | 69.75% | 21.38% | 8.87% | 0.004216 | 0.000000 | 21.05% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
8 | 8.0014 | 8.0014 | 0.831052 | 0.794436 | 0.012785 | 0.023831 | 100.00% | 95.59% | 1.54% | 2.87% | 0.003528 | 0.000000 | 14.81% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
16 | 16.0038 | 16.0038 | 6.340456 | 6.290036 | 0.024254 | 0.026166 | 100.00% | 99.20% | 0.38% | 0.41% | 0.004009 | 0.000000 | 15.32% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.

### Ishell 24 ismstr 2

requested ms | actual VTK ms | time-history ms | external work (J) | internal (J) | kinetic (J) | dissipated (J) | external share | internal share | kinetic share | dissipated share | hourglass (J, info) | contact damping (J, info) | hourglass / dissipated | contact damping / dissipated | source | note
2 | 2.0096 | 2.0096 | 0.216539 | 0.083215 | 0.118454 | 0.014871 | 100.00% | 38.43% | 54.70% | 6.87% | 0.000000 | 0.000000 | 0.00% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
4 | 4.0034 | 4.0034 | 0.254010 | 0.167206 | 0.046140 | 0.040665 | 100.00% | 65.83% | 18.16% | 16.01% | 0.000000 | 0.000000 | 0.00% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
8 | 8.0053 | 8.0053 | 0.847668 | 0.786568 | 0.007451 | 0.053649 | 100.00% | 92.79% | 0.88% | 6.33% | 0.000000 | 0.000000 | 0.00% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
16 | 16.0004 | 16.0004 | 6.217129 | 6.136814 | 0.022819 | 0.057496 | 100.00% | 98.71% | 0.37% | 0.92% | 0.000000 | 0.000000 | 0.00% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.

### fine re-oriented

requested ms | actual VTK ms | time-history ms | external work (J) | internal (J) | kinetic (J) | dissipated (J) | external share | internal share | kinetic share | dissipated share | hourglass (J, info) | contact damping (J, info) | hourglass / dissipated | contact damping / dissipated | source | note
2 | 2.0008 | 2.0008 | 0.222122 | 0.081491 | 0.135677 | 0.004954 | 100.00% | 36.69% | 61.08% | 2.23% | 0.001216 | 0.000000 | 24.55% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
4 | 4.0029 | 4.0029 | 0.191749 | 0.159691 | 0.023447 | 0.008611 | 100.00% | 83.28% | 12.23% | 4.49% | 0.001353 | 0.000000 | 15.71% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
8 | 8.0004 | 8.0004 | 0.797037 | 0.773949 | 0.012920 | 0.010168 | 100.00% | 97.10% | 1.62% | 1.28% | 0.001284 | 0.000000 | 12.62% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
16 | 16.0019 | 16.0019 | 6.311092 | 6.278884 | 0.020722 | 0.011486 | 100.00% | 99.49% | 0.33% | 0.18% | 0.001107 | 0.000000 | 9.64% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.

### triangle /SH3N

requested ms | actual VTK ms | time-history ms | external work (J) | internal (J) | kinetic (J) | dissipated (J) | external share | internal share | kinetic share | dissipated share | hourglass (J, info) | contact damping (J, info) | hourglass / dissipated | contact damping / dissipated | source | note
2 | 2.0031 | 2.0031 | 0.213657 | 0.091737 | 0.121128 | 0.000791 | 100.00% | 42.94% | 56.69% | 0.37% | 0.000000 | 0.000000 | 0.00% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
4 | 4.0057 | 4.0057 | 0.199335 | 0.174295 | 0.023804 | 0.001236 | 100.00% | 87.44% | 11.94% | 0.62% | 0.000000 | 0.000000 | 0.00% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
8 | 8.0021 | 8.0021 | 0.787177 | 0.774510 | 0.010797 | 0.001869 | 100.00% | 98.39% | 1.37% | 0.24% | 0.000000 | 0.000000 | 0.00% | 0.00% | AinflateT01.csv EXTERNAL WORK/INTERNAL ENERGY/KINETIC ENERGY | time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist.
16 | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | none | triangle deck died ~11.5 ms; not a late-window reference; no 16 ms row; not inferred

## Shares at 4 ms and 8 ms (decide a / b / c)

Toy dissipated share: 4 ms 13.87%; 8 ms 8.93%.
Deck dissipated-share range at 4 ms: min 0.62% max 16.01% (n=4)
Deck dissipated-share range at 8 ms: min 0.24% max 6.33% (n=4)
Toy kinetic share: 4 ms 25.93%; 8 ms 9.60%.
Deck kinetic-share range at 4 ms: min 11.94% max 21.38% (n=4)
Deck kinetic-share range at 8 ms: min 0.88% max 1.62% (n=4)
Booleans: dissipated-above 4 false 8 true; kinetic-outside 4 true 8 true; dissipated-inside 4 true 8 false; kinetic-inside 4 false 8 false; fires (a)=false (b)=true (c)=false. 2 ms and 16 ms are in the table and do not decide.

Outcome: (b) the lag points to how mass is spread

Hourglass and contact damping are information only and do not rescore the outcome.

## Page wording (text, no numbers or bars changed; clearly separated)

Retire the maximum-stretch lag as a claim about the toy, because on the wobble-blind measure its shift went from 3.46 ms to minus 0.08 ms and the earlier value was a yardstick artifact. Keep the number in the table; label it as a yardstick artifact, not a claim about the toy.
The film runs about half a millisecond behind the reference solvers throughout the run. That shows up as roughly 12% low in median stretch mid-run (8 ms) and about 3% low at the 16 ms freeze; the 0.5 ms fit was made across all frames, so the lag does not disappear at the freeze, it only looks smaller there because stretch changes more slowly near the end. Neither the page nor any caption may imply the film is physically exact or that the shape matches: node positions sit about three times farther from the decks than the decks sit from each other.
The toy sits about three times farther from the decks than the decks (golden and Ishell 24, same nodes, same winding) sit from each other, not that the toy is wrong.
Toy 0.771 J versus lowest deck 0.774 J, 0.003 J under the spread. That is the strict energy bar fact; it is not a pass.
There is no on-canvas lag caption. None was added. Mesh drawing is unchanged.

No verdict row was added.
