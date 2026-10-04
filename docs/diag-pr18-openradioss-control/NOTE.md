# PR 18 diagnosis: package control, Ismstr, every-frame compare, peak-pressure bound

Diagnosis only. No toy changes. No band changes. The new oriented golden is **not**
widened or retuned.

This table is the locked test set. Machine check:
`tests/inflate-a-pr18-control.test.ts` against `four-item-table.json`.
Do not pick an explanation that contradicts a cell.

OpenCourant linux64 `latest-20261003`, commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`.
Old unoriented deck: `radioss/diag-unoriented/` (rest signed volume 354 mL).

## The four locked items (one table)

| # | Question | Result |
| --- | --- | --- |
| **Rule** | If item 1 does **not** reproduce the old golden, the new package is the problem and the new golden does not count. If it **does**, the toy’s snap-through is what needs explaining, and any fix goes in the toy’s physics with material stiffness and the load law untouched. | **Item 1 passed.** Package is not the problem. New oriented golden counts as an engine tape. Miss is the toy snap-through. μ and the 0→65 kPa / 40 ms load law stay untouched. |
| **1** | Old **unoriented** deck on this OpenCourant package (starter still rewrites Ismstr 10 → 2). Does it reproduce the old golden: stretch 2.14, 901.8 mL, 35 769 Pa at frame 11? | **Yes.** Frame 11, t = 0.022012 s, stretch **2.1404**, pressure **35 769 Pa**, volume **901.8 mL**, strain energy 9.502 J. Relative error vs the old golden: stretch 0.002%, volume 0.003%, pressure 0.0005%. All inside 2% / 5% / 5%. |
| **2** | Oriented deck with starter Ismstr **10** vs **2** (if the package refuses 10, say so and show the starter message) | Package **refuses 10**. Starter warning 3019: `INVALID ISMSTR=10, CHANGE TO 2; … INCOMPATIBLE TO ISHEL= 2`. Asking for 2 produces **no** that warning. The two oriented tapes are **identical** on every frame (stretch, volume, pressure bitwise equal). Ismstr 10 cannot be forced on this package with this shell property; 10-rewritten-to-2 **is** 2. |
| **3** | Stretch, pressure, volume vs time, **every frame**, oriented Radioss vs toy | Pressure matches (same prescribed ramp). Stretch and volume **diverge at the first loaded frame (2 ms)**. Radioss is already at stretch 1.71 / 526 mL; the toy is at 1.12 / 520 mL. At 16 ms Radioss is at stretch **2.13 / 892 mL / 26.0 kPa**; the toy is at **1.42 / 665 mL / 26.0 kPa**. Radioss then runs away (stretch 19 at 22 ms). The toy stays stiff until 22 ms (stretch 1.61) then **snaps** 1.61 → 4.33 and 783 → 3274 mL between 22 and 24 ms. Full grid below. |
| **4** | Closed-form peak-pressure estimate, with the formula and inputs written out | **p(λ) = 2 μ (H₀/R₀) (λ⁻¹ − λ⁻⁷)** with μ = (800 × 6894.757)/1.75 Pa, H₀ = 0.015 × 0.0254 m, R₀ = (3V₀/4π)^{1/3}. Limit-point **λ\* = 7^{1/6} ≈ 1.383**. Peak **32.0 kPa** (oriented V₀, R₀ = 46.5 mm) and **33.9 kPa** (as-wound V₀, R₀ = 43.9 mm). Neo-Hookean spheres have **no second rising branch** (`p → 0` as stretch → ∞), so a prescribed-pressure ramp past the peak has **no static equilibrium**. |

**Cause supported by this table:** item 1 passed, so the miss is **not** OpenCourant and **not** the Ismstr rewrite. It is the **toy on the oriented mesh** versus Radioss on that same mesh: the toy inflates too slowly in stretch, then snaps through after the closed-form limit-point, while Radioss inflates through stretch 2 at 16 ms and later runs away.

**Recommended next step (not a parameter sweep):** stop using “first animation sample with stretch ≥ 2 on a prescribed 0→65 kPa / 40 ms ramp” as the compare protocol. That freeze sits **past** the neo-Hookean limit-point, where pressure control has no static equilibrium. Compare instead on the **rising branch** (for example freeze at stretch 1.30, below λ\* ≈ 1.38), or with **volume as the control** (same enclosed volume, report pressure). Leave μ, density, thickness, and the 65 kPa / 40 ms card untouched. That is a change of *what is compared*, not a damping/contact/time-step knob hunt.

Locked table JSON: `four-item-table.json`. Source tapes: `unoriented-opencourant-*.json`,
`oriented-ismstr10-requested-*.json`, `oriented-ismstr2-*.json`, `toy-history.json`,
`sphere-peak-pressure.json`.

---

## Item 1 detail — unoriented deck vs old golden

Old golden (official zip `latest-20260728`, as-wound mesh): frame 11, t = 0.022012 s,
stretch 2.1404, 35 769 Pa, 901.8 mL, 9.502 J.

This OpenCourant control (same deck, Ismstr 10 requested and rewritten to 2):

| frame | t (s) | stretch | p (Pa) | V (mL) | Ψ (J) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 1.0000 | 0 | 354.0 | 0 |
| 1 | 0.002022 | 1.3130 | 3286 | 432.4 | 0.238 |
| 2 | 0.004012 | 1.6245 | 6519 | 421.3 | 0.638 |
| 3 | 0.006013 | 1.4070 | 9771 | 475.8 | 0.757 |
| 4 | 0.008013 | 1.4740 | 13021 | 500.5 | 0.947 |
| 5 | 0.01001 | 1.5529 | 16272 | 524.1 | 1.309 |
| 6 | 0.01201 | 1.5357 | 19512 | 554.1 | 1.790 |
| 7 | 0.01402 | 1.5647 | 22785 | 592.1 | 2.490 |
| 8 | 0.01600 | 1.6369 | 26007 | 638.2 | 3.400 |
| 9 | 0.01802 | 1.7542 | 29285 | 699.2 | 4.667 |
| 10 | 0.02000 | 1.9158 | 32506 | 780.9 | 6.493 |
| **11** | **0.02201** | **2.1404** | **35769** | **901.8** | **9.502** |
| 12 | 0.02401 | 2.5225 | 39022 | 1112 | 15.51 |
| 13 | 0.02600 | 3.5664 | 42255 | 1754 | 37.08 |
| 14 | 0.02767 | 60.97 | 44968 | 48390 | 1700 |

Matches the inflation-abc `RUN.md` table to the digits they published.

Starter still said: `INVALID ISMSTR=10, CHANGE TO 2; … INCOMPATIBLE TO ISHEL= 2`
(see `unoriented-starter-ismstr-warning.txt`). So the old golden’s “Ismstr=10”
desk, on this package, is the rewritten-to-2 run — and that run **is** the old
golden. Ismstr is not a remaining confound.

---

## Item 2 detail — oriented Ismstr 10 vs 2

| Deck | Starter | First stretch ≥ 2 |
| --- | --- | --- |
| Oriented, Ismstr **10** requested | Warning 3019, rewritten to 2 | frame 8, stretch 2.1282, 26 006 Pa, 891.7 mL, 7.313 J |
| Oriented, Ismstr **2** written on the property card | No Ismstr warning | **same numbers, every frame identical** |

There is no way, on this package with Ishell=1 / N=1, to keep Ismstr=10.

---

## Item 3 detail — oriented mesh, every overlapping frame

Pressure is the same prescribed ramp `p = 65 000 × t / 0.04` Pa for t ≤ 0.04 s.
Radioss column is the Ismstr=2 tape (identical to Ismstr-10-requested).

| frame | t (ms) | Radioss stretch | toy stretch | Radioss V (mL) | toy V (mL) | p (kPa) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 1.000 | 1.000 | 420.5 | 420.5 | 0 |
| 1 | 2 | **1.709** | **1.118** | 526.3 | 520.0 | 3.29 |
| 2 | 4 | 1.657 | 1.160 | 547.6 | 540.2 | 6.51 |
| 3 | 6 | 1.529 | 1.175 | 587.0 | 545.9 | 9.76 |
| 4 | 8 | 1.558 | 1.277 | 623.1 | 588.4 | 13.00 |
| 5 | 10 | 1.656 | 1.296 | 666.1 | 597.0 | 16.25 |
| 6 | 12 | 1.680 | 1.328 | 719.0 | 613.9 | 19.50 |
| 7 | 14 | 1.829 | 1.372 | 788.2 | 636.9 | 22.75 |
| **8** | **16** | **2.128** | **1.422** | **891.7** | **665.1** | **26.01** |
| 9 | 18 | 2.534 | 1.477 | 1055 | 697.4 | 29.25 |
| 10 | 20 | 3.377 | 1.538 | 1480 | 735.7 | 32.51 |
| 11 | 22 | **19.29** | **1.612** | **16870** | **782.6** | 35.76 |
| 12 | 24 | (Radioss already stopped) | **4.332** | — | **3274** | 39.01 |

First divergence: **frame 1 (2 ms)**, stretch 1.71 vs 1.12 (volume still within ~1%).
At the Radioss warn frame (16 ms, 26 kPa): stretch 2.13 vs 1.42, volume 892 vs 665 mL.
Toy snap: 22 ms stretch 1.61 / 783 mL → 24 ms stretch 4.33 / 3274 mL.

Radioss on the oriented mesh inflates **faster** than the old as-wound tape (all
faces push out). The toy on that same oriented mesh does **not** follow Radioss;
it stays on a slow-stretch path and then snaps. That is toy physics, not the
package.

---

## Item 4 detail — closed-form peak pressure

Incompressible neo-Hookean thin spherical membrane, Ogden one-term with α = 2
(the same law card: μ₁ = μ, α₁ = 2):

- stretch state: λ₁ = λ₂ = λ, λ₃ = 1/λ²
- hoop Cauchy stress: σ = μ (λ² − λ⁻⁴)
- current thickness H = H₀ / λ², current radius R = R₀ λ
- Laplace: p = 2 H σ / R

which simplifies to

**p(λ) = 2 μ (H₀ / R₀) (λ⁻¹ − λ⁻⁷)**

Limit point: d/dλ (λ⁻¹ − λ⁻⁷) = 0 ⇒ 7 λ⁻⁸ = λ⁻² ⇒ **λ\* = 7^{1/6} ≈ 1.383**.

Inputs:

| symbol | value | source |
| --- | --- | --- |
| μ | (800 × 6894.757) / 1.75 = 3 151 888.914… Pa | locked law card |
| H₀ | 0.015 × 0.0254 = 0.000381 m | locked law card |
| V₀ (oriented) | 4.205477×10⁻⁴ m³ (420.5 mL) | true enclosed volume of letter A |
| R₀ | (3 V₀ / 4π)^{1/3} = **46.48 mm** | equivalent sphere of that volume |
| V₀ (as-wound signed sum) | 3.53985×10⁻⁴ m³ (354 mL) | old reported rest volume |
| R₀ (as-wound) | **43.88 mm** | equivalent sphere of 354 mL |

Results:

| | λ\* | p_max | p(λ=1.42) | p(λ=2.13) | p(λ=4.33) |
| --- | --- | --- | --- | --- | --- |
| Oriented equivalent sphere | 1.383 | **32.02 kPa** | 31.95 kPa | 24.00 kPa | 11.93 kPa |
| As-wound equivalent sphere | 1.383 | **33.92 kPa** | — | — | — |

Letter A is not a sphere, so this is a **sanity bound**, not a prediction of
the letter’s peak. What it does lock:

- Tens of kPa is the right order for this μ, H₀, and size. Radioss at 26 kPa
  and the old golden at 36 kPa are not wild.
- Stretch 2 sits **past** λ\* on the descending branch, where p(λ) is already
  falling. A prescribed pressure larger than p(λ) on that branch has no static
  hold. Radioss reaching stretch 2.13 at 26 kPa (below the spherical p_max,
  above the spherical p(2.13) ≈ 24 kPa) is plausible as a **dynamic overshoot
  through the limit-point**. The toy lingering at stretch 1.42 (right at λ\*)
  until ~36 kPa and then jumping to 4.33 is the classic **pressure-limit-point
  snap** of a neo-Hookean balloon, delayed and then violent.

Do not retune μ to move p_max. Do not widen the 2/5/5 bands.
