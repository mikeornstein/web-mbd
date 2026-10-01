# Engineering Review — letter-A neo-Hookean inflate rewrite

**Product:** web-mbd (browser computer-aided engineering workbench).
**Subject:** Inflation Sim letter-A (then B/C) neo-Hookean membrane inflate,
validated by an **offline** OpenRadioss golden on the **fast-load (dynamic)
case only** — not Radioss in the page.
**Date:** 2026-09-30.
**Status:** desk candidate on load family `dynamic-pload-40ms` only. Slow-load
(quasi-static) is **not validated**. Pages / done-live **NOT-YET**.

Acronyms are spelled out on first use.

This packet is the nine Trust / Engineering Review elements for the rewrite.
It mirrors the **Chiron** physics bar
(`/workspace/briefs/2026-09-27-abc-toy-physics-bar.md` and
[`mvp-inflate-a.md`](mvp-inflate-a.md)) and the **Koios** OpenRadioss
validation path (`docs/research/04-validation-strategy.md`,
`docs/research/09-oracle-bitwise-floor.md`, banded stretch / volume /
pressure compare rather than GIF-only).

---

## 1. Methodology (what was tried, what was ruled out, sources)

**Claim.** The interactive toy is physically the same **class** as the
Inflation ABC ship film on letter A: incompressible (condensed) neo-Hookean
membrane, locked shear modulus μ, film thickness H0, warn at first principal
stretch λ_max ≥ 2, self-contact with Gapmin = CONTACT_KISS, OpenRadioss as the
offline truth seat **on the fast-load (dynamic) tape**. Slow-load
(quasi-static) is not part of that claim.

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
   λ_max ≥ 2 on the **labeled fast-load family** `dynamic-pload-40ms`.
4. Keep the Taylor J2 (von Mises) hex path bitwise-intact.

**Ruled out.**

| Temptation | Why it is out |
| --- | --- |
| Retune μ or ρ to close stretch / volume / pressure | Forbidden by the Chiron bar and this card |
| Treat PR#8 ~36 kPa at warn as ABC quasi-static ~54 kPa | Different load law; unlabeled swap is a FAIL. The ~54 kPa figure is **not claimed** |
| Ship a slow-load (quasi-static) assemble as validated | Last measured at head `8a05992`: 7.7% stretch, 8.8% pressure, 65% volume, balloon folded. That code was **removed, not fixed** |
| Dead p=54100 Pa as a Radioss QS tape | CFL-explodes on this engine |
| Ship OpenRadioss in GitHub Pages | GNU Affero General Public License 3.0; oracle stays offline |
| Call node-node projection “TYPE19” | Radioss `/INTER/TYPE19` is TYPE7 + TYPE11 with Igap=4, Irem_gap=2, Inacti=6 |
| Solid hex J2 as “hyperelastic ABC” | Wrong kinematics and constitutive class |
| Wrinkle clamp as contact | In-plane compression kill ≠ self-contact |

**Sources (primary).** OpenRadioss GitHub (AGPL-3.0); Altair Radioss Theory
Manual 2022 (LAW42, shells, TYPE7 / TYPE19); inflation-abc ship meshes and
PRESSURE-LADDER.md (ABC warn ~54100 Pa — **not claimed**); PR#8 desk
`radioss-desk-pr8-quadir` (`dynamic-pload-40ms`); Koios in-repo validation
strategy; Chiron physics bar.

---

## 2. Fixed rubric (pass / fail before looking at the numbers)

Themis **desk PASS** on this rewrite requires all of:

1. Law-card μ, ρ, H0, α₁, Gapmin, WARN_LAM match the lock (Object.is / 1e-12).
2. Load-family tag is declared and compared. Filled golden:
   `dynamic-pload-40ms` only.
3. Mesh fingerprint matches ship A; NUMELC = NUMELTG-free on that tape.
4. At first stretch ≥ 2: relative error stretch ≤ 2%, volume ≤ 5%, pressure ≤ 5% **only if** the
   same load law.
5. Strain energy Ψ ≥ 0; no punch-through (empty or exploded enclosed volume).
6. Default view shows mesh edges (product flag, not a physics loophole).
7. Taylor J2 hex still solves inside its published bands.

**FAIL** on μ/ρ retune, unlabeled load swap, GIF-only compare, or claiming
ABC quasi-static apples against the dynamic tape.

`pnpm compare:inflate` is the green continuous-integration gate. There is no
slow-load compare script. Do not grade the Inflation ABC ~54 kPa figure
against this tape (pressure at first stretch ≥ 2 is ~36 kPa on the fast-load
desk).

---

## 3. Primary-source diversity

