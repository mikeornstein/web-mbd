# Per-step energy bookkeeping (correctness gate on the toy)

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree. Rules were committed first in `stretch-per-step-energy-prediction.md`
and were not changed after this run.

## Locked rules (unchanged)

- The per-step bookkeeping is a correctness gate on the toy. It does not turn a red compare:inflate into a green mark.
- 0. Sum at every solver step, not between 2 ms animation frames. Pressure work: at each solver step add ½ (p at the end of the step + p at the start of the step) × (volume at the end − volume at the start). Pressure at the start is the pressure used to assemble that step. Volume at the end includes contact projection on that step. Strain energy is (shear modulus / 2) × rest thickness × sum over triangles of (first invariant − 3) × rest area, from node positions with the toy’s own function. Kinetic energy is ½ m |v|² at that frame. Logged damping loss is the trapezoid of twice the Rayleigh mass rate times kinetic energy, summed at every solver step. The Rayleigh force −α m v removes power α m |v|² = 2 α KE. Rayleigh mass rate α = 80 per second. This is not the remainder identity.
- 1. Two step sizes. Run the shipped kill-off Letter A toy with no time-step cap (about 8 microseconds) AND with dtMax = 0.000002 s (the engine’s 2 microsecond step). Do not change CFL, damping, mesh, stiffness, or load. The two must agree: for each of 2, 4, 6 and 8 ms, both close under 3% or both miss. If they disagree, STOP and report that the energy numbers are not trustworthy.
- 2. Signed gap per frame: gap = pressure work − (strain + kinetic + damping). Report sign and size. Positive (pressure work larger): energy is leaving uncounted (for example velocity clamping, unlogged damping, dissipation). Negative (pressure work smaller): energy appears from nowhere (for example first ramp steps, tension-field clamp, contact).
- 3. Damping cross-check: logged damping loss must equal 160 × the time integral of kinetic energy (trapezoid at every solver step) within 1%. If it fails, the damping bookkeeping is wrong; STOP. Report an independent Rayleigh force-work sum (α m |v|² Δt using the velocity the force saw at assemble) next to that check. The 1% rule is logged versus 160 × the kinetic-energy integral, not the force-work column.
- 4. Close bar (unchanged, not widened): |gap| / max(|pressure work|, |strain + kinetic + damping|, 10⁻¹²) ≤ 3% at a frame.
- 5. If the per-step sum closes under 3% at every reported frame at both step sizes: the earlier 2 ms-sample gap was sampling. Only the summation in the test and page changes. Then apply the already-committed Chiron/Themis decision rows (energy agrees / median / shift) with this per-step bookkeeping as the gate. Do not apply a time shift. Do not widen any bar.
- 6. If the per-step sum stays above 3% at 2, 4, 6 or 8 ms at BOTH step sizes: it is a toy defect. Read the code and find it (candidates: the damping term, anything that clamps or zeroes velocity, the handling of the first ramp steps, tension-field clamp, contact). Report the defect with file and line. Propose the smallest fix but do not apply it. Early frames are not graded until it is fixed. Do not report energy-agrees / median / shift verdicts.
- 7. If the damping cross-check fails at either step size: STOP, the damping bookkeeping is wrong. Do not report energy verdicts.
- 8. Main evidence frames for the table are 0, 2, 4, 6, 8 and 16 ms. Interpolated 10, 12, 14 ms are reported but decide nothing for the Chiron/Themis rows. The 3% close at 2–8 ms is the defect criterion. “Every reported frame” in rule 5 means 0, 2, 4, 6, 8 and 16 ms.
- 9. Node positions for Radioss decks: search the repository, run directories, and artifacts of pull requests 18 to 22 first. If animation frames are missing, say so and do not invent strain energy. Do not re-run Radioss without being told.

## Toy CFL (no dtMax)

```
Toy CFL (no dtMax): nSteps=4630 meanDt=3.457e-6 s minDt=1.770e-7 s maxDt=9.523e-6 s
t_ms | pressure work (J) | strain (J) | kinetic (J) | damping logged (J) | 160 × ∫KE (J) | force-work damping (J) | gap (J) | sign | rel | close 3%
0 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | -0.000000 | negative | 0.02% | yes
2 | 0.222478 | 0.085942 | 0.124173 | 0.012687 | 0.012687 | 0.012605 | -0.000324 | negative | 0.15% | yes
4 | 0.250718 | 0.150849 | 0.065074 | 0.036705 | 0.036705 | 0.036659 | -0.001910 | negative | 0.76% | yes
6 | 0.593342 | 0.442878 | 0.090700 | 0.068627 | 0.068627 | 0.068573 | -0.008862 | negative | 1.47% | yes
8 | 0.947930 | 0.772281 | 0.090972 | 0.096821 | 0.096821 | 0.096768 | -0.012145 | negative | 1.27% | yes
10 | 1.544858 | 1.363426 | 0.075319 | 0.123533 | 0.123533 | 0.123482 | -0.017421 | negative | 1.12% | yes
12 | 2.456263 | 2.264367 | 0.081463 | 0.150206 | 0.150206 | 0.150149 | -0.039773 | negative | 1.59% | yes
14 | 3.799972 | 3.566180 | 0.120256 | 0.182079 | 0.182079 | 0.182008 | -0.068542 | negative | 1.77% | yes
16 | 6.446241 | 6.203683 | 0.109271 | 0.219883 | 0.219883 | 0.219815 | -0.086596 | negative | 1.33% | yes
```

