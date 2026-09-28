# Letter-A inflate MVP

Interactive neo-Hookean membrane inflate of letter **A**, validated against an
**offline OpenRadioss golden**. OpenRadioss (AGPL-3.0) is the desk oracle — it
is **not** shipped in the Pages bundle and is not linked into the browser
solver.

## Smallest diff (reuse vs net-new)

**Reuse (Taylor oracle pattern):**

| Piece | Taylor | Inflate |
| --- | --- | --- |
| Pinned golden JSON | `src/oracle/taylor-bar-oracle.json` | `src/oracle/inflate-a-radioss-golden.json` |
| Compare | `compare.ts` (`Object.is` / rel bands) | `compareInflate.ts` (banded λ/V/p) |
| Law / deck dump | starter export | `inflate-a-law-card.json` + `lockedLawCard()` |
| CLI | `pnpm taylor` / `pnpm oracle:taylor` | `pnpm inflate` / `pnpm compare:inflate` |
| Workbench | research → pre → solve → post | same; second stock model |
| Explicit CD | `solveExplicit` | same leapfrog order, membrane forces |

**Net-new (unavoidable):**

- Plane-stress neo-Hookean CST membrane (`materialNeoHookean.ts`, `membraneCst.ts`)
- Letter-A shell mesh from inflation-abc `meshes/A.json` (Design-PASS quad; 28 orphan `faceTris` paired → 14 quads; NUMELC=1554, NUMELTG=0)
- `/PLOAD` follower + Rayleigh α=80 + Underwood `/ADYREL` analogue
- Node-node kiss projection at CONTACT_KISS (not TYPE19)
- Inflate metrics at first ANIM-stride sample with λ_max ≥ 2

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
`/PLOAD` 0 → 65 kPa in 40 ms.

At first ANIM frame with λ≥2 (frame 11, t≈0.022 s):

| Qty | Radioss golden |
| --- | --- |
| λ_max | 2.1404 |
| p | 35769 Pa |
| V | 901.8 mL |
| Ψ | 9.502 J (≥0) |

This is **dynamic**, not ABC quasi-static warn (~54 kPa). Do not close that gap
by changing μ. A QS-ish Radioss tape is still EMPTY.

## Themis tooling gate

`pnpm compare:inflate` (also `pnpm test` → `tests/inflate-a-oracle.test.ts`)
exits 0 iff:

1. Law-card fields equal the golden (μ, ρ, H0, α₁, …)
2. Load-family tag equals `dynamic-pload-40ms`
3. Mesh fingerprint matches ship A (NUMELC=1554, NUMELTG=0)
4. At first λ≥2: \|λ−λg\|/λg ≤ 2%, \|V−Vg\|/Vg ≤ 5%, \|p−pg\|/pg ≤ 5%
5. Ψ ≥ 0 on both; no punch-through

FAIL on μ/ρ retune, unlabeled load swap, or GIF-only compare.

## View

Default mesh shading is **Both** (solid + wire) — mesh edges ON. Product flag,
not a physics loophole.

## Run

```bash
pnpm inflate          # headless solve + metrics JSON
pnpm compare:inflate  # machine-diff vs checked-in Radioss golden (exit 0/1)
pnpm test             # includes the inflate oracle gate
pnpm dev              # workbench: load “Letter A inflate (neo-Hookean)”
```

OpenRadioss binaries are **not** required to run the gate. Regenerating the
golden still happens offline on a desk with linux64 OpenRadioss (AGPL).

## Remaining NOT-YET (Chiron A–E)

| Check | Status |
| --- | --- |
| A constitutive Ψ≥0, rest Ψ≈0, λ₃ condensed | PASS on this path |
| B warn freeze at first λ≥2 | PASS (ANIM-stride, labeled) |
| C V and p reported | PASS |
| D kiss / no punch-through | Partial: node-node kiss projection; **not** Radioss TYPE19. Honest viol count still weak vs desk |
| E same-class vs Radioss dynamic golden | PASS for this load family (`dynamic-pload-40ms`). **QS apples vs ABC ~54 kPa still open** — labeled, μ not retuned |
| Mesh refine ladder | NOT-YET (PR#9) |
| `/ADYREL` bitwise | NOT-YET — Underwood residual-velocity scale is an analogue, not the Radioss engine keyword |
