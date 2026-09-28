# OpenRadioss quasi-static-ish desk tape (`qs-ish-pload-400ms`)

Checked-in golden: `src/oracle/inflate-a-radioss-qs-golden.json` (`status: filled`).
Source: inflation-abc PR #11, desk `radioss/A-inflate-qs-ish`, branch
`cursor/openradioss-a-qs-ish-b1bc`. OpenRadioss AGPL stays offline — JSON only.

Load family **`qs-ish-pload-400ms`**: `/PLOAD` 0 → 65 kPa in 0.40 s + `/ADYREL`.
Same LAW42 μ, ρ, H0, mesh fingerprint `d9c56487` as `dynamic-pload-40ms`.
**No μ/ρ retune.**

## Warn freeze (first λ ≥ 2)

| Qty | Radioss QS-ish golden |
| --- | --- |
| t | 0.170001 s (frame 34) |
| λ_max | 2.327123518375924 |
| p | 27625.1625 Pa |
| V | 752.6256176704242 mL |
| Ψ | 8.042896684001748 J (≥ 0) |
| punch | false |

`pnpm compare:inflate:qs` compares this family. Green QS (λ≤2% / V≤5% / p≤5%)
is still required — not waived. Toy QS path: `/DAMP` α=80, `/ADYREL` as
OpenRadioss ENER_W0+ISTAT=1 (no invented BETATE gain), 1-GP Q4 membrane
(Ishell=1 analogue; λ/Ψ still CST on ANIM per RUN.md), Q4 mean-plane `/PLOAD`
(equal pA/4, Belytschko diagonal area — not CST tet shares), TYPE7 1-ring
node-segment Gapmin (same CONTACT_KISS; 2-hop skip hid the A-hole). Kirchhoff
CST hinges were tried and over-stiffened λ(p) vs this Belytschko tape — not
assembled. Enclosed V stays the tet sum (ANIM/VTK faceted surface; V0=354 mL).
`pnpm compare:inflate` (dynamic) stays the green CI gate until QS compare
exits 0.

## What this is not

ABC ship warn ~54.1 kPa (`P_WARN_ABC`) is **not** a load-schedule result on
this film. 10× slower PLOAD moved p@λ≥2 **down** (36 → 28 kPa), away from
54 kPa. Reaching 54 kPa at first λ_max ≥ 2 would require a μ/kinematics
change, which is forbidden.

Dead p = 54100 Pa **CFL-explodes** on Radioss (`forks/dead-pressure`). Do not
vendor that dump. Do not retune μ to chase ~54 kPa. A toy still on
`qs-ish-dead-pressure` at 54100 Pa would fail the p band vs this golden
(~49%) — that is the honest FAIL.

## Reproduce (desk linux64 OpenRadioss)

1. Same `/MAT/LAW42` μ₁ = (800 × 6894.757) / 1.75 Pa, α₁ = 2, ρ = 1130 kg/m³.
2. Same `/PROP` shell, H0 = 0.381 mm, `/INTER/TYPE19` Gapmin = CONTACT_KISS.
3. `/PLOAD` 0 → 65000 Pa in 0.40 s. `/ADYREL`. ANIM_DT = 0.005 s.
4. Freeze the first frame with λ_max ≥ 2. Do not invent μ.
