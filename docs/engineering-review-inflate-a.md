# Engineering Review — letter-A neo-Hookean inflate rewrite

**Product:** web-mbd (browser computer-aided engineering workbench).
**Subject:** Inflation Sim letter-A (then B/C) neo-Hookean membrane inflate,
checked against an **offline** open Radioss reference on the **fast-load
(dynamic) case only**, on a **consistently outward-oriented mesh** — not
Radioss in the page.
**Date:** 2026-10-04.
**Status:** desk candidate on load family `dynamic-pload-40ms` only. Slow-load
(quasi-static) is **not validated**. Pages / done-live **NOT-YET**.

Short names are spelled out on first use.

This packet is the nine Trust / Engineering Review elements for the rewrite.
It mirrors the **Chiron** physics bar
(`/workspace/briefs/2026-09-27-abc-toy-physics-bar.md` and
[`mvp-inflate-a.md`](mvp-inflate-a.md)) and the **Koios** open Radioss
validation path (`docs/research/04-validation-strategy.md`,
`docs/research/09-oracle-bitwise-floor.md`, banded stretch / volume /
pressure compare rather than movie-only).

---

## 1. Methodology (what was tried, what was ruled out, sources)

**Claim.** The interactive toy is the same **class** as the Inflation ABC
ship film on letter A: incompressible (condensed) neo-Hookean membrane, locked
shear modulus μ, film thickness H0, warn at first principal stretch λ_max ≥ 2,
self-contact with Gapmin = CONTACT_KISS, open Radioss as the offline truth
seat **on the fast-load (dynamic) tape**, **on a consistently outward-oriented
closed shell**. Slow-load (quasi-static) is not part of that claim.

**Method.**

1. Pin the constitutive card in code and in JSON (`lockedLawCard()`,
   `inflate-a-law-card.json`). μ₁ = (800 × 6894.757) / 1.75 Pa. α₁ = 2
   (Ogden one-term neo-Hookean, Radioss LAW42). H0 = 0.015 × 0.0254 m.
   Mass density ρ = 1130 kg/m³ (Desmopan 85085A, International Organization
   for Standardization 1183-1) — **dynamics only, labeled**.
2. Run the same mesh family as inflation-abc `meshes/A.json` (Design-PASS
   four-sided shells; 28 orphan face triangles paired → 14 four-sided shells;
   1554 four-sided shells, zero three-sided shells). The as-wound bake had
   **376 of 3108 triangles** (188 of 1554 four-sided shells, side walls)
   wound against their neighbors. Load now applies the same whole-quad
   outward rewind as inflation-abc pull request 10 (`orient_outward_closed`).
   Fingerprint **`f9635c7f`** (was `d9c56487`). Rest true enclosed volume is
   **420.5 mL** (the old 354 mL figure was a mixed-winding signed sum).
3. Compare toy vs a checked-in open Radioss animation freeze at first
   λ_max ≥ 2 on the **labeled fast-load family** `dynamic-pload-40ms`,
   regenerated from the oriented deck. Same 2% / 5% / 5% bands. Mike allowed
   the solver numbers to change for this orientation fix only.
4. Keep the Taylor J2 (von Mises) hex path bitwise-intact.

**Ruled out.**

| Temptation | Why it is out |
| --- | --- |
| Retune μ or ρ to close stretch / volume / pressure | Forbidden by the Chiron bar and this card |
| Treat the fast-load warn pressure as ABC quasi-static ~54 kPa | Different load law; unlabeled swap is a FAIL. The ~54 kPa figure is **not claimed** |
| Ship a slow-load (quasi-static) assemble as validated | Last measured at head `8a05992`: 7.7% stretch, 8.8% pressure, 65% volume, balloon folded. That code was **removed, not fixed** |
| Dead p=54100 Pa as a Radioss slow-load tape | Courant time-step limit explodes on this engine |
| Ship open Radioss in GitHub Pages | GNU Affero General Public License 3.0; reference stays offline |
| Call node-node projection “TYPE19” | Radioss `/INTER/TYPE19` is TYPE7 + TYPE11 with Igap=4, Irem_gap=2, Inacti=6 |
| Solid hex J2 as “hyperelastic ABC” | Wrong kinematics and constitutive class |
| Wrinkle clamp as contact | In-plane compression kill ≠ self-contact |
| Widen the 2% / 5% / 5% bands if the oriented compare misses | Report and stop. Do not retune. |
| Hand-edit the reference JSON | The tape must come from a real engine run of the oriented deck |