| Seat | What it is | What it is not |
| --- | --- | --- |
| OpenRadioss linux64 desk (PR#8) | Animation freeze at stretch ≥ 2 on LAW42 + `/PLOAD` | Browser solver |
| inflation-abc ship meshes A/B/C | Geometry + ABC constitutive numbers | This toy’s time integrator |
| Altair Radioss Theory Manual 2022 | LAW42, shell, contact class | Bitwise engine |
| ISO 1183-1 Desmopan 85085A | ρ for dynamics | A μ lever |
| Chiron bar + Koios path | Rubric and honest labels | A second implementation |

No single GIF, no single agent transcript, no McMaster density guess as μ.

---

## 4. Adversarial pass

What would make a false PASS:

- Softening CONTACT_KISS or WARN_LAM to hide punch-through.
- Comparing pressure across load families (36 kPa dynamic vs 28 kPa slow-load vs 54 kPa ABC).
- Hashing a different mesh and calling it ship A.
- Counting kiss violations **before** the projection and calling them zero
  after. (Mitigation: viol is post-press.)
- Restoring the slow-load assemble and calling it validated.
- Checking in a hand-written “Radioss” JSON with no engine run.
- Shipping dead p=54100 Pa after it CFL-exploded on Radioss.

Mitigations in-tree: law-card Object.is lock; load-family tag; mesh
fingerprint; viol counted **after** the TYPE19-class press; compare CLI exit
1 on mismatch. Slow-load golden JSON is labeled `gate: none`.

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

No μ or ρ retune. No new knobs on this trim.

---

## 6. Confidence

| Claim | Confidence | Note |
| --- | --- | --- |
| Fast-load letter-A toy vs PR#8 golden inside stretch 2% / volume 5% / pressure 5% | **High** | Machine gate `pnpm compare:inflate` |
| Constitutive lock (μ, H0, λ₃ = 1/(λ₁λ₂), Ψ ≥ 0 at rest) | **High** | Unit kernel + golden law Object.is |
| TYPE19-class kiss stops punch-through on the dynamic tape | **Medium** | Post-press viol; node-node Gapmin |
| ABC quasi-static ~54 kPa apples | **None claimed** | Not a load-schedule result on this film |
| Slow-load (quasi-static) vs filled Radioss tape | **Not validated** | Last measured at head `8a05992`: 7.7% stretch, 8.8% pressure, 65% volume, balloon folded. Code **removed, not fixed** |
| Letters B/C vs Radioss | **Low** | Letter B is an unvalidated demo, unstable past stretch 2 (first stretch ≥ 2 at 4.4, past the warn line; no tape). Letter C is hidden (degenerate / unstable). Leftover cap triangles are constant-strain triangles, not SH3N Radioss |
| `/ADYREL` bitwise | **Low** | Fast-load Underwood analogue, not the engine keyword |
| Pages / done-live | **Low** | Explicitly NOT-YET |

---

## 7. Reproducibility

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm compare:inflate      # must exit 0 (fast-load / dynamic)
pnpm test:e2e
```

OpenRadioss is **not** required to replay the gate. Regenerating the
golden requires a desk linux64 OpenRadioss build (AGPL), the PR#8
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
| P_WARN_ABC = 54100 Pa | inflation-abc PRESSURE-LADDER.md. **Not claimed** as p at first stretch ≥ 2 on this film |
| Slow-load reference JSON | `inflate-a-radioss-qs-golden.json` (`gate: none`; not used by any gate) |
| Dynamic p, λ, V, Ψ at warn | `inflate-a-radioss-golden.json` provenance PR#8 `radioss-desk-pr8-quadir` |
| LAW42 / PROP / TYPE19 keywords | Altair Radioss Theory Manual 2022 + PR#8 deck dump; toy contact labeled **class** |
| Mesh A/B/C | mikeornstein/inflation-abc `meshes/{A,B,C}.json` |
| Validation bands | Chiron E.16 / Koios tooling gate |

---

## 9. Aletheia independent audit

This trim is **not** a Pages publish or done-live PASS. Do not mark public
Pages polish as PASS. Bitwise `/INTER/TYPE19` and letters B/C Radioss goldens
remain open. Slow-load is not validated.

---

## What this packet does not claim

- Mesh refine ladder (PR#9).
- Bitwise `/ADYREL`.
- Bitwise `/INTER/TYPE19`.
- ABC quasi-static Radioss apples (~54 kPa at first stretch ≥ 2 on this film).
- Slow-load (quasi-static) match to OpenRadioss (code removed, not fixed).
- Letters B/C Radioss goldens.
- GitHub Pages as the grade surface.
