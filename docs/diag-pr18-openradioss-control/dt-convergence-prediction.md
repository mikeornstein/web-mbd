# Prediction: kill-off at the listing 2 microsecond step

Written **before** any new time-step run. Convergence check only. Not a
fit. Not a damping variant. Default stays the 0.18 peak kill.

The 11.9 /s measurement did **not** move frames toward the golden, so
there are no more damping knobs. This fork asks a different question:
does the toy’s **time step** (about 8 microseconds today) change the
0–16 ms curve relative to the engine listing’s **2 microseconds**?

The cap is the copied listing Δt **1.971×10⁻⁶ s** at engine cycle 200
(`adyrel-period-description.md` table). **copied**, not fitted.

## Setup

- Damping: **off** (no 0.18 kill, no continuous relaxation).
- Time step: `min(current CFL step, 1.971×10⁻⁶ s)`.
- Same oriented mesh, same shear modulus, same 0–65 kPa / 40 ms load.
- Print the same 0–16 ms table next to the already-committed kill-off
  run at the current step.

## Direction (own numbers, before the run)

If the toy is **step-independent**, the new column matches current
kill-off inside the existing 2% stretch / 5% volume bands (those bands
are not widened; they are only a comparison tool here). **guess:**

| t (ms) | current kill-off stretch / mL (**computed** earlier) | capped-Δt stretch / mL (**guess**) | golden stretch / mL (**computed** earlier) |
| ---: | --- | --- | --- |
| 2 | 1.118 / 520.0 | **1.118 / 520** | 1.709 / 526.3 |
| 8 | 1.408 / 602.0 | **1.41 / 602** | 1.558 / 623.1 |
| 16 | 2.105 / 866.1 | **2.10 / 866** | 2.128 / 891.7 |

**guess:** the 2 ms gap 1.12 vs 1.71 is **not** a 8 μs vs 2 μs artifact.
Kill on and kill off already agree at 2 ms with the larger step, so
cutting the step should not jump stretch to 1.71.

If the 16 ms stretch moves by more than 2% from 2.105, or 2 ms stretch
moves toward 1.71, say **step-dependent error** and stop. If the frames
stay put, the toy is step-independent at this listing Δt and step size
is cleared. Then stop. Do not go on.

Pressure stays the prescribed ramp (**read from file**).
