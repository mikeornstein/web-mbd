# Letter-A inflate MVP

Interactive neo-Hookean membrane inflate of letter **A**, validated against an
**offline OpenRadioss golden on the fast-load (dynamic) case only**.
OpenRadioss (AGPL-3.0) is the desk oracle — it is **not** shipped in the Pages
bundle and is not linked into the browser solver.

**Slow-load (quasi-static) is not validated.** Last measured at head `8a05992`
the toy was off 7.7% stretch, 8.8% pressure, 65% volume and the balloon folded.
That code was **removed, not fixed**. The Inflation ABC ~54 kPa figure is **not
claimed**.

## Smallest diff (reuse vs net-new)

**Reuse (Taylor oracle pattern):**

| Piece | Taylor | Inflate |
| --- | --- | --- |
| Pinned golden JSON | `src/oracle/taylor-bar-oracle.json` | `src/oracle/inflate-a-radioss-golden.json` |
| Compare | `compare.ts` (`Object.is` / rel bands) | `compareInflate.ts` (banded stretch / volume / pressure) |
| Law / deck dump | starter export | `inflate-a-law-card.json` + `lockedLawCard()` |
| CLI | `pnpm taylor` / `pnpm oracle:taylor` | `pnpm inflate` / `pnpm compare:inflate` |
| Workbench | research → pre → solve → post | same; second stock model |
| Explicit CD | `solveExplicit` | same leapfrog order, membrane forces |

**Net-new (unavoidable):**

- Plane-stress neo-Hookean constant-strain-triangle membrane (`materialNeoHookean.ts`, `membraneCst.ts`)
- Letter-A shell mesh from inflation-abc `meshes/A.json` (Design-PASS quad; 28 orphan `faceTris` paired → 14 quads; NUMELC=1554, NUMELTG=0)
- Follower pressure `f = p ∂V/∂x` (tetrahedron-consistent) + Rayleigh α=80 + Underwood residual-velocity scale 0.18
- TYPE19-class kiss at CONTACT_KISS (Gapmin=0.762 mm): **node-node** soft-press (PR#8 desk). Honest post-press viol. **Not** bitwise OpenRadioss `/INTER/TYPE19`
- Inflate metrics at first animation-stride sample with stretch λ_max ≥ 2
- Letters B/C fixtures remain in-tree; leftover unpaired cap triangles kept as constant-strain triangles. The page lists B as an **unvalidated demo, unstable past stretch 2** and **hides C** (degenerate / unstable).

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

Checked-in golden is **`dynamic-pload-40ms`**: PR#8 quad+`/ADYREL` desk,
`/PLOAD` 0 → 65 kPa in 40 ms. This is the **fast-load (dynamic)** case.

At first animation frame with stretch ≥ 2 (frame 11, t≈0.022 s):

| Qty | OpenRadioss golden |
| --- | --- |
| stretch λ_max | 2.1404 |
| pressure | 35769 Pa |
| volume | 901.8 mL |
| strain energy Ψ | 9.502 J (≥0) |

This is **dynamic**, not the Inflation ABC ~54 kPa figure. Do not close that
gap by changing μ.

A slow-load (quasi-static-ish) OpenRadioss tape exists as a **reference file
only** (`src/oracle/inflate-a-radioss-qs-golden.json`, `gate: none`). It is
**not used by any gate**. The matching toy assemble was removed after it
failed at head `8a05992` (7.7% stretch, 8.8% pressure, 65% volume, balloon
folded). See [`radioss-qs-desk.md`](radioss-qs-desk.md).

## Themis tooling gate

`pnpm compare:inflate` (also `pnpm test` → `tests/inflate-a-oracle.test.ts`)
exits 0 iff:

1. Law-card fields equal the golden (μ, ρ, H0, α₁, …)
2. Load-family tag equals `dynamic-pload-40ms`
3. Mesh fingerprint matches ship A (NUMELC=1554, NUMELTG=0)
4. At first stretch ≥ 2: \|λ−λg\|/λg ≤ 2%, \|V−Vg\|/Vg ≤ 5%, \|p−pg\|/pg ≤ 5%
5. Ψ ≥ 0 on both; no punch-through

FAIL on μ/ρ retune, unlabeled load swap, or GIF-only compare.

## View

Default mesh shading is **Both** (solid + wire) — mesh edges ON. Product flag,
not a physics loophole.

## Run

```bash
pnpm inflate          # headless solve + metrics JSON (letter A, dynamic-pload-40ms)
pnpm compare:inflate  # machine-diff vs checked-in OpenRadioss fast-load golden (exit 0/1)
pnpm test             # includes the inflate oracle gate
pnpm dev              # workbench: load “Letter A inflate (neo-Hookean)”
```

OpenRadioss binaries are **not** required to run the gate. Regenerating the
golden still happens offline on a desk with linux64 OpenRadioss (AGPL).

## Remaining NOT-YET (Chiron A–E)

| Check | Status |
| --- | --- |
| A constitutive Ψ≥0, rest Ψ≈0, λ₃ condensed | PASS on this path |
| B warn freeze at first stretch ≥ 2 | PASS (animation-stride, labeled) |
| C volume and pressure reported | PASS |
| D kiss / no punch-through | TYPE19-class Gapmin=CONTACT_KISS; node-node; honest post-press viol. **Not** bitwise Radioss TYPE19 |
| E same-class vs OpenRadioss fast-load golden | PASS for `dynamic-pload-40ms`. Slow-load (quasi-static) is **not** validated (code removed, not fixed). The Inflation ABC ~54 kPa figure is not claimed |
| Letters B/C | B is an unvalidated demo, unstable past stretch 2 (first stretch ≥ 2 at 4.4, past the warn line; no Radioss tape). C is hidden (degenerate / unstable; first stretch ≥ 2 ~43,000 at 2 ms) |
| Mesh refine ladder | NOT-YET (PR#9) |
| `/ADYREL` bitwise | NOT-YET — fast-load Underwood analogue, not the engine keyword |
| Engineering Review pack | Filed at [`engineering-review-inflate-a.md`](engineering-review-inflate-a.md) |
| Pages / done-live | NOT-YET (do not publish Pages) |