## Engine 2 microsecond cap

```
Engine 2 microsecond cap: nSteps=8700 meanDt=1.839e-6 s minDt=2.656e-7 s maxDt=2.000e-6 s
t_ms | pressure work (J) | strain (J) | kinetic (J) | damping logged (J) | 160 × ∫KE (J) | force-work damping (J) | gap (J) | sign | rel | close 3%
0 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | -0.000000 | negative | 0.02% | yes
2 | 0.221749 | 0.085046 | 0.124028 | 0.012681 | 0.012681 | 0.012661 | -0.000007 | negative | 0.00% | yes
4 | 0.251132 | 0.150655 | 0.064286 | 0.036539 | 0.036539 | 0.036529 | -0.000349 | negative | 0.14% | yes
6 | 0.592095 | 0.441954 | 0.089065 | 0.068223 | 0.068223 | 0.068209 | -0.007147 | negative | 1.19% | yes
8 | 0.948608 | 0.773427 | 0.088749 | 0.096024 | 0.096024 | 0.096010 | -0.009592 | negative | 1.00% | yes
10 | 1.535490 | 1.352708 | 0.071929 | 0.121928 | 0.121928 | 0.121917 | -0.011074 | negative | 0.72% | yes
12 | 2.444632 | 2.240621 | 0.070214 | 0.146086 | 0.146086 | 0.146075 | -0.012289 | negative | 0.50% | yes
14 | 3.781791 | 3.530071 | 0.099634 | 0.172774 | 0.172774 | 0.172759 | -0.020688 | negative | 0.54% | yes
16 | 6.391291 | 6.127969 | 0.094130 | 0.204980 | 0.204980 | 0.204965 | -0.035788 | negative | 0.56% | yes
```

## Damping cross-check

CFL: logged vs 160 × ∫KE worst relative 0.00% → pass
2 microsecond: logged vs 160 × ∫KE worst relative 0.00% → pass

## Node positions

golden A-inflate VTK files: 0 (path radioss/A-inflate/run, gitignored)
oriented-ismstr2 VTK files: 0
triangle /SH3N VTK files: 0
Ishell 24 VTK files: 0
fine re-oriented VTK files: 0
GitHub Actions artifacts on pull requests 18–22 are web-mbd-preview (the built web app) only; no animation or node-position files.

Animation frames do **not** exist in this checkout, in gitignored `radioss/**/run/` trees, or in GitHub Actions artifacts of pull requests 18–22. Re-running the decks with node output would need: the OpenCourant linux64 package (starter, engine, anim_to_vtk; no licence — it is an open package), the committed starter/engine decks under `radioss/A-inflate` and `radioss/diag-element-type/*`, `scripts/run-element-type.sh` (about 5 minutes per deck, 10 minutes for the fine mesh, 4 OpenMP threads), and ANIM→VTK conversion. VTK files are gitignored and were never uploaded as CI artifacts. Do not run that without being told.

## Chiron/Themis rows (per-step bookkeeping as the gate)

The 2 ms-sample table in `stretch-diagnostics-results.md` is a sampling
artifact. These rows now run.

Golden and other decks have no animation frames, so strain energy from
the toy function on deck node positions is not computed.
energy-comparable=false, energy-agrees=false, energy-low=false.

Median strain (committed stretch-measure field stats vs this solve):
8 ms toy 0.083258 vs golden 0.105452 (21.05%); 16 ms toy 0.225913 vs
golden 0.248304 (9.02%). median-agrees=false (5% bar not met; not widened).

Time shift (diagnostic only; never applied): volume 0.510 ms, median
stretch 1.880 ms, maximum stretch 3.460 ms. one-shift-fits=false.

## Verdict

kind=sampling-was-the-gap
stepSizesAgree=true applyChironThemisRows=true
CFL miss at 2–8 ms: none
2 microsecond miss at 2–8 ms: none
The earlier 2 ms-sample gap was sampling. Only the summation in the test and page changes.
NO-ROW: no printed verdict row matches. Report the four booleans and every underlying number. energy-agrees=false energy-low=false one-shift-fits=false median-agrees=false energy-comparable=false
