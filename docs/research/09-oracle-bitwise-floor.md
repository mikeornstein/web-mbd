# Oracle bitwise floor (Taylor H8C / LAW2)

## Goal

`Object.is` on shape metrics and nearest-neighbor–matched nodal coordinates between web-mbd and same-mesh OpenRadioss.

## What is already matched

- `resol` CD order: FORINT(X) → DT2/DT12 → RGWALL → V+=A·DT12 → X+=V·DT2
- Infinite-plane `/RWALL` ITIED=0 (`rgwall.F`): predict UX with DT12/DT2; strip normal V/A (no `DP0DT` — that is finite-plane `rgwalp` only)
- H8C: 2×2×2, PG=`0.577350269189625`, Iframe=1 → JCVT=0 Jaumann, Icpre=1 PXC + ZEP3, DSV `vol0`
- LAW2 / M2LAW-style J2 + bulk EOS `P=K·AMU`; shear engineering-rate convention
- CFL: `128·V·SMAX` DELTAX, scale from `controls.cfl` (default 0.9)
- Hierarchical `S8EJACIP3` Grad N ≡ isoparametric Grad N to ~1e-15 relative on distorted impact-face hexes

## Evidence the remaining gap is truncation, not missing physics

| Setup | ‖Δ(Lf/L₀)‖/OR | ‖Δ(Rf/R₀)‖/OR | NN / aligned max |
| --- | --- | --- | --- |
| Adaptive CFL=0.9 (production, float64 `.sta`) | ~4.5×10⁻⁶ | ~5×10⁻⁶ | ~0.10 μm |
| Fixed Δt=5×10⁻⁸ both codes | ~3×10⁻⁵ | ~3×10⁻⁵ | ~2.7 μm |
| Fixed Δt=2.5×10⁻⁸ both codes | ~1×10⁻⁶ | ~3×10⁻⁷ | ~0.05 μm |
| Fixed Δt=1.5×10⁻⁸ both codes | ~1×10⁻⁶ | ~7×10⁻⁷ | ~0.05 μm |
| Element-order swap (same TS algo) | ~1×10⁻¹⁵ | ~1×10⁻¹⁵ | ulps |

Mid-run (adaptive): Lf residual peaks near 60 μs then recovers — consistent with phase / truncation, not late drift.

## Path to `Object.is`

Independent TypeScript vs gfortran force evaluations will not match IEEE bits at finite CFL even when the algorithm is the same. Required next step:

1. Extract a **shared force kernel** from the OpenRadioss H8C + LAW2 path (`s8eforc3` / `m2law` / wall kinematics already inlined in TS).
2. Compile it once (native `.so` / WASM).
3. Drive it from the web-mbd central-difference loop with identical DT12 bookkeeping.
4. Compare float64 nodal state (not anim float32 VTK) for `Object.is`.

Until that kernel is shared, CI gates stay relative (tightened) and `bitwiseEqual` remains the recorded target flag on the pin.

## Float64 OpenRadioss state path

Anim→VTK is float32 and cannot host an `Object.is` gate. The Taylor engine deck
now emits `/STATE/DT/ALL` at `endTime`; OpenRadioss writes `ROOT_NNNN.sta` with
`/NODE` rows as `I10,1P3E20.13` (`stat_node.F`).

- Parser: `src/oracle/shapeFromSta.ts` (ID-sort → packed XYZ)
- Runner: `src/cli/openRadiossRunner.ts` prefers `.sta`, falls back to VTK
- Compare: `alignedCoordGap` for ID-aligned `Object.is` on coords; pin records
  `coordSource`, `alignedMax`, `coordsBitwiseEqual`

## Shared kernel status (web-mbd)

- C mirror of H8C/LAW2: `native/force-kernel/` (ABI in `force_kernel.h`)
- Proven **TypeScript ↔ C `Object.is`** on one-hex forces and on coarse full solves via `SolveOptions.hexForce` + `src/cli/forceNative.ts` (koffi)
- Remaining for OR parity: replace the C mirror body with OpenRadioss `s8eforc3` / `m2law` (same ABI), keeping the web-mbd CD loop
