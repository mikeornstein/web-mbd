# Oracle bitwise floor (Taylor H8C / LAW2)

## Goal

`Object.is` on shape metrics and nearest-neighbor–matched nodal coordinates between web-mbd and same-mesh OpenRadioss.

## What is already matched

- `resol` CD order: FORINT(X) → DT2/DT12 → RGWALL → V+=A·DT12 → X+=V·DT2
- Infinite-plane `/RWALL` ITIED=0 (`rgwall.F`): predict UX with DT12/DT2; strip normal V/A (no `DP0DT` — that is finite-plane `rgwalp` only)
- H8C: 2×2×2, PG=`0.577350269189625`, **deck IFRAME=1 → JCVT=1 co-rotational**. web-mbd ships `jcvt` option with Radioss `x'=Rx` / `F=RᵀF'` orientation; **default remains `jcvt: 0` (Jaumann)** because co-rot still exceeds oracle Rf/Lf gates (~4e-5). Icpre=1 PXC + ZEP3, DSV `vol0`
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
- Runner: `src/cli/openRadiossRunner.ts` prefers `.sta` (endTime dump vs TSTOP
  overshoot), falls back to VTK
- Compare: `alignedCoordGap` for ID-aligned `Object.is` on coords; pin records
  `coordSource`, `alignedMax`, `coordsBitwiseEqual`

### E20.13 floor (important)

Fixed-DT divergence probe (`scripts/probe-sta-divergence.ts`):

| Horizon | web steps | OR cycles | ‖ΔLf‖/OR | aligned max | coords `Object.is` |
| --- | --- | --- | --- | --- | --- |
| 1×Δt | 1 | 3 | 0 (Lf bits match) | ~6×10⁻¹⁴ | false (~1892 doubles) |
| 10×Δt | 10 | — | ~2×10⁻¹⁶ | ~6×10⁻¹⁴ | false |
| 100×Δt | 100 | — | ~2×10⁻¹⁴ | ~6×10⁻¹⁴ | false |
| 80 μs CFL | 2573 | ~2573 | ~4.5×10⁻⁶ | ~0.10 μm | false |

So **ID-aligned coord `Object.is` against `.sta` text is impossible**: E20.13
round-trip alone is ~10⁻¹⁴ m. Restart `.rst` uses Radioss portable IEEE via
`double_to_IEEE_ASCII` (not raw host `double`), so it is also a non-trivial
reader — not a drop-in bit dump.

### Host `.f64bin` dump (patched engine)

Patched `stat_node.F` writes `ROOT_NNNN.f64bin` beside each `.sta`
(int32 ITAB + 3×float64 raw X). See `docs/research/or-f64bin-host-dump.md`
and `docs/research/or-patches/stat_node.f64bin.patch`.

**Also required for Object.is:** snap web-mbd `/NODE` coords through
`formatRadiossF20` (old E20.10 truncated cylinder corners by ~3×10⁻¹⁵ m) and
scrub |x|≤1e-18 on both sides before `alignedCoordGap`.

| Setup (coarse 2×2×4, fixed Δt=2.5e-8, OR-ABI JCVT=0, snapped X0, scrub) | metrics `Object.is` | coords `Object.is` |
| --- | --- | --- |
| 1×Δt vs live `.f64bin` | **true** | **true** |
| 10×Δt | true | false (~1e-18) |
| 100×Δt / 10 μs | false (~1e-16) | false |
| 80 μs adaptive CFL | false (~9e-6) | false (~0.16 μm) |

Host float64 removes the E20.13 wall. Remaining production residual without a
shared DT schedule is adaptive CFL phase (~5e-6).

### Live DT schedule replay (patched `ecrit.F`)

Patched engine also writes `TAYLOR_dt.f64bin` each print cycle
(`int32 NCYCLE` + `float64 TT` + `float64 DT2`). Replaying that schedule in
web-mbd (`SolveOptions.dtSchedule`) on coarse 2×2×4 @ 80 μs:

