# Stretch measurement check (0–16 ms window)

Read and measure only. Default toy, bands, stiffness, and load law were not changed.
Window: time zero through the golden's first stretch of 2 (**16 ms**). Later frames are out because Radioss dies near 22 ms.

## 1. Same stretch definition?

**Toy — read-from-code.** `src/fe/inflateSolver.ts` `measure()` (lines 157–180) loops the constant-strain triangles built in the same file (lines 75–80) via `splitQuadCsts`. Each four-node shell becomes two triangles on the diagonal from the first corner to the opposite corner (nodes 0-1-2 and 0-2-3) in `src/fe/membraneCst.ts` lines 308–318. For each triangle, `cstSample` (lines 100–134) builds the 3-D deformation gradient from current edges versus the rest in-plane basis (`deformGradient`, lines 149–171), then `principalStretches` (lines 174–187) takes √(eigenvalues of the in-plane C). **Out-of-plane motion is included** (F has a third row). In-plane compression is clamped (`wrinkleClamp`: λ² < 1 is set to 1). The reported stretch is the max of λ1 and λ2 over every triangle. Rest configuration is the undeformed ship mesh at load (`mesh.coords`).

**Radioss golden — read-from-code + computed-by-run.** The engine animation stores node positions and four-node cells (`radioss/A-inflate/run/Ainflate_A*.vtk`). It also stores a membrane strain tensor; **that tensor is not what the golden uses.** `radioss/diag-oriented-ismstr2/RUN.md` line 55 says stretch is “CST membrane principals on ANIM/VTK (rest = frame 0)”. This check recomputes that with the **same** `cstSample` / `splitQuadCsts` on the animation cells and frame-0 rest. At the 16 ms animation sample, recomputed max **matches the published golden max** (published 2.128161758971, recomputed 2.128161758971).

Rest positions: animation frame 0 versus the toy ship mesh, after mapping animation `NODE_ID` onto the same 0-based nodes, differ by at most **5.086e-8 m**. That is animation single-precision rounding, not a different rest configuration. **guess:** none needed for the formula; the two published numbers are the same per-triangle quantity.

They **do not** differ as “triangles versus quads” for the **maximum**: a quad's stretch is the max of its two triangles, and the global max is the max of those. Percentiles in the golden (`lambda_field.n_quads = 1554`) are on **per-quad** maxima, which is what this extra 95th-percentile column uses. The toy's official number is still the global max.

## 2–3. Per-element summary at 2, 8, and 16 ms

Clocks: linear interpolation of **every node coordinate** between the two samples that bracket the target time, then stretch is recomputed. Not interpolation of the scalar max.

### 2 ms

Radioss interpolated between 0.0000 ms and 2.0222 ms (yes).
The un-interpolated Radioss animation sample at 2.022 ms is stretch 1.709. Interpolating node positions to exactly 2.000 ms gives 1.696. The published 1.12 vs 1.71 gap is the toy versus that 2.022 ms sample.

| solver | max | 99th % | 95th % | median | mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| Radioss | 1.696 | 1.456 | 1.185 | 1.046 | 1.071 |
| toy kill on (default) | 1.118 | 1.077 | 1.052 | 1.027 | 1.029 |
| toy kill off | 1.118 | 1.077 | 1.052 | 1.027 | 1.029 |

- Radioss maximum: stretch 1.696 at quad index 342, Radioss element id 90, nodes [787, 716, 628, 777], rest centroid (mm) (18.56, 24.64, -25.00), region **upper right back-face**. The other solver's stretch in that same four-node shell: **1.040**.
- Toy kill on maximum: stretch 1.118 at quad index 175, Radioss element id 176, nodes [636, 698, 615, 509], rest centroid (mm) (8.01, -22.63, -25.00), region **lower center back-face**. The other solver's stretch in that same four-node shell: **1.150**.
- Toy kill off maximum: stretch 1.118 at quad index 175, Radioss element id 176, nodes [636, 698, 615, 509], rest centroid (mm) (8.01, -22.63, -25.00), region **lower center back-face**. The other solver's stretch in that same four-node shell: **1.150**.
- Same four-node shell holds the max in Radioss and toy kill-on: **no**. Kill-off: **no**.

### 8 ms

Radioss interpolated between 6.0049 ms and 8.0014 ms (yes).

| solver | max | 99th % | 95th % | median | mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| Radioss | 1.558 | 1.352 | 1.227 | 1.105 | 1.119 |
| toy kill on (default) | 1.277 | 1.159 | 1.111 | 1.071 | 1.074 |
| toy kill off | 1.407 | 1.217 | 1.149 | 1.083 | 1.089 |

