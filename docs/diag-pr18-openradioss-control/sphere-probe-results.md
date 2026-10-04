# Sphere snap-through and 28 kPa hold

PASS on the slower-ramp snap bar and the 28 kPa stretch bar, including the 2 μs repeats. Default was not changed.

Part 1 stays as recorded: rising branch PASS (0.9%), limit-point stretch MISS (4.7%). Those files were not edited.

The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.

## Closed form (**computed** before the run, restated)

- λ(28 kPa) = **1.18757**. Chiron ~1.19 was not copied.
- p(1.318)/p_max = **99.07%**. p(1.340)/p_max = **99.62%**. Agree with 99.0% and 99.6%.
- Damping: kill off, Rayleigh **80 per second**. **read from docs.**
- Snap event: prescribed pressure when equivalent stretch first crosses **1.60**.

## 1. Snap-through pressure

- Faster ramp (400 ms): **32.52 kPa** at t=361.28 ms. **computed.**
- Slower ramp (800 ms): **32.38 kPa** at t=719.65 ms. **computed.**
- Slower vs 32.02 kPa: **1.1%** (bar 5%, slower ramp only). **PASS.**
- Direction: fell toward 32 kPa as the ramp slowed (32.52 → 32.38 kPa). Matches Chiron’s expected direction.

## 2. Settled stretch at 28 kPa

- Settled equivalent stretch **1.18558** at t=400.0 ms, p=28.00 kPa, ke/internal=3.79e-6. **computed.**
- Closed-form stable stretch **1.18757**. Rel err **0.2%** (bar 2%). **PASS.**

## 5. 2 μs cap repeats

- Faster snap: **32.52 kPa**.
- Slower snap vs 32.02 kPa: **1.1%**. **PASS.**
- 28 kPa settled stretch **1.18557**, rel err **0.2%**. **PASS.**

Charts and CSVs: `sphere-probe-*.svg` / `sphere-probe-*.csv`.

Do not make kill-off the default. Do not write the every-frame test.