| Driver | relLf | relRf | Lf `Object.is` | Rf `Object.is` | aligned max |
| --- | --- | --- | --- | --- | --- |
| OR-ABI + live DT | **0** | ~4×10⁻¹⁵ | **true** | false (~2 ulp on R) | ~9×10⁻¹⁷ |
| TS `jcvt:0` + live DT | ~1×10⁻¹⁵ | ~4×10⁻¹⁵ | false | false | ~6×10⁻¹⁷ |

So the adaptive ~1e-5 gap is almost entirely **DT-phase**, not force formulation.
Rf still misses `Object.is` by ~2 ulps on max radius; coords similarly.
See `scripts/replay-or-dt-schedule.ts` and `docs/research/or-patches/ecrit.dt-f64bin.patch`.

## Shared kernel status (web-mbd)

- C mirror of H8C/LAW2: `native/force-kernel/` (ABI in `force_kernel.h`)
- Proven **TypeScript ↔ C `Object.is`** on one-hex forces and on coarse full solves via `SolveOptions.hexForce` + `src/cli/forceNative.ts` (koffi)
- Remaining for OR parity: drive the web-mbd CD loop through the OR extract ABI instead of the C mirror — see `native/force-kernel/or-extract/`
- Stock `engine_linux64_gf` is ELF `EXEC` (not dlopenable) despite unstripped `s8eforc3_` / `m2law_`
- PIC shared extract: `libwmbd_or_hex.so` packs one-hex ELBUF via starter `WMBD_ALLOCBUF_AUTO`, sets VECT01/IPARG for H8C/LAW2/JCVT=1, and with `WMBD_OR_CALL_S8E=1` calls `S8EFORC3`. Unit-cube forces match C-mirror (`jcvt=1`) after OR→ABI sign flip to ~1e-14 relative. CD loop can drive OR via `hexInternalForcesOr` (pthread wrapper for Node stack).
- **GP pack bug fixed:** pack/scatter must use `IP = IR+((IS-1)+(IT-1)*NPTS)*NPTR` (ξ-fastest). Wrong nesting scrambled GP state → Rf ~0.33 / CFL collapse by 5 μs on coarse Taylor; after fix, OR-ABI vs TS `jcvt:1` is ~1e-5 Lf / ~1e-4 Rf at 80 μs with matched step counts.
- **MAT_PARAM:** IFORM=0 (Johnson–Cook), ICC=1, VP=2, EPS0=1, PMIN=−1e30 — matches `hm_read_mat02_jc` for the Taylor deck (was wrongly IFORM=1 Zerilli).
- **Per-element hist ABI:** `hist_io[32]` = EINT/EPSD/QVIS/RHO×8 so the shared one-hex ELBUF does not leak across elements.
- **Extract JCVT=0 (Jaumann):** despite deck IFRAME=1, OR-ABI with `JCVT=0` matches live OR on coarse fixed-Δt to ~1e-14 Lf / ~1e-12 Rf (E20.13 floor). Extract `JCVT=1` still drifts (~3e-4 Rf). Adaptive coarse 80 μs: ~9e-6 / ~6e-6 vs live — inside production gates.

### Full production mesh (6×6×16, 576 hexes) — OR-ABI `JCVT=0`

| Compare | Horizon | relLf | relRf | aligned max | notes |
| --- | --- | --- | --- | --- | --- |
| OR-ABI ↔ TS `jcvt:0` | 80 μs CFL=0.9 | ~1e-15 | ~3e-15 | ~2e-16 | same 2573 steps; not `Object.is` (1 ulp) |
| OR-ABI ↔ live `.sta` | 80 μs CFL=0.9 | ~4.5e-6 | ~5.1e-6 | ~0.10 μm | **same residual as TS↔live pin** |
| OR-ABI ↔ live `.sta` | 10 μs fixed Δt=2.5e-8 | ~2e-14 | ~5e-12 | ~7e-14 | E20.13 floor; `coordsBitwiseEqual` impossible vs `.sta` |

Shared `S8EFORC3` kernel (Jaumann) therefore closes the force-formulation gap to the TS production path. Remaining `Object.is` vs live OR is blocked by (1) adaptive CFL phase (~5e-6) and (2) `.sta` E20.13 text (~1e-14 m). In-process float64 from OR (or a shared DT schedule + host dump) is still required for true nodal `Object.is`.
