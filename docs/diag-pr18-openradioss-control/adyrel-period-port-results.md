# Period-port rate print (stop)

Prediction file was committed first at `e53d5cac37afea2bb4f5ebec1b42d70bec040fc0`,
then the option was implemented. Default toy is still the 0.18 peak kill.
Shear modulus, load law, bands, the golden, and Pages were not touched.

## Port that was applied

**Per-second, real-time onset** (physically faithful). Reason: a
per-step 10⁻⁴ mix damps differently when the time step changes;
relaxation is a process in time. 200 engine steps on this deck is
**2.79 ms of real time**, copied from the golden listing, not 200 toy
steps.

The period is the longest time internal energy has been rising, or the
longest time kinetic energy has been rising. Clocks and those two max
periods update every step. The rate changes only at first-on, an energy
peak, or the 1.1 cutback. **read from description.**

## Both versions' rates, next to Rayleigh 80 /s and the listing 51 /s

| clock | step | physical time | Δt | rate (per second) | ω per step | source |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Engine listing (copied) | 200 | **2.79 ms** | 1.971×10⁻⁶ s | **50.7 /s** (~51 /s in the description table) | 1.000×10⁻⁴ | **copied** from the golden listing via the description. Not a toy number. |
| Per-step version (print only) | 200 | **1.650 ms** | 8.326×10⁻⁶ s | **12.01 /s** | 1.000×10⁻⁴ | **computed** from this toy run. 200 toy steps. |
| Per-second port, applied first-on | 245 | **2.028 ms** | 8.429×10⁻⁶ s | **11.86 /s** | 1.000×10⁻⁴ | **computed**. A peak fired the first-on branch before the copied 2.79 ms wait. |
| Per-second clock (first toy step with t ≥ 2.79 ms) | 346 | **2.790 ms** | 5.731×10⁻⁶ s | **17.45 /s** | 1.000×10⁻⁴ | **computed**. Toy Δt at the copied listing time, if first-on had waited. |
| Rayleigh mass | — | whole run | — | **80 /s** | — | **read from docs** and the deck `/DAMP` card. Already in the toy. |

ω per step at first-on is 10⁻⁴ in every row that uses the formula
rate = 10⁻⁴ / Δt. That is the per-step mix. The **per-second** rate is
what changes with Δt.

## Stop

The two versions differ from each other and from the description table
(~51 /s from ~2.8 ms) because the toy's time step is larger than the
engine's at first-on (about 8 μs vs 2 μs). Applied first-on is **11.86
per second at 2.03 ms**, not 51 per second at 2.79 ms. Even at the
copied 2.79 ms clock, 10⁻⁴ / Δt_toy is **17.45 per second**, not 51.

**Not rescaled.** Sphere check not run. Continuous relaxation is **not**
the shipped default. The 0–16 ms every-frame gate was **not** added.

Live samples of the chosen port (rate stays 11.86 /s after first-on;
period source after the run is kinetic-energy rising time):

| t (ms) | step | Δt (s) | rate /s | ω / step | vs Rayleigh 80 /s | vs listing 51 /s |
| ---: | ---: | --- | ---: | --- | ---: | ---: |
| 0 | 0 | 8.51×10⁻⁶ | 0 | 0 | 0 | 0 |
| 2.00 | 242 | 8.42×10⁻⁶ | 0 | 0 | 0 | 0 |
| 4.00 | 963 | 1.33×10⁻⁶ | 11.86 | 1.55×10⁻⁵ | 0.15 × | 0.23 × |
| 8.00 | 2273 | 3.82×10⁻⁶ | 11.86 | 4.56×10⁻⁵ | 0.15 × | 0.23 × |
| 16.00 | 4783 | 2.29×10⁻⁶ | 11.86 | 2.75×10⁻⁵ | 0.15 × | 0.23 × |

## What this does not decide

Matching the listing 51 /s would mean using the engine's Δt, or
copying 51 as a number. That is rescaling to the engine step size.
The agreed rule is to stop and report.

The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree. That sentence belongs on the every-frame test that was not added.
