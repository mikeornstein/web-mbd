# Prediction: slow-load sphere check, then maybe kill-off default

Written **before** any new solver run. Not a physics pass until Part 1
lands on the closed-form curve. Default stays the 0.18 peak kill until
Part 2 (and Part 2 runs only if Part 1 passes). Bands, shear modulus,
Letter A load, mesh, golden, and Pages stay unchanged.

Stop at the first failure. Do not go on.

---

## What “peak” means in the existing sphere report (Themis)

The numbers **23.51 kPa at 14.47 ms** (kill on) and **12.35 kPa at
7.60 ms** (kill off) are **not** a maximised quantity.

**read from the code** (`sphereCrossing` in `src/oracle/adyrelMeasurement.ts`,
printed by `src/cli/diagnose-adyrel-measurement.ts` and saved in
`adyrel-measurement-results.md`): they are the **prescribed ramp
pressure at the interpolated time when the letter’s max stretch first
crosses 1.383**. Stretch is crossing a target, not peaking. Pressure is
the 0→65 kPa / 40 ms load evaluated at that instant (`p = 65 kPa × t /
0.04 s`), linearly interpolated between history samples. Nothing in that
function maximises pressure, stretch, or speed.

So it is **not**:

- pressure at the time of maximum stretch over the run
- maximum pressure over the run
- pressure at the time of maximum speed

It is **something else**: pressure-on-the-ramp at first crossing of
stretch 1.383. The measurement file already said the toy pressure is the
prescribed ramp, so the crossing need not carry 32 kPa. **read from the
description** of that report.

Check: kill-off 7.60 ms × 65 kPa / 40 ms = 12.35 kPa. Kill-on 14.47 ms ×
65 kPa / 40 ms = 23.51 kPa. **computed** from the ramp formula. That
matches the printed pressures, which confirms they are ramp values, not
a static limit-point.

**Chiron:** a film with inertia reaches a given stretch at a **higher**
pressure than the static curve says. The static limit is about **32 kPa
at stretch 1.383** (**read from docs**). A dynamic crossing at **12.35
kPa** is *below* that limit, so it **cannot** be the 32 kPa limit-point
event. It is the letter’s **local** max stretch hitting 1.383 while the
film is still a letter, not a uniform sphere (kill-off volume then is
596 mL, not the spherical 420.5 mL × 1.383³ ≈ 1112 mL). **computed**
from the committed tapes and the sphere volume scale. Part 1 below is
the check that actually asks for the static curve.

---

## Part 1 — slow sphere vs closed form (this run)

### Sphere used

Same oriented equivalent sphere as the 32 kPa closed form (**read from
docs**, `sphere-peak-pressure.json` / item 4):

| | value | mark |
| --- | --- | --- |
| Wall thickness H₀ | 0.381 mm (0.015 × 0.0254 m) | **read from docs** |
| Rest radius R₀ | 46.48 mm | **read from docs** (equivalent sphere of oriented rest volume 420.5 mL) |
| Shear modulus μ | (800 × 6894.757) / 1.75 Pa | **read from docs** |
| Density ρ | 1130 kg/m³ | **read from docs** |
| Formula | p(λ) = 2 μ (H₀/R₀) (λ⁻¹ − λ⁻⁷) | **read from docs** |
| Limit stretch λ\* | 7^{1/6} ≈ 1.383 | **read from docs** |
| Closed-form p(λ\*) | **32.02 kPa** | **computed** from that formula and R₀, H₀; same as the documented ~32 kPa to the reported digits. Not a different limit. |

Letter A is not this sphere. Part 1 meshes an actual thin sphere with
that R₀ and H₀.

### Oscillation period and ramp (**computed** before the run)

Toy membrane wave speed c = √(E/ρ) with E = 2μ(1+ν), ν = 0.495, same
formula the solver uses for the CFL step. **computed:** c ≈ 91.3 m/s.

- Circuit time 2π R₀ / c ≈ **3.20 ms**. **computed.**
- Longer breathing-style time 2π R₀ √(ρ/μ) ≈ **5.53 ms**. **computed.**

Ramp must be at least ten times the period. Ten times the longer time is
**55.3 ms**. **computed.** Chosen ramp: **400 ms**, 0 → 32.02 kPa
(the closed-form limit, not 65 kPa). That is about 72 times the longer
period. **guess** that this is slow enough to sit on the static curve;
400 ms is also the slow-load family duration already named in the repo
(**read from docs** as a time scale that exists, not as a change to
Letter A’s 40 ms card).

### Damping (slow-load device only)

- Velocity kill: **off**. No 0.18 peak kill. No continuous relaxation.
- Rayleigh mass damping on this sphere model only: α = 2 × (2π / 5.53 ms)
  ≈ **2270 per second**. **computed** as about critical on the longer
  period. Shipped Letter A stays at 80 per second.
- This α is the slow-load device, not a stiffness or band change.

### What success looks like (**guess**, before the run)

Print pressure against stretch for the whole run, closed-form p(λ) laid
over it (chart plus CSV). Not a single peak number.

- Rising branch: the run follows p(λ) = 2μ(H₀/R₀)(λ⁻¹ − λ⁻⁷).
- It tops out near **32.02 kPa** and **stretch 1.383**.
- Closeness yardstick (not a widened band): stretch within **2%** of
  1.383 and pressure within **5%** of 32.02 kPa at the top. Those
  percents are the existing compare bars used as a comparison tool
  (**read from docs**), not a retune.
- Inertia should put the dynamic curve **slightly above** the static
  p(λ) (higher pressure at a given stretch). **read from Chiron.** If
  the slow run is slow enough, that offset should be small.

Then **one** repeat with time-step cap 1.971×10⁻⁶ s (**copied** from the
listing). **guess:** same curve (step size was cleared on kill-off
Letter A). If the capped run leaves the curve and the uncapped run does
not, that is a step-size error on the sphere, reported as a fail.

### Fail and stop

If the slow run does **not** land on the curve, stop. That is a real
solver problem. Do not change the default. Do not go to Part 2.

---

## Part 2 — only if Part 1 passes (**guess**)

Make kill-off the shipped default. Justify by the measurement (engine-rate
relaxation did not close the golden gap, step size is cleared, 0.18 kill
is not a Radioss mechanism), not by a fit. Then run Letter A to the
stretch-2 freeze, Letter B labeled unstable, Letter C hidden. **guess:**
oriented Letter A with kill-off does not punch through before the stretch-2
freeze (the 20 ms blow-up was the unoriented mesh). If it blows up, report
the time and stop.

---

## Part 3 — only if Part 2 shows no blow-up (**guess**)

Every-frame 0–16 ms test on the new default vs the golden and the
surviving decks. Themis’s bar (toy stretch inside the deck min–max
spread) gates the compare job. Volume and pressure stay inside 5%. The
job may honestly be red. Do not widen bands.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.
