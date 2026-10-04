# Prediction: period-based continuous relaxation in the toy

Written **before** any new toy code or any new toy run of a continuous-relaxation
option. Diagnosis only. Stiffness, load law, bands (2% stretch / 5% volume /
5% pressure), the golden, and the Pages workflow stay unchanged.

This file states the port **first**, then the numbers I expect, and what
would stop the work. It is not a fit to a curve.

## Port, stated before anything runs

**This work uses the per-second port with a real-time onset.**

There are two honest readings of the same description:

1. **Per-step.** Copy the first-on wait as **200 toy steps**, and copy the
   first-on mixing as **10⁻⁴ per step** (ω = 10⁻⁴ each step). The
   matching per-second rate is then 10⁻⁴ / (the toy’s own time step).
2. **Per-second.** Match the **physical** rate and the **physical** onset
   time. On the golden listing, 200 **engine** steps is about **2.8 ms of
   real time**, not 200 toy steps. The first-on rate on that listing is
   about **51 per second**.

A per-step rule damps differently when the time step changes: the same
10⁻⁴ per step is a weaker (or stronger) damper per second if the toy’s
step is larger (or smaller) than the engine’s. Relaxation is a process
in **time**, not in step count. The physically faithful port is therefore
**per-second, with a real-time onset**. That choice is made because of
that reason. It is **not** the reading that makes the 0–16 ms stretch
curve look better.

Both versions will still be **printed** (rates in per second, next to
Rayleigh 80 per second and the engine table). If they differ, the already
agreed rule is: print both, **stop**, and report. Do not rescale a
constant to make them match.

## Copied onset vs toy-computed onset (side by side)

The **2.8 ms** figure is **not** computed from the toy’s own state. It is
a **copied reference value from the engine’s real run on this deck**.

**read from description** (`adyrel-period-description.md`, table built
from the golden listing `radioss/A-inflate/run/Ainflate_0001.out`): at
cycle 200 the listing time is **2.79 ms**, Δt = 1.971×10⁻⁶ s, first-on
scale 10⁻⁴ / Δt = **51 per second**. That row is the engine’s own
print, every 200 cycles.

| quantity | value | whose clock | source |
| --- | ---: | --- | --- |
| Engine first-on time | **2.79 ms** | engine cycle 200 on this deck | **copied** from the golden listing, via the description. Not a toy number. Not a free parameter. |
| Per-step version onset | **1.65 ms** (200 toy steps × mean toy Δt) | 200 **toy** steps | **computed** from committed `toy-history.json`: 2917 steps to 24.0076 ms ⇒ mean Δt = 8.230 μs ⇒ 200 × 8.230 μs = **1.646 ms**. Live Δt at toy step 200 is not yet printed; this mean is the committed estimate. |
| Engine first-on rate | **51 /s** | engine Δt at 2.79 ms | **copied** from the description table (10⁻⁴ / 1.971×10⁻⁶ s). |
| Per-step version first-on rate | **12.2 /s** | toy mean Δt | **computed** from the same committed mean Δt: 10⁻⁴ / 8.230 μs = **12.15 /s**. |
| Rayleigh mass damping | **80 /s** | deck `/DAMP` | **read from docs** (`/DAMP` help) and **read from file** (starter card α = 80). Already in the toy. Unchanged. |

The two onset times (2.79 ms copied vs 1.65 ms from 200 toy steps) are
different. The two first-on rates (51 /s vs 12 /s) are different. That
difference is the point of printing both. **guess until a live print:**
the live toy Δt at 2.8 ms will stay on the order of several microseconds,
so the per-step 10⁻⁴ / Δt_toy will stay on the order of **ten per
second**, not fifty. If the live print confirms that, **stop**. Do not
replace 10⁻⁴ / Δt with a fitted number, and do not stretch 200 toy
steps to land on 2.8 ms.

## Constants that will be used (none fitted)

All from `adyrel-period-description.md` or the `/DYREL` / `/ADYREL` /
`/DAMP` help pages already quoted in `adyrel-dyrel-docs.md`.