**Sources (primary).** OpenCourant linux64_gf `latest-20261003` (community
continuation; the official OpenRadioss GitHub zip `latest-20260728` 404s);
Altair Radioss Theory Manual 2022 (LAW42, shells, TYPE7 / TYPE19);
inflation-abc ship meshes and PRESSURE-LADDER.md (ABC warn ~54100 Pa — **not
claimed**); inflation-abc pull request 10 outward rewind; Koios in-repo
validation strategy; Chiron physics bar.

---

## 2. Fixed rubric (pass / fail before looking at the numbers)

Themis **desk PASS** on this rewrite requires all of:

1. Law-card μ, ρ, H0, α₁, Gapmin, WARN_LAM match the lock (Object.is / 1e-12).
2. Load-family tag is declared and compared. Filled reference:
   `dynamic-pload-40ms` only.
3. Mesh fingerprint matches ship A after the outward rewind (`f9635c7f`);
   1554 four-sided shells, zero three-sided shells on that tape.
4. At first stretch ≥ 2: relative error stretch ≤ 2%, volume ≤ 5%, pressure ≤ 5% **only if** the
   same load law.
5. Strain energy Ψ ≥ 0; no punch-through (empty or exploded enclosed volume).
6. Default view shows mesh edges (product flag, not a physics loophole).
   Solid-only view does **not** claim mesh edges are on, and does not draw
   triangle seams.
7. Taylor J2 hex still solves inside its published bands.

**FAIL** on μ/ρ retune, unlabeled load swap, movie-only compare, or claiming
ABC quasi-static apples against the dynamic tape.

`pnpm compare:inflate` is the green continuous-integration gate. There is no
slow-load compare script. Do not grade the Inflation ABC ~54 kPa figure
against this tape.

---

## 3. Primary-source diversity

| Seat | What it is | What it is not |
| --- | --- | --- |
| OpenCourant linux64 desk (oriented deck) | Animation freeze at stretch ≥ 2 on LAW42 + pressure load | Browser solver |
| inflation-abc ship meshes A/B/C | Geometry + ABC constitutive numbers. A is rewound outward in this toy and in `radioss/A-inflate/` | This toy’s time integrator |
| Altair Radioss Theory Manual 2022 | LAW42, shell, contact class | Bitwise engine |
| ISO 1183-1 Desmopan 85085A | ρ for dynamics | A μ lever |
| Chiron bar + Koios path | Rubric and honest labels | A second implementation |

No single movie, no single agent transcript, no McMaster density guess as μ.

---

## 4. Adversarial pass

What would make a false PASS:

- Softening CONTACT_KISS or WARN_LAM to hide punch-through.
- Comparing pressure across load families (fast-load warn vs slow-load vs 54 kPa ABC).
- Hashing a different mesh and calling it ship A.
- Counting kiss violations **before** the projection and calling them zero
  after. (Mitigation: viol is post-press.)
- Restoring the slow-load assemble and calling it validated.
- Checking in a hand-written “Radioss” JSON with no engine run.
- Shipping dead p=54100 Pa after it Courant-exploded on Radioss.
- Reporting mixed-winding signed volume as a true enclosed volume.
- Leaving ~15% of faces taking pressure inward.

Mitigations in-tree: law-card Object.is lock; load-family tag; mesh
fingerprint after outward rewind; viol counted **after** the TYPE19-class
press; compare command-line exit 1 on mismatch; canvas draw-path tests that
fail when the orienter is stubbed to the raw triangles; every face of the
oriented Letter A shell points outward; reported volume matches an independent
other-diagonal plus ray-parity check. Slow-load reference JSON is labeled
`gate: none`.

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
| Pressure load dynamic | 0 → 65 kPa / 40 ms | Fast-load desk | load family tag |
| Underwood scale | 0.18 at kinetic-energy peaks | Engine kinetic-damping **analogue**; full reset overdamps | not on the LAW42 card |
| Rayleigh α | 80 1/s | Starter mass damping | ρ unchanged |
| Outward rewind | 188 of 1554 four-sided shells reversed | Closed-shell orientation; fingerprint `f9635c7f` | not a μ lever |

No μ or ρ retune. No new constitutive knobs on this trim. Solver numbers
**did** change because pressure follows face node order and volume is now a
true enclosed volume. That change was allowed for this fix only.

---

## 6. Confidence

