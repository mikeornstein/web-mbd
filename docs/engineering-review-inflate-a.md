# Engineering Review — letter-A neo-Hookean inflate rewrite

**Product:** web-mbd (browser computer-aided engineering workbench).
**Subject:** Inflation Sim letter-A (then B/C) neo-Hookean membrane inflate,
validated by an **offline** OpenRadioss golden — not Radioss in the page.
**Date:** 2026-09-28.
**Status:** desk candidate on load families `dynamic-pload-40ms` and
`qs-ish-pload-400ms`. Pages / done-live **NOT-YET**. **Aletheia** independent
audit **cleared by Zeus** for this ingest (not a Pages publish).

Acronyms are spelled out on first use (Mike A.S.S. rule: always spell the short
stuff).

This packet is the nine Trust / Engineering Review elements for the rewrite.
It mirrors the **Chiron** physics bar
(`/workspace/briefs/2026-09-27-abc-toy-physics-bar.md` and
[`mvp-inflate-a.md`](mvp-inflate-a.md)) and the **Koios** OpenRadioss
validation path (`docs/research/04-validation-strategy.md`,
`docs/research/09-oracle-bitwise-floor.md`, banded λ / V / p compare rather
than GIF-only).

---

## 1. Methodology (what was tried, what was ruled out, sources)

**Claim.** The interactive toy is physically the same **class** as the
Inflation ABC ship film on letter A: incompressible (condensed) neo-Hookean
membrane, locked shear modulus μ, film thickness H0, warn at first principal
stretch λ_max ≥ 2, self-contact with Gapmin = CONTACT_KISS, OpenRadioss as the
offline truth seat.

**Method.**

1. Pin the constitutive card in code and in JSON (`lockedLawCard()`,
   `inflate-a-law-card.json`). μ₁ = (800 × 6894.757) / 1.75 Pa. α₁ = 2
   (Ogden one-term neo-Hookean, Radioss LAW42). H0 = 0.015 × 0.0254 m.
   Mass density ρ = 1130 kg/m³ (Desmopan 85085A, International Organization
   for Standardization 1183-1) — **dynamics only, labeled**.
2. Run the same mesh family as inflation-abc `meshes/A.json` (Design-PASS
   quad; 28 orphan face triangles paired → 14 quads; NUMELC = 1554,
   NUMELTG = 0). Fingerprint `d9c56487`.
3. Compare toy vs a checked-in OpenRadioss animation freeze at first
   λ_max ≥ 2 on a **labeled load family**.
4. Keep the Taylor J2 (von Mises) hex path bitwise-intact.

**Ruled out.**

| Temptation | Why it is out |
| --- | --- |
| Retune μ or ρ to close λ / V / p | Forbidden by the Chiron bar and this card |
| Treat PR#8 ~36 kPa at warn as ABC quasi-static ~54 kPa | Different load law; unlabeled swap is a FAIL |
| Dead p=54100 Pa as a Radioss QS tape | CFL-explodes on this engine; 10× slower PLOAD moved p@λ≥2 *down* to ~28 kPa |
| Retune μ to chase ABC ~54 kPa | Forbidden. 54 kPa is not a load-schedule result on this film |
| Ship OpenRadioss in GitHub Pages | GNU Affero General Public License 3.0; oracle stays offline |
| Call node-node projection “TYPE19” | Radioss `/INTER/TYPE19` is TYPE7 + TYPE11 with Igap=4, Irem_gap=2, Inacti=6 |
| Invent a quasi-static ANIM tape on a box with no engine | Fake golden. The filled tape is inflation-abc PR#11 desk JSON |
| Solid hex J2 as “hyperelastic ABC” | Wrong kinematics and constitutive class |
| Wrinkle clamp as contact | In-plane compression kill ≠ self-contact |

**Sources (primary).** OpenRadioss GitHub (AGPL-3.0); Altair Radioss Theory
Manual 2022 (LAW42, shells, TYPE7 / TYPE19); inflation-abc ship meshes and
PRESSURE-LADDER.md (ABC warn ~54100 Pa); PR#8 desk
`radioss-desk-pr8-quadir` (`dynamic-pload-40ms`); Koios in-repo validation
strategy; Chiron physics bar.

---

## 2. Fixed rubric (pass / fail before looking at the numbers)

Themis **desk PASS** on this rewrite requires all of:

1. Law-card μ, ρ, H0, α₁, Gapmin, WARN_LAM match the lock (Object.is / 1e-12).
2. Load-family tag is declared and compared. Filled goldens:
   `dynamic-pload-40ms` and `qs-ish-pload-400ms` are separate apples.
3. Mesh fingerprint matches ship A; NUMELC = NUMELTG-free on that tape.
4. At first λ ≥ 2: relative error λ ≤ 2%, V ≤ 5%, p ≤ 5% **only if** the
   same load law.
5. Strain energy Ψ ≥ 0; no punch-through (empty or exploded enclosed volume).
6. Default view shows mesh edges (product flag, not a physics loophole).
7. Taylor J2 hex still solves inside its published bands.

**FAIL** on μ/ρ retune, unlabeled load swap, GIF-only compare, or claiming
ABC quasi-static apples against the dynamic tape.

`pnpm compare:inflate:qs` is the filled `qs-ish-pload-400ms` harness (same
μ/mesh; λ currently inside 2%). V/p vs this tape are **not** in band yet —
do not close them with μ. Dynamic `pnpm compare:inflate` stays the green CI
gate. Do not grade ABC ~54 kPa apples against either tape
(p@λ≥2 is ~36 kPa dynamic / ~28 kPa Radioss QS-ish / ~23 kPa toy QS-ish).

---

## 3. Primary-source diversity

| Seat | What it is | What it is not |
| --- | --- | --- |
| OpenRadioss linux64 desk (PR#8) | Animation freeze at λ ≥ 2 on LAW42 + `/PLOAD` | Browser solver |
| inflation-abc ship meshes A/B/C | Geometry + ABC constitutive numbers | This toy’s time integrator |
| Altair Radioss Theory Manual 2022 | LAW42, shell, contact class | Bitwise engine |
| ISO 1183-1 Desmopan 85085A | ρ for dynamics | A μ lever |
| Chiron bar + Koios path | Rubric and honest labels | A second implementation |

No single GIF, no single agent transcript, no McMaster density guess as μ.

---

## 4. Adversarial pass

What would make a false PASS:

- Softening CONTACT_KISS or WARN_LAM to hide punch-through.
- Comparing pressure across load families (36 kPa dynamic vs 28 kPa QS-ish vs 54 kPa ABC).
- Hashing a different mesh and calling it ship A.
- Counting kiss violations **before** the projection and calling them zero
  after. (Mitigation: viol is post-press.)
- Shipping a node-to-segment analogue **as the dynamic default** that misses
  the PR#8 TYPE19 desk bands and calling it same-class. (QS-ish uses
  node-segment; dynamic stays node-node.)
- Checking in a hand-written “Radioss” QS JSON with no engine run.
- Shipping dead p=54100 Pa after it CFL-exploded on Radioss.

Mitigations in-tree: law-card Object.is lock; load-family tag; mesh
fingerprint; viol counted **after** the TYPE19-class press; filled QS-ish
golden from inflation-abc PR#11; compare CLI exit 1 on mismatch.

---

## 5. Calibration log

| Knob | Value | Why | Not a μ lever |
| --- | --- | --- | --- |
| μ₁ | (800 × 6894.757) / 1.75 Pa | Grill engineering → LAW42 | — |
| α₁ | 2 | Ogden neo-Hookean | — |
| H0 | 0.381 mm | Film thickness | — |
| ρ | 1130 kg/m³ | Desmopan 85085A | dynamics only, labeled |
| Gapmin | max(2·H0, 1e-4) ≈ 0.762 mm | CONTACT_KISS | — |
| WARN_LAM | 2 | First λ_max ≥ 2 freeze | — |
| `/PLOAD` dynamic | 0 → 65 kPa / 40 ms | PR#8 desk | load family tag |
| Underwood scale | 0.18 at kinetic-energy peaks | `/ADYREL` **analogue**; full reset overdamps vs PR#8 | not on the LAW42 card |
| Rayleigh α | 80 1/s | Starter `/DAMP` | ρ unchanged |
| `/PLOAD` QS-ish | 0 → 65 kPa / 400 ms | inflation-abc PR#11; p@λ≥2 ≈ 27.6 kPa | not ABC 54 kPa |
| QS `/ADYREL` analogue | OpenRadioss ENER_W0 BETATE + ISTAT=1 A-update (DT12); **no** invented 1.5× gain | `/DAMP` α=80 kept; Underwood 0.18 is dynamic-only | not on the LAW42 card |
| QS dead p | 54100 Pa | **Ruled out** — CFL-explodes on Radioss | do not vendor; do not chase with μ |
| Kiss algorithm | dynamic: node-node; QS: node-segment Gapmin=CONTACT_KISS | TYPE19-**class**; QS TYPE7 analogue so staggered A-hole/leg faces cannot pass through. Gapmin not weakened. Not bitwise TYPE19 | — |

