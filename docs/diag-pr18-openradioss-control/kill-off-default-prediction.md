# Prediction: kill-off as shipped default, then every-frame 0–16 ms

Written **before** any new solver run on this branch. Earlier result files
are not edited. This branch’s base is PR 21
(`cursor/slow-sphere-static-3a61`).

Default today is still the 0.18 peak kill until the Part 2 commit. Bands
stay stretch 2%, volume 5%, pressure 5%. Stiffness, Letter A load, mesh,
golden, and Pages stay unchanged. Do not merge.

Stop at the first failure. If the shipped Letter A path blows up before
the stretch-2 freeze, stop and do not write the every-frame test.

Every claim is marked **read from docs**, **read from the description**,
**computed**, or **guess**.

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree. The AGPL solver is not shipped in the Pages bundle. **read from
docs.**

---

## Sphere result (recorded, not re-run)

Copied here for this PR. Numbers are **computed** from the committed
Part 1 and probe tapes on PR 21. The original files are not edited.

- Rising branch vs closed form: **0.9% PASS** (yardstick 5%).
- Limit-point stretch at the 32.02 kPa hold: **4.7% MISS** (yardstick
  2%). Stretch was still rising (1.318 at 400 ms → 1.340 at 420 ms).
  Explained as slow creep near the flat top of the pressure curve:
  stretch 1.318 is already **99.07%** of the limit pressure; 1.340 is
  **99.62%**. **computed.**
- Snap-through, committed pick stretch **1.60**, slower ramp: **32.38
  kPa**, **1.1%** from 32.02 kPa. **PASS** (5% bar, slower ramp only).
- Settled hold at 28 kPa: stretch **1.18558** vs closed-form **1.18757**,
  **0.2%**. **PASS** (2% bar).
- Both step sizes (CFL and 1.971 μs cap): same pass/miss. **computed.**

### Robustness of the 1.60 pick (not a retry)

**computed** from the already-committed snap CSV tapes. Definition of
snap-through stays the 1.60 crossing. These extra crossings are a
report, not a new definition.

| run | stretch 1.50 | stretch 1.60 (committed) | stretch 2.00 |
| --- | ---: | ---: | ---: |
| Faster 400 ms | 32.45 kPa (1.3%) | 32.52 kPa (1.5%) | 32.60 kPa (1.8%) |
| Slower 800 ms | 32.34 kPa (1.0%) | 32.38 kPa (1.1%) | 32.41 kPa (1.2%) |
| Faster, 2 μs cap | 32.45 kPa (1.3%) | 32.52 kPa (1.5%) | 32.60 kPa (1.8%) |
| Slower, 2 μs cap | 32.34 kPa (1.0%) | 32.39 kPa (1.1%) | 32.41 kPa (1.2%) |

Percents are |p − 32.02 kPa| / 32.02 kPa. **computed.**

The slower-ramp 1.1% at 1.60 does **not** depend on the pick: 1.50 and
2.00 on that ramp are 1.0% and 1.2%, all inside 5%. The 2 μs tapes give
the same digits. Existing data was enough; no extra run.

---

## Part 2 — kill-off as the shipped default

**read from the description:** no velocity kill, no relaxation. Rayleigh
mass 80 /s stays (starter card). **read from docs.**

Justify by measurement, not a fit to the letter (**read from the
description**):

- Engine-rate relaxation did not close the golden gap. **computed**
  (measurement table).
- Listing 2 μs step on kill-off Letter A was step-independent.
  **computed** (convergence table).
- Sphere follows the closed form: rising branch 0.9%, snap-through
  32.38 kPa vs 32.02 kPa, settled 28 kPa stretch within 0.2%, both step
  sizes. **computed.**

The 0.18 peak kill is not an engine mechanism. **read from the
description** of the period write-up.

### Expected shipped path (**guess**, from committed kill-off tape)

Letter A, oriented mesh, kill off, stop at first stretch ≥ 2:

- First stretch ≥ 2 at about **16 ms**, stretch about **2.105**, volume
  about **866 mL**, pressure **26.01 kPa**. **computed** from the
  committed kill-off tape (not a new run yet).
- Punch-through: **false**. **computed** from that tape.
- The 20 ms blow-up (stretch 12.5) was the **unoriented** mesh with kill
  off. **computed** from the same kill-off report. The shipped path is
  the oriented mesh.

Letter B stays listed as unvalidated, unstable past stretch 2.
**read from docs** (catalog). **guess:** it still crosses stretch 2 at
a high stretch and may punch; that is the label, not the shipped letter.

Letter C stays hidden. **read from docs.** Catalog already says the
first stretch ≥ 2 sample is huge. **guess:** it remains unusable; it is
not shown on the page.

If oriented Letter A punches or the volume goes empty before the
stretch-2 freeze, that is a fail. Stop.

---

## Part 3 — every-frame 0–16 ms (only if Part 2 has no blow-up)

Print every 2 ms from 0 to 16 ms: toy max stretch; golden max stretch;
min and max of the surviving Radioss decks (golden four-node, Ishell 24
with small-strain flag 2, fine re-oriented); triangle deck up to 11.5 ms
labeled as **not** a late-window reference; percent difference to the
golden; whether the toy sits inside the deck spread; volume and pressure
with percent difference to the golden.

Two stretch bars, both printed:

- Old bar: toy stretch within **2%** of the golden maximum.
- Themis’s bar: toy stretch inside the min–max spread of the surviving
  decks (golden + Ishell 24 + fine). Triangle is shown, not in the
  gating spread. **read from the description.**

Themis’s bar **gates** the compare job. The job name will say so.
Volume and pressure must be within **5%** of the golden under both
bars. **read from the description.** Do not widen. Do not pre-call a
green mark.

Deck tapes in this repo have snapshots at 0, 2, 4, 8, 16 ms, not at 6,
10, 12, 14 ms. **read from file** (`element-type.json`). At 6, 10, 12,
14 ms the gating min/max will be linearly interpolated from the nearest
committed deck samples. **guess** that this is the honest way to fill
those ticks rather than dropping them. Triangle: last available sample
8 ms, died ~11.5 ms, so 10–16 ms triangle is missing.

### Expected every-frame outcome (**guess**, from committed tapes)

Kill-off Letter A vs golden vs decks, from the measurement table and
`element-type.md`:

| t (ms) | toy (kill off) | golden | deck min–max (Ishell 24, fine, golden) | old 2% bar | Themis spread | V vs golden | p vs golden |
| ---: | ---: | ---: | --- | --- | --- | --- | --- |
| 0 | 1.000 | 1.000 | 1.000–1.000 | inside | inside | 0% | 0% |
| 2 | 1.118 | 1.709 | 1.197–1.709 | miss ~35% | **outside** (below floor) | ~1.2% | ~1% |
| 4 | 1.108 | 1.657 | 1.257–1.657 | miss | **outside** | ~4% | ~0% |
| 6 | 1.286 | 1.529 | ~1.36–1.529 (interp) | miss | **outside** | ? | ~0% |
| 8 | 1.408 | 1.558 | 1.432–1.558 | miss ~10% | **outside** | ~3.4% | ~0% |
| 10–14 | rising | rising | interp | miss | **outside** | <5% **guess** | ~0% |
| 16 | 2.105 | 2.128 | 2.128–2.237 | **inside** ~1.1% | **outside** (below floor 2.128) | ~2.9% | 0% |

**guess:** Themis’s bar is a miss at every loaded frame after 0 ms
because the toy’s max stretch sits **below** the surviving-deck floor.
The old 2% bar is a miss at 2–14 ms and a pass at 16 ms. Volume stays
inside 5% on the overlapping kill-off tape through 16 ms; pressure is
the prescribed ramp and stays inside 5%. The compare job will be **red**
on Themis’s bar. That is the honest mark. Do not widen.

---

## What this PR will not do

- Not a Pages publish.
- Not a band change.
- Not a stiffness, load, mesh, or golden change.
- Not a merge.
