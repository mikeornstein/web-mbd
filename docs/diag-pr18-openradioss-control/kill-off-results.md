# Kill-off experiment results

Diagnosis only. Default toy still uses the 0.18 velocity kill. Bands stay
2% / 5% / 5%. Shear modulus and the load law were not touched.

Prediction file was committed first at `69566c72ea2ccbae5b7125223c481b0e52d6e045`.

## Verdict

**The prediction is refuted.** Switching the 0.18 velocity kill off does not move 2 ms stretch toward Radioss 1.71, and it does not keep stretch, volume, and pressure inside 2% / 5% / 5% over the whole overlapping run.

At 2 ms, kill off and kill on are the **same stretch 1.118** (same digits as the locked default). The 0.18 kill has not yet changed the run, so it is **not** the 1.12 vs 1.71 lag. After 2 ms the kill **does** matter: with it off, 16 ms stretch is 2.105 vs Radioss 2.128 (inside the bands at that one freeze), and the default 22–24 ms snap is gone. That single freeze does not count. At 22 ms both are running away (7.42 vs 19.29). No new scale was fitted.

- Oriented 2 ms stretch with kill **on** (locked default): **1.118** vs Radioss **1.709**.
- Oriented 2 ms stretch with kill **off** (run A): **1.118**. Moved toward Radioss: **no**.
- Run A whole overlapping run inside 2/5/5: **no** (max stretch error 61.55%, volume 68.93%, pressure 0.95% over 12 frames).
- Unoriented kill **on** baseline (run C) still matches the old tape at first stretch of 2 or more: **yes** (stretch error 0.31%, volume 0.41%, pressure 0.03%).

Matching a single frame does not count. No scale number was picked afterward.

## How much is the kill vs the mesh

Stretch at 2 ms:

- Kill off vs on, **oriented** mesh: +0.000 (this is the kill's effect on the new mesh).
- Kill off vs on, **unoriented** mesh: +0.000 (same kill, old mesh).
- Unoriented vs oriented, kill **on**: +0.034 (mesh orientation, default kill).
- Unoriented vs oriented, kill **off**: +0.034 (mesh orientation, kill off).
- Radioss itself at 2 ms: oriented 1.709, unoriented 1.313 (mesh orientation in the engine tape).

## Run A: oriented mesh, velocity kill off

Mesh fingerprint `f9635c7f`. Steps 6119. Wall 37689 ms.

| time | toy stretch | Radioss stretch | stretch error | toy volume (mL) | Radioss volume (mL) | volume error | toy p (kPa) | Radioss p (kPa) | pressure error | bands |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 ms | 1.118 | 1.709 | 34.55% | 520.0 | 526.3 | 1.20% | 3.25 | 3.29 | 0.95% | outside |
| 8 ms | 1.408 | 1.558 | 9.63% | 602.0 | 623.1 | 3.39% | 13.01 | 13.00 | 0.04% | outside |
| 16 ms | 2.105 | 2.128 | 1.08% | 866.1 | 891.7 | 2.87% | 26.01 | 26.01 | 0.00% | inside |
| 22 ms | 7.417 | 19.292 | 61.55% | 5240.8 | 16865.8 | 68.93% | 35.76 | 35.75 | 0.01% | outside |
| 24 ms | — | — | n/a | — | — | n/a | — | — | n/a | Radioss missing or toy missing |
| first Radioss stretch ≥ 2 (16.0 ms) | 2.105 | 2.128 | 1.08% | 866.1 | 891.7 | 2.87% | 26.01 | 26.01 | 0.00% | inside |

Maximum error over 12 overlapping frames: stretch 61.55%, volume 68.93%, pressure 0.95%. Whole run inside 2/5/5: **no**.
Toy first stretch ≥ 2: frame 8, t = 16.00 ms, stretch 2.105, 866.1 mL, 26.01 kPa.

## Run B: unoriented mesh, velocity kill off

Mesh fingerprint `d9c56487`. Steps 4177. Wall 26685 ms.

| time | toy stretch | Radioss stretch | stretch error | toy volume (mL) | Radioss volume (mL) | volume error | toy p (kPa) | Radioss p (kPa) | pressure error | bands |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 ms | 1.153 | 1.313 | 12.22% | 455.0 | 432.4 | 5.23% | 3.25 | 3.29 | 1.02% | outside |
| 8 ms | 1.366 | 1.474 | 7.34% | 542.9 | 500.5 | 8.46% | 13.01 | 13.02 | 0.12% | outside |
| 16 ms | 1.737 | 1.637 | 6.13% | 732.2 | 638.2 | 14.74% | 26.00 | 26.01 | 0.02% | outside |
| 22 ms | — | 2.140 | n/a | — | 901.8 | n/a | — | 35.77 | n/a | Radioss missing or toy missing |
| 24 ms | — | 2.522 | n/a | — | 1111.5 | n/a | — | 39.02 | n/a | Radioss missing or toy missing |
| first Radioss stretch ≥ 2 (22.0 ms) | 12.492 | 2.140 | 483.64% | 4881.6 | 901.8 | 441.31% | 32.51 | 35.77 | 9.11% | outside |

Maximum error over 11 overlapping frames: stretch 552.05%, volume 525.14%, pressure 1.02%. Whole run inside 2/5/5: **no**.
Toy first stretch ≥ 2: frame 10, t = 20.01 ms, stretch 12.492, 4881.6 mL, 32.51 kPa.

## Run C: unoriented mesh, velocity kill on (baseline)

Mesh fingerprint `d9c56487`. Steps 3645. Wall 23505 ms.

| time | toy stretch | Radioss stretch | stretch error | toy volume (mL) | Radioss volume (mL) | volume error | toy p (kPa) | Radioss p (kPa) | pressure error | bands |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 ms | 1.153 | 1.313 | 12.22% | 455.0 | 432.4 | 5.23% | 3.25 | 3.29 | 1.02% | outside |
| 8 ms | 1.311 | 1.474 | 11.03% | 536.9 | 500.5 | 7.27% | 13.00 | 13.02 | 0.16% | outside |
| 16 ms | 1.666 | 1.637 | 1.79% | 670.2 | 638.2 | 5.03% | 26.01 | 26.01 | 0.01% | outside |
| 22 ms | 2.134 | 2.140 | 0.31% | 898.1 | 901.8 | 0.41% | 35.76 | 35.77 | 0.03% | inside |
| 24 ms | 3.225 | 2.522 | 27.85% | 1653.1 | 1111.5 | 48.73% | 39.01 | 39.02 | 0.03% | outside |
| first Radioss stretch ≥ 2 (22.0 ms) | 2.134 | 2.140 | 0.31% | 898.1 | 901.8 | 0.41% | 35.76 | 35.77 | 0.03% | inside |

Maximum error over 14 overlapping frames: stretch 611.84%, volume 968.11%, pressure 3.87%. Whole run inside 2/5/5: **no**.
Toy first stretch ≥ 2: frame 11, t = 22.00 ms, stretch 2.134, 898.1 mL, 35.76 kPa.

## Locked default (oriented, kill on) — not re-run

From `toy-history.json`, versus the oriented Radioss tape. Default behavior.

| time | toy stretch | Radioss stretch | stretch error | toy volume (mL) | Radioss volume (mL) | volume error | toy p (kPa) | Radioss p (kPa) | pressure error | bands |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 ms | 1.118 | 1.709 | 34.55% | 520.0 | 526.3 | 1.20% | 3.25 | 3.29 | 0.95% | outside |
| 8 ms | 1.277 | 1.558 | 18.00% | 588.4 | 623.1 | 5.58% | 13.00 | 13.00 | 0.01% | outside |
| 16 ms | 1.422 | 2.128 | 33.20% | 665.1 | 891.7 | 25.41% | 26.01 | 26.01 | 0.01% | outside |
| 22 ms | 1.612 | 19.292 | 91.64% | 782.6 | 16865.8 | 95.36% | 35.76 | 35.75 | 0.02% | outside |
| 24 ms | 4.332 | — | n/a | 3274.2 | — | n/a | 39.01 | — | n/a | Radioss missing or toy missing |
| first Radioss stretch ≥ 2 | 4.332 | 2.128 | 103.57% | 3274.2 | 891.7 | 267.19% | 39.01 | 26.01 | 50.01% | outside |

Maximum error over 12 overlapping frames: stretch 91.64%, volume 95.36%, pressure 0.95%.

Bands used: stretch 2%, volume 5%, pressure 5%. They were not widened.