| symbol | value | source |
| --- | ---: | --- |
| factor β | 1 | **read from docs** (`/DYREL` default). Description: a bare `/ADYREL` also uses 1. |
| first-on wait (engine) | 200 cycles | **read from description** |
| first-on wait (per-second port) | t ≥ 2.79 ms | **copied** listing time at those 200 engine cycles, not 200 toy steps |
| first-on wait (per-step print-only) | 200 toy steps | the other reading, printed, not the shipped port |
| rate cap (no AMS) | 0.01 / Δt | **read from description** |
| first-on rate formula | 10⁻⁴ / Δt | **read from description** (0.01 × cap) |
| internal-energy floor | 10⁻¹² | **read from description** (double precision) |
| kinetic / internal ignore | 0.001 | **read from description** |
| kinetic-peak 1.5 clamp | 1.5 | **read from description** |
| kinetic-peak half-floor | 1/2 | **read from description** |
| no-peak cutback | 1.1 × (1 / max rising time) | **read from description** |
| filter frequency | 0 (off) | **read from description** (bare card) |
| velocity update | V_{t+Δt} = (1−2ω) V_{t−Δt/2} + (1−ω) γ_t Δt, ω = β Δt / T = rate × Δt | **read from docs** (`/DYREL`). Description: the same update using the half-step increment. |
| Rayleigh α | 80 /s | **read from docs** and deck; already implemented |

Inputs each step, from the toy’s own state, as the description lists:
translational kinetic energy, internal energy, the time increment, and
the step count. Period T is the longest time so far that internal energy
has been rising, or that kinetic energy has been rising. Clocks and max
periods update every step. The rate changes only at an energy peak, at
first-on, or on the 1.1 cutback. After first-on the rate is not
increased, except the half-old-rate floor on a kinetic peak.

## What I expect the live print to show

Per sample the toy will print: step number, physical time, time step,
rate in per second, and ω per step, next to Rayleigh **80 /s** and the
description’s engine table.

| clock | onset | first-on rate (per second) | ω per step at first-on | vs Rayleigh 80 /s | vs engine 51 /s |
| --- | ---: | ---: | ---: | --- | --- |
| Engine listing (copied) | 2.79 ms | 51 /s | ~10⁻⁴ | same order | — |
| Per-second port (chosen) | 2.79 ms copied | 10⁻⁴ / Δt_toy at that time | 10⁻⁴ if the formula is applied to the toy Δt | weaker than 80 if ~12 /s | **expected different** |
| Per-step version (print only) | 1.65 ms (200 toy steps) | ~12 /s from mean Δt | 10⁻⁴ | weaker than 80 | **expected different** |

**guess (clearly marked):** from 2.8 ms to 16 ms the live rate stays near
its first-on value, because 1 / (rising time so far) only undercuts
first-on once the rise is longer than 1 / rate. For 51 /s that is about
20 ms of rise; for 12 /s it is about 83 ms. The 0–16 ms window is
shorter than 83 ms. This is the same order-of-magnitude guess as in the
description; it is **not** computed.

**Stop rule.** If the live per-second rate or the live onset time is
wildly off the description table (about 51 per second from about 2.8 ms)
because of the toy’s step size, **stop and report**. The two versions’
rates in per second are already expected to differ (~12 /s vs ~51 /s).
Confirm that with a print, then stop. Do not rescale.

## Sphere check (only if the rates are not a stop)

The analytic sphere peak is about **32 kPa at stretch 1.383**.
**read from description of the closed-form** (`NOTE.md` item 4,
`sphere-peak-pressure.json`): p(λ) = 2 μ (H₀/R₀) (λ⁻¹ − λ⁻⁷), limit
λ\* = 7^{1/6} ≈ 1.383, p_max ≈ 32.02 kPa on the oriented equivalent
radius. The **existing** sphere test (`tests/inflate-a-pr18-control.test.ts`
item 4) checks that closed form with `toBeCloseTo(32.0, 1)` kilopascals
and `toBeCloseTo(1.383, 3)` stretch. Those digits are the tolerance
already in the repo; they are not chosen here.

**Prediction:** kill on, kill off, and continuous relaxation must be
printed side by side on that same closed-form check. Relaxation must not
move the sphere peak outside that existing tolerance relative to the
closed form, and must not damage the result relative to kill on and kill
off (same existing digits). If it does, stop; do not make relaxation the
default.

## 0–16 ms frames (only if the rates are not a stop, and the sphere check holds)

Numbers below for the current toy and Radioss decks are **computed by a
previous run** (committed in `toy-history.json`, `kill-off-results.md`,
`element-type.md`, `oriented-ismstr2-metrics.json`). Not new results.

