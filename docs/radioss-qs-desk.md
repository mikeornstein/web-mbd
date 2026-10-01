# OpenRadioss slow-load (quasi-static-ish) desk tape — **reference only**

**Not used by any gate.** `gate: none` on
`src/oracle/inflate-a-radioss-qs-golden.json`.

This file records an offline OpenRadioss animation freeze. The matching toy
assemble (one-Gauss-point four-node membrane, hourglass, mean-plane pressure,
one-ring node-to-segment contact) was **removed, not fixed**.

Last measured at head `8a05992`: the toy was off **7.7% stretch**, **8.8%
pressure**, **65% volume**, and the balloon folded.

The Inflation ABC ~54 kPa figure is **not claimed**.

Source: inflation-abc pull request #11, desk `radioss/A-inflate-qs-ish`,
branch `cursor/openradioss-a-qs-ish-b1bc`. OpenRadioss AGPL stays offline —
JSON only.

Load family **`qs-ish-pload-400ms`**: `/PLOAD` 0 → 65 kPa in 0.40 s +
`/ADYREL`. Same LAW42 μ, ρ, H0, mesh fingerprint `d9c56487` as
`dynamic-pload-40ms`. **No μ/ρ retune.**

## Warn freeze (first stretch ≥ 2) — OpenRadioss only

| Qty | OpenRadioss slow-load golden |
| --- | --- |
| t | 0.170001 s (frame 34) |
| stretch λ_max | 2.327123518375924 |
| pressure | 27625.1625 Pa |
| volume | 752.6256176704242 mL |
| strain energy Ψ | 8.042896684001748 J (≥ 0) |
| punch | false |

There is no `pnpm compare:inflate:qs`. Continuous integration uses only
`pnpm compare:inflate` (fast-load / dynamic). Do not restore this tape to
continuous integration.

## What this is not

ABC ship warn ~54.1 kPa (`P_WARN_ABC`) is **not** a load-schedule result on
this film. 10× slower pressure ramp moved pressure at first stretch ≥ 2
**down** (36 → 28 kPa), away from 54 kPa. Reaching 54 kPa at first λ_max ≥ 2
would require a μ/kinematics change, which is forbidden.

Dead p = 54100 Pa **CFL-explodes** on Radioss (`forks/dead-pressure`). Do not
vendor that dump. Do not retune μ to chase ~54 kPa.