- Radioss maximum: stretch 1.558 at quad index 1050, Radioss element id 1054, nodes [1451, 1505, 61, 7], rest centroid (mm) (5.47, -27.37, 20.83), region **lower center front-face**. The other solver's stretch in that same four-node shell: **1.219**.
- Toy kill on maximum: stretch 1.277 at quad index 175, Radioss element id 176, nodes [636, 698, 615, 509], rest centroid (mm) (8.01, -22.63, -25.00), region **lower center back-face**. The other solver's stretch in that same four-node shell: **1.296**.
- Toy kill off maximum: stretch 1.407 at quad index 175, Radioss element id 176, nodes [636, 698, 615, 509], rest centroid (mm) (8.01, -22.63, -25.00), region **lower center back-face**. The other solver's stretch in that same four-node shell: **1.296**.
- Same four-node shell holds the max in Radioss and toy kill-on: **no**. Kill-off: **no**.

### 16 ms

Radioss interpolated between 14.0025 ms and 16.0038 ms (yes).

| solver | max | 99th % | 95th % | median | mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| Radioss | 2.128 | 1.815 | 1.498 | 1.248 | 1.276 |
| toy kill on (default) | 1.421 | 1.258 | 1.186 | 1.127 | 1.130 |
| toy kill off | 2.104 | 1.678 | 1.422 | 1.226 | 1.243 |

- Radioss maximum: stretch 2.128 at quad index 830, Radioss element id 124, nodes [728, 508, 637, 721], rest centroid (mm) (-2.05, -19.58, -25.00), region **middle center back-face**. The other solver's stretch in that same four-node shell: **1.222**.
- Toy kill on maximum: stretch 1.421 at quad index 175, Radioss element id 176, nodes [636, 698, 615, 509], rest centroid (mm) (8.01, -22.63, -25.00), region **lower center back-face**. The other solver's stretch in that same four-node shell: **2.108**.
- Toy kill off maximum: stretch 2.104 at quad index 122, Radioss element id 123, nodes [226, 219, 135, 6], rest centroid (mm) (-2.05, -19.58, 25.00), region **middle center front-face**. The other solver's stretch in that same four-node shell: **2.128**.
- Same four-node shell holds the max in Radioss and toy kill-on: **no**. Kill-off: **no**.

## 4. Is 1.12 vs 1.71 a measurement effect?

**computed-by-run.** At 2 ms the maxima **sit in different** four-node shells. In Radioss's hottest shell, the toy's stretch is **1.040** versus Radioss **1.696**. In the toy's hottest shell, Radioss is **1.150**.

That is a **real motion difference**, not a different definition and not only a different hot spot: even in Radioss's hottest shell the toy is not at 1.71, and the two measures are the same formula.

Kill on and kill off are the same at 2 ms (the 0.18 kill has not acted yet); both columns are shown anyway.

## 5. Every sampled frame from 0 to 16 ms, official max vs extra 95th percentile

Official measure stays the **maximum**. The 95th percentile is an extra column only.

| t (ms) | kill | official max error | extra 95th % error | volume error | pressure error | official 2/5/5 | extra 95th 2/5/5 |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| 0.00 | on | 0.00% | 0.00% | 0.00% | 0.00% | inside | inside |
| 0.00 | off | 0.00% | 0.00% | 0.00% | 0.00% | inside | inside |
| 2.02 | on | 34.53% | 11.35% | 1.16% | 0.00% | outside | outside |
| 2.02 | off | 34.58% | 11.39% | 1.19% | 0.00% | outside | outside |
| 4.00 | on | 29.98% | 12.29% | 1.35% | 0.00% | outside | outside |
| 4.00 | off | 33.10% | 12.44% | 4.11% | 0.00% | outside | outside |
| 6.00 | on | 23.17% | 11.29% | 6.99% | 0.00% | outside | outside |
| 6.00 | off | 15.93% | 7.73% | 2.82% | 0.00% | outside | outside |
| 8.00 | on | 18.00% | 9.43% | 5.58% | 0.00% | outside | outside |
| 8.00 | off | 9.65% | 6.35% | 3.40% | 0.00% | outside | outside |
| 10.00 | on | 21.74% | 11.65% | 10.37% | 0.00% | outside | outside |
| 10.00 | off | 11.14% | 5.67% | 3.35% | 0.00% | outside | outside |
| 12.00 | on | 20.92% | 14.14% | 14.62% | 0.00% | outside | outside |
| 12.00 | off | 6.88% | 6.35% | 3.41% | 0.00% | outside | outside |
| 14.00 | on | 25.02% | 16.97% | 19.20% | 0.00% | outside | outside |
| 14.00 | off | 5.06% | 6.55% | 3.87% | 0.00% | outside | outside |
| 16.00 | on | 33.20% | 20.84% | 25.41% | 0.00% | outside | outside |
| 16.00 | off | 1.08% | 5.08% | 2.87% | 0.00% | inside | outside |

Every frame in 0–16 ms inside 2/5/5 on **official max**: kill on **no**, kill off **no**. On **extra 95th percentile stretch** (volume and pressure still official): kill on **no**, kill off **no**.

No new constants. No physics change.