| t (ms) | toy kill on, stretch / mL | toy kill off, stretch / mL | golden, stretch / mL | Ishell 24, stretch | fine, stretch | p (kPa) |
| ---: | --- | --- | --- | ---: | ---: | ---: |
| 0 | 1.000 / 420.5 | 1.000 / 420.5 | 1.000 / 420.5 | 1.000 | 1.000 | 0 |
| 2 | 1.118 / 520.0 | 1.118 / 520.0 | 1.709 / 526.3 | 1.197 | 1.236 | 3.25 |
| 4 | 1.160 / 540.2 | 1.108 / 525.0 | 1.657 / 547.6 | 1.375 | 1.257 | 6.51 |
| 6 | 1.175 / 545.9 | 1.286 / 570.4 | 1.529 / 587.0 | (not in element-type table) | (not in element-type table) | 9.76 |
| 8 | 1.277 / 588.4 | 1.408 / 602.0 | 1.558 / 623.1 | 1.432 | 1.463 | 13.00 |
| 10 | 1.296 / 597.0 | 1.472 / 643.8 | 1.656 / 666.1 | (not in element-type table) | (not in element-type table) | 16.25 |
| 12 | 1.328 / 613.9 | 1.564 / 694.7 | 1.680 / 719.0 | (not in element-type table) | (not in element-type table) | 19.50 |
| 14 | 1.372 / 636.9 | 1.736 / 757.6 | 1.829 / 788.2 | (not in element-type table) | (not in element-type table) | 22.75 |
| 16 | 1.422 / 665.1 | 2.105 / 866.1 | 2.128 / 891.7 | 2.176 | 2.237 | 26.01 |

Pressure is the prescribed ramp on every tape. **computed by a previous
run.**

If the per-second port were a milder damper than the 0.18 peak kill, of
the same order as the Radioss decks’ own relaxation (tens per second
next to Rayleigh 80 per second), then:

1. **2 ms.** Toy max stretch stays near **1.12**, same as kill on and
   kill off. It does **not** move toward golden 1.71. Volume ~520 mL.
   Pressure ~3.25 kPa.
2. **8 ms and 16 ms.** Stretch and volume sit nearer **kill off** (1.41
   / 602 mL at 8 ms, 2.11 / 866 mL at 16 ms) and the surviving four-node
   Radioss decks than **kill on** (1.28 / 588 mL, 1.42 / 665 mL).
3. Themis’s bar (toy max stretch inside the min–max of golden quad,
   Ishell 24, and fine re-oriented; triangle shells are **not** a
   late-window reference) is **not** predicted to go green at 2 ms:
   1.12 is below the 2 ms spread 1.197–1.709. **computed** from the
   committed element-type table. The old bar (max stretch within 2% of
   the golden maximum) is also not predicted to go green at 2 ms.

**guess:** because kill on and kill off have not diverged at 2 ms, a
continuous damper that is milder than the 0.18 peak kill should also be
invisible at 2 ms.

This 0–16 ms claim is **not tested** if the rate print already forces a
stop.

## What result would refute the port (or stop it)

Any one of these stops the default change. None of them is a license to
fit a number.

- Live per-step rate in per second **differs** from live per-second-port
  rate, or either differs from the description table (~51 /s from
  ~2.8 ms), because of the toy’s step size. Print both. Stop.
- At 2 ms, max stretch moves toward golden 1.71 (for example ≥ 1.4).
- At 2 ms, stretch, volume, or pressure leaves the band that kill on and
  kill off already share with the triangle deck (~1.12, ~520 mL,
  ~3.25 kPa).
- At 8 ms or 16 ms, stretch stays as lagged as kill on (within 2% of
  1.277 at 8 ms, or within 2% of 1.422 at 16 ms).
- The sphere peak leaves the existing closed-form digits (32.0 kPa at
  one decimal, stretch 1.383 at three decimals).

No scale, period, or factor will be fitted afterward.

## Runs that will be made only after this file is committed

1. Implement continuous relaxation as an **option**. Peak-kill 0.18 stays
   available. Default stays peak-kill until a later step that is allowed
   to change it.
2. Print both ports’ rates in per second, with step, time, Δt, and ω per
   step, next to Rayleigh 80 /s and the engine table. State that the
   period is the longest energy-rising time, updated every step, with
   the rate changing only at peaks, first-on, or the 1.1 cutback.
3. If that print is a stop, **stop**. Sphere check and default change
   wait.
4. If not a stop: sphere check with kill on, kill off, and relaxation
   on, side by side, using the existing closed-form tolerance. Only then
   consider making relaxation the shipped default, with an every-frame
   0–16 ms test whose header states that the golden’s engine commit
   `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba` is pinned only to the
   OpenCourant copy, not the original OpenRadioss tree.
