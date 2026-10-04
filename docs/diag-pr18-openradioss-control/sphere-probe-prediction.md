# Prediction: sphere snap-through pressure and 28 kPa settled stretch

Written **before** any new solver run. Part 1 stays as recorded: rising
branch PASS (0.9%), limit-point stretch MISS (4.7%, known cause not yet
shown). Those earlier result files are not edited.

This is still not a change of the shipped default. Velocity kill stays
off on this sphere only. Letter A load, mesh, golden, bands, stiffness,
and Pages stay unchanged. Do not merge.

Stop after this probe. Do not make kill-off the default. Do not write
the every-frame test. Those wait for the room’s ruling.

Every claim below is marked **read from docs**, **read from the
description**, **computed**, or **guess**.

---

## Closed form, solved independently

Same sphere as the 32 kPa number. Formula **read from docs**:

p(λ) = 2 μ (H₀ / R₀) (λ⁻¹ − λ⁻⁷)

| | value | mark |
| --- | --- | --- |
| Wall H₀ | 0.381 mm = 0.015 × 0.0254 m | **read from docs** |
| Rest radius R₀ | 46.48 mm | **read from docs** |
| Shear modulus μ | (800 × 6894.757) / 1.75 Pa | **read from docs** |
| Limit stretch λ\* | 7^{1/6} = 1.38308755… | **read from docs** / **computed** |
| Closed-form p(λ\*) | **32.023 kPa** | **computed** from that formula and R₀, H₀. The documented 32.02 kPa is this number to the reported digits. I do not use a different limit. |

28 kPa / 32.023 kPa = **87.44%** of the limit. **computed.** Matches the
stated 87.4% to the reported digits.

### (a) Stable-branch stretch at 28 kPa

Solve p(λ) = 28 kPa for λ in (1, λ\*). Unique on the rising branch
because p increases from 0 to p(λ\*) there. Bisection. **computed:**

**λ(28 kPa) = 1.18757**

Chiron’s hand estimate is about 1.19. That number was not copied. The
exact root is 1.18757, which is 1.19 to two decimal places. I do not
disagree with the hand estimate; I am not using 1.19 as the bar.

Using the oriented-volume radius 46.477 mm instead of 46.48 mm moves the
root by less than 0.00003. **computed.** The run will invert with the
mesh’s own R₀; the bar is 2% around this 1.18757.

### (b) Closed-form pressure at stretch 1.318 and 1.340

These percents do not depend on R₀: p(λ)/p(λ\*) = (λ⁻¹ − λ⁻⁷) /
(λ\*⁻¹ − λ\*⁻⁷). **computed.**

| stretch | p(λ) | p(λ) / 32.023 kPa | mark |
| --- | --- | --- | --- |
| 1.318 | 31.726 kPa | **99.07%** | **computed** |
| 1.340 | 31.901 kPa | **99.62%** | **computed** |

Chiron’s hand numbers are 99.0% and 99.6%. I **agree**. They are those
percents rounded to 0.1. I do not disagree.

That is the known cause of the Part 1 top-stretch miss, not yet shown
on a new run: 1.318 and 1.340 are already 99% of the limit pressure, so
a 400 ms ramp that only *reaches* 32.02 kPa, with heavy damping, can sit
short of λ\* while still tracking the curve. **computed** from (b) and
the committed Part 1 tape. This probe does **not** hold at 32.02 kPa.

---

## Bars (written down before the run)

Themis: the 5% snap-through bar applies to the **slower** of the two
ramp rates only. **read from the description.** The faster rate is only
there to show direction.

| test | bar | mark |
| --- | --- | --- |
| Snap-through pressure, **slower** ramp | within **5%** of 32.02 kPa, i.e. 30.42–33.62 kPa | **read from the description** (existing 5% pressure compare bar, applied here as stated) |
| Snap-through pressure, **faster** ramp | no 5% bar; report the number and the direction vs the slower ramp | **read from the description** |
| Direction | snap pressure **falls toward 32 kPa from above** as the ramp slows | **read from the description** (Chiron: the film lags) |
| Settled stretch at 28 kPa | within **2%** of 1.18757, i.e. 1.1638–1.2113 | **read from the description** (existing 2% stretch compare bar) |
| 2 μs cap repeats | same bars on the slower snap and on the 28 kPa hold | **read from the description** |

