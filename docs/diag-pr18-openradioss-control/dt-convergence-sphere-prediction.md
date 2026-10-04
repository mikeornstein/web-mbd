# Prediction: sphere check at the listing 2 microsecond step

Written **before** any new sphere print on the capped-Δt tape. Completes
the one convergence check. Not a fit. Not a damping variant. Default
stays the 0.18 peak kill.

The 0–16 ms film frames at listing 2 microseconds already stayed next to
the current kill-off step. This addendum asks the sphere question on
that **same** capped run, so a mismatch shows up as a **step-size
error** before anyone reads the film frames.

The analytic closed form is about **32 kPa at stretch 1.383** (**read
from docs**; λ\* = 7^{1/6}, p(λ) = 2μ(H₀/R₀)(λ⁻¹ − λ⁻⁷)). Letter A is
not a sphere. Toy pressure is the prescribed ramp (**read from file**),
so the crossing time need not carry 32 kPa.

## Already on disk (not re-run for this prediction)

Current-step kill-off sphere, **computed** by the 11.9 /s measurement:

- stretch 1.383 at **7.60 ms**, pressure **12.35 kPa**, volume 595.6 mL

Kill-on at the current step (for contrast, **computed** earlier): 14.47 ms,
23.51 kPa. That is the 0.18 kill, not a time-step effect.

## Own numbers (guess, before the print)

If the toy is **step-independent**, the 2 microsecond cap crosses 1.383
next to the current kill-off, not next to 32 kPa and not next to kill-on.

| column | t (ms) | pressure (kPa) | volume (mL) |
| --- | ---: | ---: | ---: |
| current kill-off (**computed** earlier) | 7.60 | 12.35 | 595.6 |
| kill off, 2 μs cap (**guess**) | **7.6** | **12.4** | **596** |
| analytic sphere (**read from docs**) | — | **32** | — |

**guess:** about 7.6 ms and 12 kPa. A jump toward 32 kPa, or toward
kill-on’s 14.5 ms / 23.5 kPa, would be a **step-dependent error** on
the sphere check, reported before the film table.

If the capped crossing stays next to 7.60 ms / 12.35 kPa, the sphere
agrees with the film: step size is cleared. Then stop. Do not go on.
