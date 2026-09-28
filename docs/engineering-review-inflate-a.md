# Engineering Review — letter-A neo-Hookean inflate rewrite

**Product:** web-mbd (browser computer-aided engineering workbench).
**Subject:** Inflation Sim letter-A (then B/C) neo-Hookean membrane inflate,
validated by an **offline** OpenRadioss golden — not Radioss in the page.
**Date:** 2026-09-28.
**Status:** desk candidate on load family `dynamic-pload-40ms`. Pages / done-live
**NOT-YET**. **Aletheia** independent audit is **pending Zeus**.

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
| Ship OpenRadioss in GitHub Pages | GNU Affero General Public License 3.0; oracle stays offline |
| Call node-node projection “TYPE19” | Radioss `/INTER/TYPE19` is TYPE7 + TYPE11 with Igap=4, Irem_gap=2, Inacti=6 |
| Invent a quasi-static ANIM tape on a box with no engine | Fake golden; EMPTY / FAIL-closed instead |
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
2. Load-family tag is declared and compared; `dynamic-pload-40ms` is the
   only filled Radioss golden.
3. Mesh fingerprint matches ship A; NUMELC = NUMELTG-free on that tape.
4. At first λ ≥ 2: relative error λ ≤ 2%, V ≤ 5%, p ≤ 5% **only if** the
   same load law.
5. Strain energy Ψ ≥ 0; no punch-through (empty or exploded enclosed volume).
6. Default view shows mesh edges (product flag, not a physics loophole).
7. Taylor J2 hex still solves inside its published bands.

**FAIL** on μ/ρ retune, unlabeled load swap, GIF-only compare, or claiming
ABC quasi-static apples against the dynamic tape.

`pnpm compare:inflate:qs` is **FAIL-closed** while
`inflate-a-radioss-qs-golden.json` has `status: EMPTY`. That expected exit 1
is **not** wired as the green CI gate. Dynamic `pnpm compare:inflate` is.

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
- Comparing pressure across load families (36 kPa dynamic vs 54 kPa QS).
- Hashing a different mesh and calling it ship A.
- Counting kiss violations **before** the projection and calling them zero
  after.
- Checking in a hand-written “Radioss” QS JSON with no engine run.

Mitigations in-tree: law-card Object.is lock; load-family tag; mesh
fingerprint; viol counted **after** the TYPE19-class press; QS golden EMPTY
until a desk tape exists; compare CLI exit 1 on mismatch.

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
| QS dead p | 54100 Pa | ABC warn class, toy family `qs-ish-dead-pressure` | EMPTY Radioss tape |
| Kiss algorithm | node-to-segment Gapmin projection | TYPE19-**class**, not bitwise TYPE19 | — |

No μ or ρ retune between the dynamic golden PASS and this follow-up.

---

## 6. Confidence

| Claim | Confidence | Note |
| --- | --- | --- |
| Dynamic letter-A toy vs PR#8 golden inside λ 2% / V 5% / p 5% | **High** | Machine gate `pnpm compare:inflate`; Themis desk PASS on head 8223978 |
| Constitutive lock (μ, H0, λ₃ = 1/(λ₁λ₂), Ψ ≥ 0 at rest) | **High** | Unit kernel + golden law Object.is |
| TYPE19-class kiss stops punch-through on the dynamic tape | **Medium** | Fixture viol=0 after press; not bitwise TYPE7+TYPE11; no TYPE11 edges |
| ABC quasi-static ~54 kPa apples | **Low** | Radioss QS golden EMPTY. Toy path is labeled QS-ish only |
| Letters B/C vs Radioss | **Low** | Playable; no tapes. Leftover cap triangles are CST, not SH3N Radioss |
| `/ADYREL` bitwise | **Low** | Underwood analogue only |
| Pages / done-live | **Low** | Explicitly NOT-YET |

---

## 7. Reproducibility

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm compare:inflate      # must exit 0 (dynamic)
pnpm compare:inflate:qs   # must exit 1 while EMPTY
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
| P_WARN_ABC = 54100 Pa | inflation-abc PRESSURE-LADDER.md (warn still at ~54100 Pa for letter A) |
| Dynamic p, λ, V, Ψ at warn | `inflate-a-radioss-golden.json` provenance PR#8 `radioss-desk-pr8-quadir` |
| LAW42 / PROP / TYPE19 keywords | Altair Radioss Theory Manual 2022 + PR#8 deck dump; toy contact labeled **class** |
| Mesh A/B/C | mikeornstein/inflation-abc `meshes/{A,B,C}.json` |
| Validation bands | Chiron E.16 / Koios tooling gate |

---

## 9. Aletheia independent audit

**Pending Zeus.** This packet is the in-repo Engineering Review for Daedalus /
Themis. It is **not** an Aletheia sign-off. Do not mark done-live or public
Pages polish as PASS until Zeus schedules that audit (or Mike explicitly
accepts dynamic-labeled live with the score-sheet flags above).

---

## What this packet does not claim

- Mesh refine ladder (PR#9).
- Bitwise `/ADYREL`.
- Bitwise `/INTER/TYPE19`.
- ABC quasi-static Radioss apples.
- Letters B/C Radioss goldens.
- GitHub Pages as the grade surface.
