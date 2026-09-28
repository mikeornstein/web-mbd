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
- TYPE19-class kiss at CONTACT_KISS (Gapmin=0.762 mm): dynamic **node-node** soft-press (PR#8 desk). QS-ish **node-segment** TYPE7 analogue so staggered hole/leg faces cannot pass through. Same Gapmin; honest post-press viol. **Not** bitwise OpenRadioss `/INTER/TYPE19`
- Inflate metrics at first ANIM-stride sample with λ_max ≥ 2
- Letters B/C playable from inflation-abc ship meshes; leftover unpaired cap triangles kept as constant-strain triangles
- Labeled `qs-ish-pload-400ms` toy path; Radioss QS-ish golden filled (p@λ≥2 ≈ 27.6 kPa, not ABC 54 kPa)

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
by changing μ.

A second filled tape is **`qs-ish-pload-400ms`**: `/PLOAD` 0 → 65 kPa in 0.40 s
+ `/ADYREL`. At first ANIM frame with λ≥2 (frame 34, t≈0.170 s):

| Qty | Radioss QS-ish golden |
| --- | --- |
| λ_max | 2.327123518375924 |
| p | 27625.1625 Pa |
| V | 752.6256176704242 mL |
| Ψ | 8.042896684001748 J (≥0) |

10× slower PLOAD moved p@λ≥2 **down** (36 → 28 kPa), away from ABC ~54 kPa.
Dead p = 54100 Pa CFL-explodes on Radioss — not shipped. See
[`radioss-qs-desk.md`](radioss-qs-desk.md).

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
pnpm inflate          # headless solve + metrics JSON (letter A, dynamic-pload-40ms)
pnpm compare:inflate  # machine-diff vs checked-in Radioss dynamic golden (exit 0/1)
pnpm compare:inflate:qs  # machine-diff vs filled qs-ish-pload-400ms golden (exit 0/1)
pnpm inflate:qs       # toy qs-ish-pload-400ms path
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
| D kiss / no punch-through | TYPE19-class Gapmin=CONTACT_KISS; dynamic node-node; QS node-segment TYPE7 analogue; honest post-press viol. **Not** bitwise Radioss TYPE19 |
| E same-class vs Radioss dynamic golden | PASS for `dynamic-pload-40ms`. **QS-ish `qs-ish-pload-400ms` filled** (p@λ≥2 ≈ 27.6 kPa). Green QS (`pnpm compare:inflate:qs` exit 0) is required. ABC ~54 kPa is not a load-schedule result on this film |
| Letters B/C | Playable; same μ/ρ/H0/kiss/warn; OpenRadioss goldens NOT-YET (no tapes) |
| Mesh refine ladder | NOT-YET (PR#9) |
| `/ADYREL` bitwise | NOT-YET — dynamic Underwood analogue; QS ENER_W0+ISTAT=1 as written, not the engine keyword |
| Engineering Review pack | Filed at [`engineering-review-inflate-a.md`](engineering-review-inflate-a.md). Aletheia cleared by Zeus for this ingest |
| Pages / done-live | NOT-YET (do not publish Pages) |
