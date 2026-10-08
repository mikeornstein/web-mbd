# Prediction: per-step energy bookkeeping (correctness gate on the toy)

Written **before** any per-step energy run. Do not change this file after
seeing numbers. Do not tune stiffness, load, mesh, damping, or defaults.
Do not widen any bar. Do not apply a time shift. This pull request stays
a draft. Do not touch the Pages workflow.

The 2 ms-sample bookkeeping already failed at 2, 4, 6 and 8 ms (29.62%,
30.00%, 8.79%, 5.46%). This file locks how that check is redone by
summing at every solver step.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.

Chiron/Themis energy, median, and shift rows stay as already committed
in `stretch-diagnostics-prediction.md`. The 3% bar is not widened. The
5% energy and median bars are not widened. Compare:inflate is not this
job.

## Locked rules

The per-step bookkeeping is a correctness gate on the toy. It does not
turn a red compare:inflate into a green mark.

0. Sum at every solver step, not between 2 ms animation frames.
   Pressure work: at each solver step add ½ (p at the end of the step +
   p at the start of the step) × (volume at the end − volume at the
   start). Pressure at the start is the pressure used to assemble that
   step. Volume at the end includes contact projection on that step.
   Strain energy is (shear modulus / 2) × rest thickness × sum over
   triangles of (first invariant − 3) × rest area, from node positions
   with the toy’s own function. Kinetic energy is ½ m |v|² at that
   frame. Logged damping loss is the trapezoid of twice the Rayleigh
   mass rate times kinetic energy, summed at every solver step. The
   Rayleigh force −α m v removes power α m |v|² = 2 α KE. Rayleigh mass
   rate α = 80 per second. This is not the remainder identity.

1. Two step sizes. Run the shipped kill-off Letter A toy with no
   time-step cap (about 8 microseconds) AND with dtMax = 0.000002 s
   (the engine’s 2 microsecond step). Do not change CFL, damping, mesh,
   stiffness, or load. The two must agree: for each of 2, 4, 6 and 8
   ms, both close under 3% or both miss. If they disagree, STOP and
   report that the energy numbers are not trustworthy.

2. Signed gap per frame: gap = pressure work − (strain + kinetic +
   damping). Report sign and size. Positive (pressure work larger):
   energy is leaving uncounted (for example velocity clamping, unlogged
   damping, dissipation). Negative (pressure work smaller): energy
   appears from nowhere (for example first ramp steps, tension-field
   clamp, contact).

3. Damping cross-check: logged damping loss must equal 160 × the time
   integral of kinetic energy (trapezoid at every solver step) within
   1%. If it fails, the damping bookkeeping is wrong; STOP. Report an
   independent Rayleigh force-work sum (α m |v|² Δt using the velocity
   the force saw at assemble) next to that check. The 1% rule is logged
   versus 160 × the kinetic-energy integral, not the force-work column.

4. Close bar (unchanged, not widened): |gap| / max(|pressure work|,
   |strain + kinetic + damping|, 10⁻¹²) ≤ 3% at a frame.

5. If the per-step sum closes under 3% at every reported frame at both
   step sizes: the earlier 2 ms-sample gap was sampling. Only the
   summation in the test and page changes. Then apply the already-
   committed Chiron/Themis decision rows (energy agrees / median /
   shift) with this per-step bookkeeping as the gate. Do not apply a
   time shift. Do not widen any bar.

6. If the per-step sum stays above 3% at 2, 4, 6 or 8 ms at BOTH step
   sizes: it is a toy defect. Read the code and find it (candidates:
   the damping term, anything that clamps or zeroes velocity, the
   handling of the first ramp steps, tension-field clamp, contact).
   Report the defect with file and line. Propose the smallest fix but
   do not apply it. Early frames are not graded until it is fixed. Do
   not report energy-agrees / median / shift verdicts.

7. If the damping cross-check fails at either step size: STOP, the
   damping bookkeeping is wrong. Do not report energy verdicts.

8. Main evidence frames for the table are 0, 2, 4, 6, 8 and 16 ms.
   Interpolated 10, 12, 14 ms are reported but decide nothing for the
   Chiron/Themis rows. The 3% close at 2–8 ms is the defect criterion.
   “Every reported frame” in rule 5 means 0, 2, 4, 6, 8 and 16 ms.

9. Node positions for Radioss decks: search the repository, run
   directories, and artifacts of pull requests 18 to 22 first. If
   animation frames are missing, say so and do not invent strain
   energy. Do not re-run Radioss without being told.

If bookkeeping fails (rules 1, 6, or 7): STOP, no Chiron/Themis
verdicts. Otherwise collect every matching verdict row in the printed
order from the already-committed table:

- Energy agrees and median agrees: the low maximum stretch is a
  convention or hot-spot effect in how the decks report it; the toy's
  physics is not at fault.
- Energy low by more than 5% and one shift fits: the toy is a dynamic
  lag (split of work between motion and damping); toy physics; look at
  kinetic and damping numbers next.
- Energy low and shifts disagree: the toy spreads strain differently
  from the decks; toy physics, not timing.
- Energy agrees but shifts disagree: MIXED, no verdict, report as mixed.

This file is not changed after the run. Results go in
`stretch-per-step-energy-results.md`.
