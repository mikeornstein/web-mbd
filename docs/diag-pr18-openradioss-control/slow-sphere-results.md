# Slow-load sphere vs closed-form curve

FAIL. Rising-branch |p − p_closed|/p_closed = 0.9% (yardstick 5%). Ramp-end stretch vs 1.383 = 4.7% (yardstick 2%). Stop. Default was not changed.

The golden's engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the OpenCourant copy, not the original OpenRadioss tree.

## Sphere (same one as the 32 kPa number)

- Wall thickness H₀ = **0.381 mm**. **read from docs.**
- Rest radius R₀ = **46.48 mm**. **computed** from oriented Letter A rest volume 420.5 mL.
- Closed-form p(λ\*) = **32.02 kPa** at stretch **1.383**. **computed.** Same as the documented ~32 kPa to the reported digits.

## Slow-load device

- Circuit period 2π R₀ / c = **3.20 ms**. **computed.**
- Breathing-style period 2π R₀ √(ρ/μ) = **5.53 ms**. **computed.**
- Ramp **400 ms** (72× the longer period), 0 → 32.02 kPa. **guess** in the prediction; used as stated.
- Velocity kill **off**. Rayleigh mass α = **2273 per second** on this sphere model only. **computed** as about critical on the longer period. Shipped Letter A stays 80 /s.

## Result

- Last equivalent stretch **1.3397**, max-element stretch **1.3402**, last pressure **32.02 kPa**, volume **1002.6 mL**. **computed.**
- At ramp end (400 ms): equivalent stretch **1.3179**, pressure **32.02 kPa**. **computed.**
- Rising-branch max |p − p_closed|/p_closed = **0.9%** (signed 0.9%, inertia sits above the static curve when positive) at stretch 1.318. **computed.**
- Ramp-end stretch vs 1.383: **4.7%**. Ramp-end pressure vs 32.02 kPa: **0.0%**. **computed.**
- Stretch still rose from 1.3179 at 400 ms to 1.3397 at 0.420 s. **computed.**
- Punched through: **false**. Steps 12132.
- Chart: `slow-sphere-p-vs-lambda.svg`. CSV: `slow-sphere-p-vs-lambda.csv`.
- 2 μs spot check: **not run** (slow run failed).

Stop. Do not go on to Part 2.