No μ or ρ retune between the dynamic golden PASS and this follow-up.

---

## 6. Confidence

| Claim | Confidence | Note |
| --- | --- | --- |
| Dynamic letter-A toy vs PR#8 golden inside λ 2% / V 5% / p 5% | **High** | Machine gate `pnpm compare:inflate`; Themis desk PASS on head 8223978 |
| Constitutive lock (μ, H0, λ₃ = 1/(λ₁λ₂), Ψ ≥ 0 at rest) | **High** | Unit kernel + golden law Object.is |
| TYPE19-class kiss stops punch-through on the dynamic tape | **Medium** | Post-press viol; node-node Gapmin on dynamic (QS uses node-segment TYPE7 analogue; same Gapmin) |
| ABC quasi-static ~54 kPa apples | **Low** | Not a load-schedule result on this film. QS-ish p@λ≥2 ≈ 27.6 kPa |
| `qs-ish-pload-400ms` vs filled Radioss tape | **Medium** | Law/mesh/family lock. Green QS (`compare:inflate:qs` exit 0) is still required; not waived. |
| Letters B/C vs Radioss | **Low** | Playable; no tapes. Leftover cap triangles are CST, not SH3N Radioss |
| `/ADYREL` bitwise | **Low** | Dynamic: Underwood analogue. QS: ENER_W0 + ISTAT=1 as written, not the engine keyword |
| Pages / done-live | **Low** | Explicitly NOT-YET |

---

## 7. Reproducibility

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm compare:inflate      # must exit 0 (dynamic)
pnpm compare:inflate:qs   # must exit 0 vs filled qs-ish-pload-400ms (Themis green-QS)
pnpm test:e2e
```

OpenRadioss is **not** required to replay the gate. Regenerating either
golden requires a desk linux64 OpenRadioss build (AGPL), the PR#8 (or QS)
deck, and a rewrite of the JSON plus law-card lock check.

Mesh edges default ON is in `workbench.ts` (`drawMode: "both"`) and e2e.

---

## 8. Primary-source tracing

| Number / keyword | Trace |
| --- | --- |
| μ formula | inflation-abc / PR#8 RUN.md; `constants.ts` `MU = (800 * PSI) / 1.75` |
| ρ = 1130 | Desmopan 85085A ISO 1183-1; labeled; McMaster 1446T11 density unpublished |
| H0 = 0.381 mm | 0.015 in × 0.0254 |
| CONTACT_KISS | max(2·H0, 1e-4) |
| WARN_LAM = 2 | ABC / Chiron bar |
| P_WARN_ABC = 54100 Pa | inflation-abc PRESSURE-LADDER.md. **Not** p@λ≥2 on this film (dead fork CFL-explodes) |
| QS-ish p, λ, V, Ψ at warn | `inflate-a-radioss-qs-golden.json` provenance inflation-abc PR#11 `qs-ish-pload-400ms` |
| Dynamic p, λ, V, Ψ at warn | `inflate-a-radioss-golden.json` provenance PR#8 `radioss-desk-pr8-quadir` |
| LAW42 / PROP / TYPE19 keywords | Altair Radioss Theory Manual 2022 + PR#8 deck dump; toy contact labeled **class** |
| Mesh A/B/C | mikeornstein/inflation-abc `meshes/{A,B,C}.json` |
| Validation bands | Chiron E.16 / Koios tooling gate |

---

## 9. Aletheia independent audit

**Cleared by Zeus** for this ingest (filled `qs-ish-pload-400ms` golden +
dynamic gate still green). This is **not** a Pages publish or done-live
PASS. Do not mark public Pages polish as PASS. Bitwise `/INTER/TYPE19` and
letters B/C Radioss goldens remain open.

---

## What this packet does not claim

- Mesh refine ladder (PR#9).
- Bitwise `/ADYREL`.
- Bitwise `/INTER/TYPE19`.
- ABC quasi-static Radioss apples (~54 kPa at first λ≥2 on this film).
- Letters B/C Radioss goldens.
- GitHub Pages as the grade surface.
