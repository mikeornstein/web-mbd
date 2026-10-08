# Film mass, p ΔV work, and kinetic ringing (lookup, not a gate)

Plan was committed first in `deck-mass-and-work-lookups-plan.md` and was not
changed after this run. No bar was widened. No time shift was applied.
No verdict row was added. No fix was proposed. Compare:inflate is not this job.

OpenCourant latest-20261003 sha256 `e0d2b8b956ba451b4214b5f04f019922a0bd0bdab134ce171037ae69c0309fa8`, engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`.

MEASUREMENT, not a gate. Does not change compare:inflate. Does not widen any bar. Do not add a verdict row. Do not propose or apply a fix.
Film mass is density × thickness × rest area. Toy density is RHO in src/inflate/constants.ts. Toy thickness is H0 in that file. Toy rest area is the sum of rest triangle areas on the outward-oriented ship mesh. Deck density is /MAT/LAW42/1 field RHO_I. Deck thickness is /PROP/SHELL/1 field Thick. Deck rest area is from that starter's /NODE plus /SHELL or /SH3N. Do not use deformed area.
Implied work is applied pressure times the change in enclosed volume from rest, p × ΔV, printed beside recorded external work. ΔV is V(t) − V_rest, not total volume. Do not interpolate a missing channel.
Inspect AinflateT01.csv for a volume column. If none is present, say so and take enclosed volume from the nearest animation frame. Rest volume is the first animation frame, or the starter /NODE rest if that frame is missing. Do not interpolate between frames.
Deck applied pressure is the committed starter /FUNCT/1 times /PLOAD Fscale_y evaluated at that sample's TIME. If AinflateT01.csv also has a pressure column, print it as information; do not invent one if it is absent.
Oscillation means the 4–8 ms toy series is not monotonic: there exist three times 4 ms ≤ t1 < t2 < t3 ≤ 8 ms with a peak (KE(t2) > KE(t1) and KE(t2) > KE(t3)) or a trough (KE(t2) < KE(t1) and KE(t2) < KE(t3)). Otherwise it does not oscillate. “Stays high” is the non-oscillating case in this window.
Do not add a verdict row.
Do not propose or apply a fix in this run.

## Lookup 1 — film mass

name | mass (kg) | density (kg/m³) | thickness (m) | rest area (m²) | vs toy | density source | thickness source | area source | engine MASS (info)
toy | 0.01792624 | 1130.0 | 0.000381000 | 0.04163762 | 0.0000% | src/inflate/constants.ts RHO (Desmopan 85085A, 1130 kg/m³) | src/inflate/constants.ts H0 = 0.015 × 0.0254 m | sum of rest triangle areas on loadShipMesh after outward orient, splitQuadCsts first-to-third diagonal | n/a (toy; not an engine MASS channel)
golden Belytschko quad | 0.01792624 | 1130.0 | 0.000381000 | 0.04163762 | -0.0000% | radioss/diag-oriented-ismstr2/Ainflate_0000.rad /MAT/LAW42/1 field RHO_I | radioss/diag-oriented-ismstr2/Ainflate_0000.rad /PROP/SHELL/1 field Thick | radioss/diag-oriented-ismstr2/Ainflate_0000.rad /NODE plus /SHELL/1 rest areas, first-to-third diagonal split | 0.01792624 (T01 column MASS (engine reported; information only, not the scored mass))
Ishell 24 ismstr 2 | 0.01792624 | 1130.0 | 0.000381000 | 0.04163762 | -0.0000% | radioss/diag-element-type/qeph-ismstr2/Ainflate_0000.rad /MAT/LAW42/1 field RHO_I | radioss/diag-element-type/qeph-ismstr2/Ainflate_0000.rad /PROP/SHELL/1 field Thick | radioss/diag-element-type/qeph-ismstr2/Ainflate_0000.rad /NODE plus /SHELL/1 rest areas, first-to-third diagonal split | 0.01792624 (T01 column MASS (engine reported; information only, not the scored mass))
fine re-oriented | 0.01792624 | 1130.0 | 0.000381000 | 0.04163762 | -0.0000% | radioss/diag-element-type/fine/Ainflate_0000.rad /MAT/LAW42/1 field RHO_I | radioss/diag-element-type/fine/Ainflate_0000.rad /PROP/SHELL/1 field Thick | radioss/diag-element-type/fine/Ainflate_0000.rad /NODE plus /SHELL/1 rest areas, first-to-third diagonal split | 0.01792624 (T01 column MASS (engine reported; information only, not the scored mass))
triangle /SH3N | 0.01792624 | 1130.0 | 0.000381000 | 0.04163762 | -0.0000% | radioss/diag-element-type/sh3n/Ainflate_0000.rad /MAT/LAW42/1 field RHO_I | radioss/diag-element-type/sh3n/Ainflate_0000.rad /PROP/SHELL/1 field Thick | radioss/diag-element-type/sh3n/Ainflate_0000.rad /NODE plus /SH3N/1 rest areas, written triangles | 0.01792624 (T01 column MASS (engine reported; information only, not the scored mass))

Mass match bar is 5%. Max |deck − toy| / toy = 0.0000%.

## Lookup 2 — work at 4 ms and 8 ms

name | requested ms | actual ms | ΔV from rest (m³) | ΔV (mL) | applied p (Pa) | p × ΔV (J) | recorded external work (J) | volume source | pressure source | external-work source
toy | 4 | 4.0037 | 0.00010455 | 104.5495 | 6506.01 | 0.680200 | 0.251271 | toy enclosedVolume at golden VTK TIME 4.0037 ms; rest from first solver step | toy committed ramp P_MAX × unit function of time (src/inflate/constants.ts; same /FUNCT/1 shape) | toy per-step trapezoid of pressure times volume change, interpolated to golden VTK TIME 4.0037 ms
fine re-oriented | 4 | 4.0029 | 0.00012989 | 129.8921 | 6504.76 | 0.844917 | 0.191749 | T01 has no volume column; nearest animation frame Ainflate_A003.vtk TIME 4.0029 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-element-type/fine/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 4.0029 ms; T01 has no pressure column | radioss/diag-element-type/fine/run/AinflateT01.csv EXTERNAL WORK at 4.0029 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
golden Belytschko quad | 4 | 4.0037 | 0.00012701 | 127.0088 | 6506.01 | 0.826321 | 0.225722 | T01 has no volume column; nearest animation frame Ainflate_A003.vtk TIME 4.0037 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-oriented-ismstr2/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 4.0037 ms; T01 has no pressure column | radioss/diag-oriented-ismstr2/run/AinflateT01.csv EXTERNAL WORK at 4.0037 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Ishell 24 ismstr 2 | 4 | 4.0034 | 0.00012168 | 121.6760 | 6505.59 | 0.791574 | 0.254010 | T01 has no volume column; nearest animation frame Ainflate_A003.vtk TIME 4.0034 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-element-type/qeph-ismstr2/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 4.0034 ms; T01 has no pressure column | radioss/diag-element-type/qeph-ismstr2/run/AinflateT01.csv EXTERNAL WORK at 4.0034 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
triangle /SH3N | 4 | 4.0057 | 0.00012269 | 122.6913 | 6509.18 | 0.798620 | 0.199335 | T01 has no volume column; nearest animation frame Ainflate_A003.vtk TIME 4.0057 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-element-type/sh3n/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 4.0057 ms; T01 has no pressure column | radioss/diag-element-type/sh3n/run/AinflateT01.csv EXTERNAL WORK at 4.0057 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
toy | 8 | 8.0014 | 0.00018137 | 181.3702 | 13002.26 | 2.358222 | 0.947048 | toy enclosedVolume at golden VTK TIME 8.0014 ms; rest from first solver step | toy committed ramp P_MAX × unit function of time (src/inflate/constants.ts; same /FUNCT/1 shape) | toy per-step trapezoid of pressure times volume change, interpolated to golden VTK TIME 8.0014 ms
fine re-oriented | 8 | 8.0004 | 0.00019960 | 199.5976 | 13000.65 | 2.594899 | 0.797037 | T01 has no volume column; nearest animation frame Ainflate_A005.vtk TIME 8.0004 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-element-type/fine/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 8.0004 ms; T01 has no pressure column | radioss/diag-element-type/fine/run/AinflateT01.csv EXTERNAL WORK at 8.0004 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
golden Belytschko quad | 8 | 8.0014 | 0.00020257 | 202.5662 | 13002.26 | 2.633818 | 0.831052 | T01 has no volume column; nearest animation frame Ainflate_A005.vtk TIME 8.0014 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-oriented-ismstr2/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 8.0014 ms; T01 has no pressure column | radioss/diag-oriented-ismstr2/run/AinflateT01.csv EXTERNAL WORK at 8.0014 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Ishell 24 ismstr 2 | 8 | 8.0053 | 0.00019489 | 194.8896 | 13008.56 | 2.535234 | 0.847668 | T01 has no volume column; nearest animation frame Ainflate_A005.vtk TIME 8.0053 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-element-type/qeph-ismstr2/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 8.0053 ms; T01 has no pressure column | radioss/diag-element-type/qeph-ismstr2/run/AinflateT01.csv EXTERNAL WORK at 8.0053 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
triangle /SH3N | 8 | 8.0021 | 0.00018950 | 189.5011 | 13003.35 | 2.464148 | 0.787177 | T01 has no volume column; nearest animation frame Ainflate_A005.vtk TIME 8.0021 ms; rest from first animation frame Ainflate_A001.vtk TIME 0.0000 ms; T01 has no volume column | radioss/diag-element-type/sh3n/Ainflate_0000.rad /FUNCT/1 × /PLOAD Fscale_y=65000 Pa at TIME 8.0021 ms; T01 has no pressure column | radioss/diag-element-type/sh3n/run/AinflateT01.csv EXTERNAL WORK at 8.0021 ms; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist

## Lookup 3 — kinetic energy 4–8 ms

The toy kinetic-energy curve in 4–8 ms rises and falls (ringing).
Toy samples in window: 1632 (every solver step; CSV is the every-step table). Plot: `deck-mass-work-lookups-ke-4-to-8.svg`.

name | time-history ms | kinetic (J) | source
golden Belytschko quad | 4.0037 | 0.048264 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
golden Belytschko quad | 5.0002 | 0.020833 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
golden Belytschko quad | 6.0049 | 0.012672 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
golden Belytschko quad | 7.0003 | 0.011085 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
golden Belytschko quad | 8.0014 | 0.012785 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Ishell 24 ismstr 2 | 4.0034 | 0.046140 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Ishell 24 ismstr 2 | 5.0100 | 0.013800 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Ishell 24 ismstr 2 | 6.0071 | 0.010086 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Ishell 24 ismstr 2 | 7.0005 | 0.007841 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
Ishell 24 ismstr 2 | 8.0053 | 0.007451 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
fine re-oriented | 4.0029 | 0.023447 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
fine re-oriented | 5.0010 | 0.011674 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
fine re-oriented | 6.0024 | 0.009652 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
fine re-oriented | 7.0005 | 0.009546 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
fine re-oriented | 8.0004 | 0.012920 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
triangle /SH3N | 4.0057 | 0.023804 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
triangle /SH3N | 5.0089 | 0.008822 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
triangle /SH3N | 6.0012 | 0.008328 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
triangle /SH3N | 7.0016 | 0.008227 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist
triangle /SH3N | 8.0021 | 0.010797 | AinflateT01.csv KINETIC ENERGY; time-history step is 1 ms (/TFILE 0.001); listing Ainflate_0001.out is every 200 cycles (/PRINT/-200) and is not the scored source when the time-history channels exist

Toy kinetic at the 4 ms and 8 ms ends of the every-step series (nearest solver step):
toy | 3.9998 | 0.064987 | every solver step ½ m |v|²
toy | 7.9987 | 0.091015 | every solver step ½ m |v|²

## Reading-rule outcome

Booleans: mass-match true; oscillates true; fires (a) mass-difference false (b) ringing true (c) open false. Differing input: none.
Outcome: (b) ringing

Do not add a verdict row.
Do not propose or apply a fix in this run.