If the slower snap is still more than 5% above 32.02 kPa, that is a
**miss**, even if the trend is right. **read from the description.**

---

## Snap-through definition (committed before the run)

**Snap-through pressure** is the prescribed ramp pressure at the
interpolated time when equivalent stretch (V / V₀)^{1/3} first crosses
**1.60**.

Why 1.60: **guess**, strictly above λ\* = 1.383 and below the warn
stretch 2, so the crossing is on the falling side of the closed-form
curve, not a maximised peak and not the Part 1 “first time max stretch
hits 1.383” event.

If equivalent stretch never reaches 1.60, there is no snap event: miss.

Two ramps, both 0 → **36 kPa**, kill off, same sphere, same damping:

- Faster: **400 ms** to 36 kPa (90 kPa/s). **guess** that this is in the
  same slow-load family as the 400 ms scale already named in the repo
  (**read from docs** as a time scale that exists).
- Slower: **800 ms** to 36 kPa (45 kPa/s). Twice as slow. **computed**
  as half the faster rate.

Each run continues 50 ms after the ramp so a late snap still counts.
**guess** that 50 ms is enough to see the crossing if it is going to
happen near 36 kPa.

**guess** before the run: both snap pressures sit **above** 32.02 kPa,
and the slower one is closer to 32.02 kPa. That is the lag Chiron named.

---

## 28 kPa hold (not a hold at the limit)

Ramp 0 → **28 kPa** in **400 ms**, then hold 28 kPa. Do **not** hold at
32.02 kPa. **read from the description.**

### Settled

After the ramp, the film is settled at the first history sample where
kinetic energy / internal energy < **0.001**. **guess**, using the
same 0.001 kinetic-to-internal ratio the relaxation description uses to
ignore a kinetic peak (**read from the description** of that table),
here as “nearly at rest.”

If that never happens by **t = 0.55 s** (150 ms hold, about 27
breathing periods), the hold did not settle: miss. **guess** that 150 ms
is enough at the damping below.

Report that settled equivalent stretch against **1.18757**. Bar 2%.

---

## Damping (this sphere only)

- Velocity kill: **off**.
- Rayleigh mass α = **80 per second**. That is the starter /DAMP value
  already on the Letter A card. **read from docs.** Not a fitted number.
- Why this and not Part 1’s 2273 /s: Part 1’s twice-critical damping is
  the known cause of the 4.7% limit-point miss (stretch still creeping
  at 99% of the limit pressure). **computed** from Part 1. Heavy damping
  adds lag. **read from the description.**
- Why not zero: with no mass damping an undamped breathing mode need
  not die, so the 28 kPa hold may never meet the kinetic threshold.
  **guess.**
- Why 80 /s is the lightest that still lets the hold settle: velocity
  decays as e^{−α t}. After 150 ms, e^{−80 × 0.15} = e^{−12} ≈ 6×10⁻⁶,
  so residual speed is gone. **computed.** Lighter than 80 /s is not a
  documented value; 80 /s is the light documented Rayleigh.

Shipped Letter A stays 80 /s and 0.18 peak-kill. This probe does not
change that.

---

## 2 microsecond spot check

Repeat snap-through (both rates) and the 28 kPa hold with time-step cap
**1.971×10⁻⁶ s**, copied from the listing. **read from the description.**
**guess:** same pass/miss as the CFL-step runs (step size was already
cleared on kill-off Letter A). If a capped run leaves a bar that the
uncapped run meets, that is a step-size error, reported as a miss.

---

## What this probe is not

- Not a hold at 32.02 kPa.
- Not a change of the 0.18 peak-kill default.
- Not the every-frame 0–16 ms test.
- Not a retune of bands, stiffness, Letter A load, mesh, or golden.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.
