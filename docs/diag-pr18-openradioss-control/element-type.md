# Element-type check (Radioss only, 0–16 ms)

Diagnosis only. Toy physics, defaults, bands (2% stretch / 5% volume / 5% pressure), the golden, stiffness, and the load law were not changed. The Pages workflow was not touched.

All three requested decks use the same oriented letter, the same neo-Hookean constants, the same density 1130 kg/m³, the same thickness 0.381 mm, the same mass, the same linear 0 to 65 kPa over 40 ms pressure, and the same adaptive dynamic relaxation plus Rayleigh mass 80 /s as the current golden. No knobs were retuned.

**read from docs.** Three-node shells: Radioss `/SH3N` (Altair Radioss `/SH3N` page). The three-node formulation flag on the property card stays **2** (standard C0 triangle with large-rotation modification), already on the golden, documented on the `/PROP/TYPE1 (SHELL)` page. Alternate four-node formulation: **Ishell = 24**, physically stabilized one-point shell (QEPH) on that same property page. Pressure: `/PLOAD` comment 1 says positive pressure acts along the current segment normal — a follower load (`/PLOAD` page). Fine mesh: inflation-abc refine ladder **fine** row, linear 1-to-4 of the ship shell (`radioss/A-refine/REFINE.md`).

**computed by a run.** The fine mesh rest signed volume before re-orient was 354 mL (old mixed winding). After the same whole-quad outward rewind the toy uses, true enclosed volume is **420.5 mL**. 752 four-node shells reversed; mixed shells 0. That rewind is required: the refine ladder inherits the old winding.

Stretch is recomputed from interpolated node coordinates with the toy's own constant-strain triangle sample and the 0–2 diagonal split of each four-node shell, same method as `stretch-measure.md`. Official band uses the **maximum**.

## triangle shells

**computed by a run.** Died on a tiny nodal time step after 3457 cycles. Last printed cycle time **11.37 ms**. Last animation sample **11.46 ms**. Kept frames up to then.

Three-node shells: 3108. Nodes: 1554.

| t (ms) | max | 99th % | 95th % | median | mean | hot id / region | V (mL) | p (kPa) | vs golden 2/5/5 | vs toy kill-on | vs toy kill-off | stretch near elem 90 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- | ---: |
| 0 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1849 lower right mid-thickness | 420.5 | 0.00 | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | 1.000 |
| 2 | 1.106 | 1.061 | 1.049 | 1.026 | 1.027 | 352 lower center back-face | 520.3 | 3.25 | outside (34.79% / 0.94% / 0.00%) | inside (1.04% / 0.08% / 0.00%) | inside (1.04% / 0.08% / 0.00%) | 1.036 |
| 4 | 1.160 | 1.081 | 1.063 | 1.039 | 1.040 | 352 lower center back-face | 543.2 | 6.50 | outside (29.97% / 0.79% / 0.00%) | inside (0.02% / 0.56% / 0.00%) | outside (4.70% / 3.46% / 0.00%) | 1.058 |
| 8 | 1.364 | 1.183 | 1.133 | 1.077 | 1.083 | 352 lower center back-face | 610.0 | 13.00 | outside (12.44% / 2.10% / 0.00%) | outside (6.78% / 3.69% / 0.00%) | outside (3.09% / 1.35% / 0.00%) | 1.100 |
| 16 | — | — | — | — | — | missing | — | — | n/a | n/a | n/a | — |

At 2 ms, the maximum is stretch **1.106** at element 352 (lower center back-face). The shell nearest golden element 90's rest location (upper right, back face) is element 180 (upper right back-face) at stretch **1.036**. Golden element 90 was 1.696. Hot spot near element 90 survives (≥ 1.4): **no**. **computed by a run.**

## physically stabilized four-node shells (Ishell 24, small-strain flag 10)

**computed by a run.** Died on a tiny nodal time step after 6 cycles. Last printed cycle time **0.00 ms**. Last animation sample **0.00 ms**. Kept frames up to then.

Four-node shells: 1554. Nodes: 1554.

| t (ms) | max | 99th % | 95th % | median | mean | hot id / region | V (mL) | p (kPa) | vs golden 2/5/5 | vs toy kill-on | vs toy kill-off | stretch near elem 90 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- | ---: |
| 0 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1147 upper left mid-thickness | 420.5 | 0.00 | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | 1.000 |
| 2 | — | — | — | — | — | missing | — | — | n/a | n/a | n/a | — |
| 4 | — | — | — | — | — | missing | — | — | n/a | n/a | n/a | — |
| 8 | — | — | — | — | — | missing | — | — | n/a | n/a | n/a | — |
| 16 | — | — | — | — | — | missing | — | — | n/a | n/a | n/a | — |

No 2 ms sample: the run died before that time. **computed by a run.**

## physically stabilized four-node shells (Ishell 24, small-strain flag 2)

**computed by a run.** Died on a tiny nodal time step after 5429 cycles. Last printed cycle time **22.15 ms**. Last animation sample **22.16 ms**. Kept frames up to then.

Four-node shells: 1554. Nodes: 1554.

