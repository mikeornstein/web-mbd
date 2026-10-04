# Letter-A inflate — first working version

Interactive neo-Hookean membrane inflate of letter **A**, checked against an
**offline open Radioss reference on the fast-load (dynamic) case only**, on a
**consistently outward-oriented mesh**. Open Radioss (GNU Affero General Public
License 3.0) is the desk reference — it is **not** shipped in the GitHub Pages
bundle and is not linked into the browser solver.

**Slow-load (quasi-static) is not validated.** Last measured at head `8a05992`
the toy was off 7.7% stretch, 8.8% pressure, 65% volume and the balloon folded.
That code was **removed, not fixed**. The Inflation ABC ~54 kPa figure is **not
claimed**.

## Smallest diff (reuse vs net-new)

**Reuse (Taylor reference pattern):**

| Piece | Taylor | Inflate |
| --- | --- | --- |
| Pinned reference file | `src/oracle/taylor-bar-oracle.json` | `src/oracle/inflate-a-radioss-golden.json` |
| Compare | `compare.ts` (exact match / relative bands) | `compareInflate.ts` (banded stretch / volume / pressure) |
| Law / deck dump | starter export | `inflate-a-law-card.json` + `lockedLawCard()` |
| Command line | `pnpm taylor` / `pnpm oracle:taylor` | `pnpm inflate` / `pnpm compare:inflate` |
| Workbench | research → pre → solve → post | same; second stock model |
| Explicit central difference | `solveExplicit` | same leapfrog order, membrane forces |

**Net-new (unavoidable):**

- Plane-stress neo-Hookean constant-strain-triangle membrane (`materialNeoHookean.ts`, `membraneCst.ts`)
- Letter-A shell mesh from inflation-abc `meshes/A.json` (Design-PASS four-sided shells; 28 orphan face triangles paired → 14 four-sided shells; 1554 four-sided shells, zero three-sided shells). **188 of those 1554 shells are reversed at load** so every face points outward. Mesh fingerprint **`f9635c7f`** (was `d9c56487` as-wound).
- Follower pressure `f = p ∂V/∂x` (tetrahedron-consistent) + Rayleigh α=80. Velocity kill off (no 0.18 peak kill). Justified by measurement: engine-rate relaxation did not close the golden gap, listing 2 μs step was independent, sphere follows the closed form (rising 0.9%, snap 1.1%, 28 kPa hold 0.2%).
- TYPE19-class kiss at CONTACT_KISS (Gapmin=0.762 mm): **node-node** soft-press. Honest post-press viol. **Not** bitwise open Radioss `/INTER/TYPE19`
- Inflate metrics at first animation-stride sample with stretch λ_max ≥ 2
- Volume is a **true enclosed volume**: signed tetrahedron sum on the consistently outward closed shell, with a check that the shell is closed and the sign is positive. Rest volume is **420.5 mL** (the old 354 mL figure was a mixed-winding signed sum, not a true enclosed volume).
- Letters B/C fixtures remain in-tree; leftover unpaired cap triangles kept as constant-strain triangles. The page lists B as an **unvalidated demo, unstable past stretch 2** and **hides C** (degenerate / unstable). Source bake of B has **404 of 2178** triangles wound against their neighbors; source bake of C has **412 of 1972**. The toy rewinds them at load. The Inflation ABC refine ladder (coarse, fine, finer) **inherits the old winding unless fixed**.

Taylor J2 hex + rigid wall is unchanged.

## Locked card (do not retune)

```
μ₁ = (800 × 6894.757) / 1.75 ≈ 3.151889e6 Pa
α₁ = 2
H0 = 0.015 × 0.0254 m = 0.381 mm
ρ  = 1130 kg/m³  Desmopan 85085A ISO 1183-1 (dynamics only — labeled)
WARN_LAM = 2
CONTACT_KISS = max(2·H0, 1e-4) ≈ 0.762 mm
```

Kinematics: thin membrane (plane stress, λ₃ = 1/(λ₁λ₂)). Not J2 hex Taylor.

## Load family

Checked-in reference is **`dynamic-pload-40ms`**: four-sided shells plus engine
kinetic damping, pressure load 0 → 65 kPa in 40 ms. This is the **fast-load
(dynamic)** case. Regenerated on OpenCourant `latest-20261003` (the historical
open Radioss `latest-20260728` zip now 404s) from the **outward-oriented** deck
`radioss/A-inflate/Ainflate_0000.rad`.

