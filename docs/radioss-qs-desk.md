# OpenRadioss quasi-static desk tape (EMPTY)

This repository does **not** ship an OpenRadioss quasi-static (QS) golden for
letter A. The checked-in file
`src/oracle/inflate-a-radioss-qs-golden.json` is **EMPTY** and **FAIL-closed**.

`pnpm compare:inflate` stays the **dynamic** gate (`dynamic-pload-40ms`) and
must remain exit 0. `pnpm compare:inflate:qs` exits 1 until this file is
filled from a real offline engine run.

## Why EMPTY

PR#8 (`radioss-desk-pr8-quadir`, branch `cursor/openradioss-a-inflate-0e92`)
is a **dynamic** `/PLOAD` 0 → 65 kPa in 40 ms with `/ADYREL`. At first
animation frame with stretch λ ≥ 2 the desk pressure is ~36 kPa. Inflation ABC
quasi-static warn is ~54.1 kPa (P_WARN_ABC). Those are different load
families. Closing the gap by changing μ (shear modulus) or ρ (mass density)
is forbidden.

This cloud box has no OpenRadioss binary. Inventing a QS ANIM (animation)
tape would be a fake golden.

## What to run on a desk (when linux64 OpenRadioss is available)

Reuse the PR#8 LAW42 card and letter-A quad mesh. Do **not** retune μ.

Suggested engine intent (label the deck `qs-ish-dead-pressure`):

1. Same `/MAT/LAW42` μ₁ = (800 × 6894.757) / 1.75 Pa, α₁ = 2, ρ = 1130 kg/m³.
2. Same `/PROP` shell, H0 = 0.381 mm, `/INTER/TYPE19` Gapmin = CONTACT_KISS.
3. Replace the 40 ms ramp with a **dead** (or very slow) pressure at 54.1 kPa,
   or a true quasi-static / AMS (Advanced Mass Scaling) schedule if the desk
   already has one. Do not invent μ to hit 54 kPa on the dynamic tape.
4. ANIM_DT = 0.002 s. Freeze the first frame with λ_max ≥ 2.
5. Record λ_max, enclosed V (mL), p (Pa), Ψ (J), mesh fingerprint `d9c56487`.
6. Set `status` to `"filled"`, `provenance.source` to `"openradioss"`, and
   populate `warn` with those numbers.

Until that tape exists, Themis must **not** grade ABC QS apples-to-apples.
The toy path `qs-ish-dead-pressure` is playable and labeled.