| t (ms) | max | 99th % | 95th % | median | mean | hot id / region | V (mL) | p (kPa) | vs golden 2/5/5 | vs toy kill-on | vs toy kill-off | stretch near elem 90 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- | ---: |
| 0 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1147 upper left mid-thickness | 420.5 | 0.00 | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | 1.000 |
| 2 | 1.197 | 1.090 | 1.061 | 1.030 | 1.033 | 658 upper center back-face | 519.9 | 3.25 | outside (29.45% / 1.02% / 0.00%) | outside (7.07% / 0.00% / 0.00%) | outside (7.07% / 0.00% / 0.00%) | 1.034 |
| 4 | 1.375 | 1.148 | 1.095 | 1.043 | 1.051 | 658 upper center back-face | 542.2 | 6.50 | outside (17.01% / 0.97% / 0.00%) | outside (18.52% / 0.38% / 0.00%) | outside (24.07% / 3.27% / 0.00%) | 1.051 |
| 8 | 1.432 | 1.264 | 1.160 | 1.088 | 1.098 | 1054 lower center front-face | 615.3 | 13.00 | outside (8.06% / 1.24% / 0.00%) | outside (12.12% / 4.60% / 0.00%) | inside (1.75% / 2.23% / 0.00%) | 1.108 |
| 16 | 2.176 | 1.705 | 1.444 | 1.231 | 1.251 | 124 middle center back-face | 878.0 | 26.00 | outside (2.28% / 1.51% / 0.00%) | outside (53.09% / 32.02% / 0.00%) | outside (3.41% / 1.40% / 0.00%) | 1.250 |

At 2 ms, the maximum is stretch **1.197** at element 658 (upper center back-face). The shell nearest golden element 90's rest location (upper right, back face) is element 90 (upper right back-face) at stretch **1.034**. Golden element 90 was 1.696. Hot spot near element 90 survives (≥ 1.4): **no**. **computed by a run.**

## fine quads (re-oriented 1-to-4)

**computed by a run.** Died on a tiny nodal time step after 9083 cycles. Last printed cycle time **20.17 ms**. Last animation sample **20.32 ms**. Kept frames up to then.
**computed by a run.** Starter rewrote the small-strain flag: INVALID ISMSTR=10, CHANGE TO 2; CONCERNING 1 PROPERTY(S)

Four-node shells: 6216. Nodes: 6216.

| t (ms) | max | 99th % | 95th % | median | mean | hot id / region | V (mL) | p (kPa) | vs golden 2/5/5 | vs toy kill-on | vs toy kill-off | stretch near elem 90 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- | ---: |
| 0 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 3617 upper left back-face | 420.5 | 0.00 | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | inside (0.00% / 0.00% / 0.00%) | 1.000 |
| 2 | 1.236 | 1.152 | 1.106 | 1.034 | 1.043 | 4748 lower center back-face | 526.9 | 3.25 | outside (27.16% / 0.32% / 0.00%) | outside (10.54% / 1.35% / 0.00%) | outside (10.54% / 1.35% / 0.00%) | 1.180 |
| 4 | 1.257 | 1.146 | 1.100 | 1.047 | 1.053 | 198 lower center back-face | 550.4 | 6.50 | outside (24.16% / 0.53% / 0.00%) | outside (8.32% / 1.90% / 0.00%) | outside (13.38% / 4.84% / 0.00%) | 1.124 |
| 8 | 1.463 | 1.257 | 1.172 | 1.092 | 1.100 | 198 lower center back-face | 620.1 | 13.00 | outside (6.11% / 0.47% / 0.00%) | outside (14.51% / 5.41% / 0.00%) | outside (3.92% / 3.03% / 0.00%) | 1.222 |
| 16 | 2.237 | 1.691 | 1.443 | 1.232 | 1.248 | 197 lower center back-face | 889.9 | 26.00 | outside (5.14% / 0.18% / 0.00%) | outside (57.37% / 33.82% / 0.00%) | outside (6.30% / 2.78% / 0.00%) | 1.360 |

At 2 ms, the maximum is stretch **1.236** at element 4748 (lower center back-face). The shell nearest golden element 90's rest location (upper right, back face) is element 358 (upper right back-face) at stretch **1.180**. Golden element 90 was 1.696. Hot spot near element 90 survives (≥ 1.4): **no**. **computed by a run.**

## Verdict

The 1.70 stretch at 2 ms on golden four-node Belytschko element 90 is **not** reproduced by any other element type in this set. **computed by a run.**

- Triangle shells at 2 ms peak at **1.11** (the toy is 1.12). Volume 520 mL matches the toy. The shell at element 90's rest location is **1.04**. That tape dies at 11.5 ms on a tiny time step, so 16 ms is missing.
- Physically stabilized four-node shells (Ishell 24) with the golden's written small-strain flag 10 die at rest in 6 cycles. That matches the old deck-generator note that this combination ruptured with no load. Not a 2 ms sample.
- The same Ishell 24 with small-strain flag 2 (what this package actually runs on the golden) peaks at **1.20** at 2 ms. Element 90 itself is **1.03**. At 16 ms it does reach stretch **2.18**, close to the golden 2.13.
- The re-oriented finer Belytschko mesh peaks at **1.24** at 2 ms, not at element 90 (neighborhood **1.18**). At 16 ms max is **2.24**.

So the 2 ms 1.7 hot spot is a **Belytschko four-node (Ishell 1) artifact**, not a robust physical response of the letter. Later stretch ~2 at 16 ms still appears on the other four-node tapes. Official measure remains the maximum. Golden not replaced. No physics change.