At first animation frame with stretch ≥ 2 (frame 8, t≈0.016 s):

| Qty | open Radioss reference |
| --- | --- |
| stretch λ_max | 2.1282 |
| pressure | 26006 Pa |
| volume | 891.7 mL (true enclosed volume) |
| strain energy Ψ | 7.313 J (≥0) |

On the old as-wound mesh those numbers were frame 11 / 2.1404 / 35769 Pa /
901.8 mL / 9.502 J. Mike allowed the solver numbers to change for this
orientation fix. This is **dynamic**, not the Inflation ABC ~54 kPa figure. Do
not close that gap by changing μ.

A slow-load (quasi-static-ish) open Radioss tape exists as a **reference file
only** (`src/oracle/inflate-a-radioss-qs-golden.json`, `gate: none`). It is
**not used by any gate**. That tape is still the **as-wound** mesh fingerprint
`d9c56487`. The matching toy assemble was removed after it failed at head
`8a05992` (7.7% stretch, 8.8% pressure, 65% volume, balloon folded). See
[`radioss-qs-desk.md`](radioss-qs-desk.md).

## Tooling gate

`pnpm compare:inflate` (also `pnpm test` → `tests/inflate-a-oracle.test.ts`)
exits 0 iff:

1. Law-card fields equal the reference (μ, ρ, H0, α₁, …)
2. Load-family tag equals `dynamic-pload-40ms`
3. Mesh fingerprint matches ship A after the outward rewind (`f9635c7f`; 1554 four-sided shells, zero three-sided shells)
4. At first stretch ≥ 2: \|λ−λg\|/λg ≤ 2%, \|V−Vg\|/Vg ≤ 5%, \|p−pg\|/pg ≤ 5%
5. Ψ ≥ 0 on both; no punch-through

FAIL on μ/ρ retune, unlabeled load swap, or movie-only compare.

## View

Default mesh shading is **Both** (solid + wire) — mesh edges ON. Product flag,
not a physics loophole. **Solid** is solid fill only (mesh edges off); triangle
seams are not drawn in that mode.

## Run

```bash
pnpm inflate          # headless solve + metrics JSON (letter A, dynamic-pload-40ms)
pnpm compare:inflate  # machine-diff vs checked-in open Radioss fast-load reference (exit 0/1)
pnpm test             # includes the inflate reference gate
pnpm dev              # workbench: load “Letter A inflate (neo-Hookean)”
```

Open Radioss binaries are **not** required to run the gate. Regenerating the
reference still happens offline on a desk with a linux64 open Radioss-class
engine (GNU Affero General Public License). `radioss/install_openradioss.sh`
tries the official zip, then the OpenCourant `latest-20261003` package.

## Remaining NOT-YET

| Check | Status |
| --- | --- |
| A constitutive Ψ≥0, rest Ψ≈0, λ₃ condensed | PASS on this path |
| B warn freeze at first stretch ≥ 2 | PASS (animation-stride, labeled) |
| C volume and pressure reported | PASS (true enclosed volume on the outward shell) |
| D kiss / no punch-through | TYPE19-class Gapmin=CONTACT_KISS; node-node; honest post-press viol. **Not** bitwise Radioss TYPE19 |
| E same-class vs open Radioss fast-load reference | PASS for `dynamic-pload-40ms` on the consistently outward-oriented mesh, fast-load only. Slow-load (quasi-static) is **not** validated (code removed, not fixed). The Inflation ABC ~54 kPa figure is not claimed |
| Letters B/C | B is an unvalidated demo, unstable past stretch 2 (first stretch ≥ 2 at 4.4, past the warn line; no Radioss tape). Source bake: 404 of 2178 triangles wound against neighbors. C is hidden (degenerate / unstable; first stretch ≥ 2 ~43,000 at 2 ms). Source bake: 412 of 1972 triangles wound against neighbors. The Inflation ABC refine ladder (coarse, fine, finer) inherits the old winding unless fixed |
| Mesh refine ladder | NOT-YET. The inflation-abc refine ladder inherits the old winding unless fixed |
| Engine kinetic damping bitwise | NOT-YET — fast-load Underwood analogue, not the engine keyword |
| Engineering Review pack | Filed at [`engineering-review-inflate-a.md`](engineering-review-inflate-a.md) |
| Pages / done-live | NOT-YET (do not publish Pages) |