| Claim | Confidence | Note |
| --- | --- | --- |
| Fast-load letter-A toy vs oriented open Radioss tape inside stretch 2% / volume 5% / pressure 5% | **High if the compare exits 0; else this packet stops** | Machine gate `pnpm compare:inflate`. Bands not widened |
| Constitutive lock (μ, H0, λ₃ = 1/(λ₁λ₂), Ψ ≥ 0 at rest) | **High** | Unit kernel + golden law Object.is |
| TYPE19-class kiss stops punch-through on the dynamic tape | **Medium** | Post-press viol; node-node Gapmin |
| ABC quasi-static ~54 kPa apples | **None claimed** | Not a load-schedule result on this film |
| Slow-load (quasi-static) vs filled Radioss tape | **Not validated** | Last measured at head `8a05992`: 7.7% stretch, 8.8% pressure, 65% volume, balloon folded. Code **removed, not fixed**. That tape is still the as-wound fingerprint `d9c56487` |
| Letters B/C vs Radioss | **Low** | Letter B is an unvalidated demo, unstable past stretch 2 (first stretch ≥ 2 at 4.4, past the warn line; no tape). Source bake: 404 of 2178 triangles wound against neighbors. Letter C is hidden (degenerate / unstable). Source bake: 412 of 1972 triangles wound against neighbors. The toy rewinds them at load. The Inflation ABC refine ladder (coarse, fine, finer) inherits the old winding unless fixed |
| Engine kinetic damping bitwise | **Low** | Fast-load Underwood analogue, not the engine keyword |
| Pages / done-live | **Low** | Explicitly NOT-YET |

OpenCourant starter warned that Ismstr=10 was changed to 2 on this package
(shell-property incompatibility). The deck still asks for Ismstr=10. That is
labeled in the reference provenance.

---

## 7. Reproducibility

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm compare:inflate      # must exit 0 (fast-load / dynamic)
pnpm test:e2e
```

Open Radioss is **not** required to replay the gate. Regenerating the
reference requires a desk linux64 open Radioss-class engine (GNU Affero
General Public License), the oriented deck in `radioss/A-inflate/`, and a
rewrite of the JSON from that tape (`scripts/write-inflate-golden-from-radioss.ts`).
`radioss/install_openradioss.sh` tries the official zip, then OpenCourant
`latest-20261003`.

Mesh edges default ON is in `workbench.ts` (`drawMode: "both"`) and e2e.
Solid-only caption is “solid fill only (mesh edges off)”.

---

## 8. Primary-source tracing

| Number / keyword | Trace |
| --- | --- |
| μ formula | inflation-abc RUN.md; `constants.ts` `MU = (800 * PSI) / 1.75` |
| ρ = 1130 | Desmopan 85085A ISO 1183-1; labeled; McMaster 1446T11 density unpublished |
| H0 = 0.381 mm | 0.015 in × 0.0254 |
| CONTACT_KISS | max(2·H0, 1e-4) |
| WARN_LAM = 2 | ABC / Chiron bar |
| P_WARN_ABC = 54100 Pa | inflation-abc PRESSURE-LADDER.md. **Not claimed** as p at first stretch ≥ 2 on this film |
| Slow-load reference JSON | `inflate-a-radioss-qs-golden.json` (`gate: none`; not used by any gate; as-wound fingerprint `d9c56487`) |
| Dynamic p, λ, V, Ψ at warn | `inflate-a-radioss-golden.json` from OpenCourant `latest-20261003` on the outward-oriented deck (frame 8, stretch 2.1282, 26006 Pa, 891.7 mL, 7.313 J) |
| LAW42 / PROP / TYPE19 keywords | Altair Radioss Theory Manual 2022 + oriented deck dump; toy contact labeled **class** |
| Mesh A/B/C | mikeornstein/inflation-abc `meshes/{A,B,C}.json`; A rewound here (fingerprint `f9635c7f`) |
| Validation bands | Chiron E.16 / Koios tooling gate (unchanged 2% / 5% / 5%) |
| Outward rewind | inflation-abc pull request 10 `orient_outward_closed`; whole-quad reverse `[0,3,2,1]` |

---

## 9. Aletheia independent audit

This trim is **not** a Pages publish or done-live PASS. Do not mark public
Pages polish as PASS. Bitwise `/INTER/TYPE19` and letters B/C Radioss
references remain open. Slow-load is not validated. Do not publish Pages.

---

## What this packet does not claim

- Mesh refine ladder. The inflation-abc refine ladder (coarse, fine, finer)
  inherits the old winding unless fixed.
- Bitwise engine kinetic damping.
- Bitwise `/INTER/TYPE19`.
- ABC quasi-static Radioss apples (~54 kPa at first stretch ≥ 2 on this film).
- Slow-load (quasi-static) match to open Radioss (code removed, not fixed).
- Letters B/C Radioss references.
- GitHub Pages as the grade surface.
