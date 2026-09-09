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
- Runner: `src/cli/openRadiossRunner.ts` prefers host `.f64bin` beside the
  earliest `.sta` (endTime dump; ignores TSTOP overshoot / last-anim VTK),
  then `.sta`, then VTK. Engine export emits `/DTIX` when `controls.fixedDt` is set.
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
| 80 μs adaptive CFL (pre ONEP333 / hier DETDP) | false (~9e-6) | false (~0.16 μm) |
| 80 μs adaptive CFL (native, ONEP333 + hier DETDP) | false (~6×10⁻¹⁶ Lf / ~1×10⁻¹⁴ Rf) | false (~9×10⁻¹⁷ m) |

Host float64 removes the E20.13 wall. The former adaptive ~5e-6 residual was
**DT₀ phase** from two SSP/DELTAX mismatches (below), not force formulation.

### Native CFL / DELTAX parity (DT₀ `Object.is`)

OpenRadioss M2LAW sound speed uses `ONEP333 = 1.333` from `constant_mod.F`
(**not** exact `4/3`). Combined with hierarchical GP volumes
(`s8ejacip3` AJ + `ONE_OVER_512` DETDP in `s8ederipr3`), web-mbd now matches
live OR DT₀ on coarse 2×2×4 with `Object.is`. Native adaptive CFL @ 80 μs then
lands at ~ulp residual without replaying `TAYLOR_dt.f64bin`:

| Driver (native CFL=0.9) | relLf | relRf | DT₀ `Object.is` | aligned max |
| --- | --- | --- | --- | --- |
| TS `jcvt:0` | ~6×10⁻¹⁶ | ~1×10⁻¹⁴ | **true** | ~9×10⁻¹⁷ |
| OR-ABI `JCVT=0` | ~1×10⁻¹⁵ | ~1×10⁻¹⁴ | **true** | ~1×10⁻¹⁶ |

### Live DT schedule replay (patched `ecrit.F`)

Patched engine also writes `TAYLOR_dt.f64bin` each print cycle
(`int32 NCYCLE` + `float64 TT` + `float64 DT2`). Replaying that schedule in
web-mbd (`SolveOptions.dtSchedule`) on coarse 2×2×4 @ 80 μs (pre-native CFL fix):

| Driver | relLf | relRf | Lf `Object.is` | Rf `Object.is` | aligned max |
| --- | --- | --- | --- | --- | --- |
| OR-ABI + live DT | **0** | ~4×10⁻¹⁵ | **true** | false (~2 ulp on R) | ~9×10⁻¹⁷ |
| TS `jcvt:0` + live DT | ~1×10⁻¹⁵ | ~4×10⁻¹⁵ | false | false | ~6×10⁻¹⁷ |

Schedule replay proved the gap was DT-phase; native ONEP333 + hier DELTAX removes
the need for a live dump on the adaptive path. Rf/coords still miss full
`Object.is` by a few ulps. See `scripts/replay-or-dt-schedule.ts` and
`docs/research/or-patches/ecrit.dt-f64bin.patch`.

## Shared kernel status (web-mbd)

- C mirror of H8C/LAW2: `native/force-kernel/` (ABI in `force_kernel.h`)
- Proven **TypeScript ↔ C `Object.is`** on one-hex forces and on coarse full solves via `SolveOptions.hexForce` + `src/cli/forceNative.ts` (koffi)
- Remaining for OR parity: drive the web-mbd CD loop through the OR extract ABI instead of the C mirror — see `native/force-kernel/or-extract/`
- Stock `engine_linux64_gf` is ELF `EXEC` (not dlopenable) despite unstripped `s8eforc3_` / `m2law_`
- PIC shared extract: `libwmbd_or_hex.so` packs one-hex ELBUF via starter `WMBD_ALLOCBUF_AUTO`, sets VECT01/IPARG for H8C/LAW2/JCVT=1, and with `WMBD_OR_CALL_S8E=1` calls `S8EFORC3`. Unit-cube forces match C-mirror (`jcvt=1`) after OR→ABI sign flip to ~1e-14 relative. CD loop can drive OR via `hexInternalForcesOr` (pthread wrapper for Node stack).
- **GP pack bug fixed:** pack/scatter must use `IP = IR+((IS-1)+(IT-1)*NPTS)*NPTR` (ξ-fastest). Wrong nesting scrambled GP state → Rf ~0.33 / CFL collapse by 5 μs on coarse Taylor; after fix, OR-ABI vs TS `jcvt:1` is ~1e-5 Lf / ~1e-4 Rf at 80 μs with matched step counts.
- **MAT_PARAM:** IFORM=0 (Johnson–Cook), ICC=1, VP=2, EPS0=1, PMIN=−1e30 — matches `hm_read_mat02_jc` for the Taylor deck (was wrongly IFORM=1 Zerilli).
- **Per-element hist ABI:** `hist_io[32]` = EINT/EPSD/QVIS/RHO×8 so the shared one-hex ELBUF does not leak across elements.
- **Extract JCVT=0 (Jaumann):** despite deck IFRAME=1, OR-ABI with `JCVT=0` matches live OR on coarse fixed-Δt to ~1e-14 Lf / ~1e-12 Rf (E20.13 floor). Extract `JCVT=1` still drifts (~3e-4 Rf). Native adaptive coarse 80 μs after ONEP333/hier DELTAX: ~ulp vs live `.f64bin`.

### Full production mesh (6×6×16, 576 hexes) — TS `jcvt:0` + native CFL

| Compare | Horizon | relLf | relRf | aligned max | notes |
| --- | --- | --- | --- | --- | --- |
| TS ↔ live `.f64bin` | 80 μs CFL=0.9 | ~3.3e-15 | ~6.2e-15 | ~2.9e-16 | DT₀ Object.is; 2573 steps; few-ulp floor |
| OR-ABI ↔ TS `jcvt:0` | 80 μs CFL=0.9 | ~1e-15 | ~3e-15 | ~2e-16 | same step count (pre-ONEP333 evidence) |

Gates require ≤1×10⁻¹³ relative. `bitwiseEqual` / `coordsBitwiseEqual` remain false by a few ulps — last force/DT micro-drift, not the old ~1e-5 CFL phase.

### Short-horizon Object.is (gated) + MVSIZ floor

With `/DTIX` export + `selectEndTimeSta` preferring the earliest STATE dump
(not last-anim / TSTOP overshoot), coarse 2×2×4 fixed Δt=2.5e-8:

| Steps | TS ↔ live `.f64bin` | OR-ABI (NEL=1) ↔ live | TS ↔ C-mirror |
| --- | --- | --- | --- |
| 1–2 | **Object.is** (vitest) | **Object.is** | Object.is |
| ≥3 | false (~1 ulp, 2 dofs) | false (~1 ulp, more dofs) | Object.is |

First TS↔live break is a degree-2 cylinder-corner node. SCUMU3 vs
element-major assemble cannot explain it (IEEE `a+b==b+a` for two terms).
Live engine packs **NEL=min(128,NUMELS)** into one `S8EFORC3` (`forint.F` /
`mvsiz_p.inc`); one-hex OR-ABI and TS share a **scalar** contraction order.

### Multi-NEL PoC (`WMBD_OR_CALL_S8E=1`, coarse 2×2×4, fixed Δt=2.5e-8)

`wmbd_mesh_internal_forces_or` packs all **16** hexes into one `S8EFORC3`
(`or_mesh_force.F90`, probe `scripts/mvsiz-nel16-probe.ts`, results
`docs/research/mvsiz-nel16-probe.json`):

| Steps | TS ↔ live | OR NEL=1 ↔ live | OR NEL=16 ↔ live | OR NEL=1 ↔ NEL=16 |
| --- | --- | --- | --- | --- |
| 1–2 | Object.is | Object.is | Object.is | Object.is |
| ≥3 | false (2 dofs, 1 ulp) | false (8 dofs, 1 ulp) | false (8 dofs, **same**) | **Object.is** |

**NEL=16 ≡ NEL=1** — MVSIZ packet width alone is not the floor.

### Step 2→3 transition (`scripts/step23-divergence-probe.ts`)

Evidence in `docs/research/step23-divergence-probe.json`:

| Check | Result |
| --- | --- |
| First-diff nodes (18/20/24/26) | Mid-bar **z=0.0162**, **not** impact face (z=0) |
| IXS `/BRICK` vs web-mbd hexes | **Exact match** (16 elems) |
| Lumped mass vs starter TOTAL MASS | **Object.is** (`8.379949843016425e-3`) |
| Per-node mass vs live `NODES%MS` | **Object.is** after `hexVolumeRadiossCenter` (`S8ZDERIC3` `ONE_OVER_64·det(AJ)`); prior iso-GP sum was 1 ulp/node |
| **No RWALL** (live starter stripped; web-mbd wall → z=−1e6) @ 3 steps | **TS ↔ live Object.is**; free-flight `X0+V0·t` exact |
| With RWALL @ 3 steps | TS: 2 dofs / 1 ulp (node 26 x,y); OR: 8 dofs |
| TS vs OR nodal F @ step 2 (coords still Object.is) | All 135 dofs differ (~1e-9 N) — force noise under wall-driven V |

### Live A/V dumps after ACCELE / RGWALL (`scripts/av-dump-forint-probe.ts`)

Patched `resol.F` (`docs/research/or-patches/resol.av-dump.patch`) writes host float64
`wmbd_postaccele_{0,1,2}.f64bin` and `wmbd_postwall_{0,1,2}.f64bin` (copies under
`docs/research/av-dumps/`). Layout: `i32 NCYCLE, NUMNOD` + `f64 DT1,DT2,DT12` + per
node `i32 ITAB` + `A[3],V[3],X[3],MS`.

| Finding | Evidence |
| --- | --- |
| **Cold DT1=0** on NCYCLE=0 | Live `DT1=0`, `DT12=DT2/2=1.25e-8`. web-mbd had wrongly seeded `DT1=DT2` → `DT12=DT2`. **Fixed** in `solver.ts` (`dt1=0`). DT1/DT2/DT12 now Object.is for NCYCLE 0..2. |
| Mid-cycle **X** Object.is through NCYCLE=2 | Break appears only after integrating cycle 2 (end STATE). |
| NCYCLE=0 **A** | With constitutive **DT1** (below): TS A≈0; live ~10⁻³⁰. (Previously TS ‖A‖~1.5×10⁻⁹ from integrating G·DT2 on cycle 0.) |
| NCYCLE=1 face **A** | ‖A‖~10⁷; TS↔live ~10⁻¹³ relative (~7×10⁻⁷ abs on Aₓ). Wall strips A_z / V_z on 9 impact nodes identically. |
| NCYCLE=2 mid-bar **A** (nodes 18/26) | ‖A‖~4793; TS↔live ~10⁻¹⁰ relative (~10⁻⁶ abs) — enough to push end-of-step X across 1 ulp. |
| V after cycle 0 | Still Object.is (A·DT12 underflows). V drifts from NCYCLE=1. |

### Per-GP SIG / rate dumps (`scripts/gpsig-forint-probe.ts`)

Patched `s8eforc3.F` (`docs/research/or-patches/s8eforc3.gpsig-dump.patch`) writes
`wmbd_gpsig_{0,1,2}.f64bin` after each GP’s `S8EFMOY3`: `DXX..D6`, `SIG(6)`, PLA,
QVIS, EPSD, VOL, RHO, AMU, EINT. Copies in `docs/research/gpsig-dumps/`.

| Quantity @ NCYCLE | Result |
| --- | --- |
| **Constitutive DT** | Live `m2law.F:195` `G1=DT1*G`. Cycle 0 DT1=0 ⇒ **SIG stays 0**. web-mbd was passing **DT2** into `hexInternalForces` → ~1e-9 Pa SIG under rigid V₀. **Fixed**: FORINT now uses `dt1` (`solver.ts`). |
| SIG @ NCYCLE=0 | **Object.is** (all GPs) after DT1 fix |
| D @ NCYCLE=0 | Still ~1e-12 noise / sign flips after `s8edefo3` left-to-right `P·V` + engineering D4 |
| **VOL @ NCYCLE=0** | 124/128 GPs differ (~2e-24 abs / ~3e-16 rel) — **iso `det(J)` vs live hierarchical `DETDP=ONE_OVER_512·det(AJ)`** |
| SIG diagonals @ NCYCLE=1 impact GPs | **Object.is** (e.g. eid1 ip1); other GPs ~1e-12 relative (~3e-5 Pa hydrostatic) |
| Shear D / SIG @ NCYCLE=1 | ~1e-12 / ~1e-9 residual — first post-force divergence |
| PLA | Object.is (still 0 through 3 cycles) |
| QVIS | Deck QA=1e-20, QB=1e-21; live ~1e-12 vs TS 0 — negligible vs ‖σ‖~1e8 |
| Hourglass | GEO QH=0 — not active |

### `s8edefo3` GradN·v association (landed)

web-mbd `hexInternalForces` / C `force_kernel.c` now mirror live `s8edefo3`
(`I_SH==0`, `ICP≠11`):

1. Off-diagonal then diagonal velocity gradients as separate left-to-right `P·V` sums
2. Engineering shear `D4=DXY+DYX` (not `½(Lxy+Lyx)`), constitutive `G·DT·D4` like M2LAW

Fixed-Δt after this change (`docs/research/step1-5-object-is.json` /
`step23-divergence-probe.json`):

| Steps | coords Object.is | metrics Object.is | nDiff / maxAbs |
| --- | --- | --- | --- |
| 1–2 | **true** | **true** | 0 |
| ≥3 | **false** | **true** | 2 dofs / 1 ulp (node 26 x,y) — unchanged |

GP dump after the change still shows D/VOL noise at NCYCLE=0. **Association
order alone did not close step-3 Object.is.**

**Conclusion:** mass Object.is + DT1 constitutive + `s8edefo3` rate assembly are
in. Remaining floor is **hierarchical GP Jacobian / GradN** (`s8ejacip3` →
`s8ederipr3` DETDP + AJI → PX) vs web-mbd isoparametric `jacobian`/`gradN`.
VOL already differs at rest (~1e-15 rel) ⇒ D ~ V·ΔGradN ~ 1e-12 under wall-driven
V ⇒ A noise ⇒ 1 ulp on X by step 3. OR-ABI extract also fails step≥3.

**Next bisect:** drive FORINT GradN + GP volume from hierarchical AJ (reuse
`characteristicLengthSmax` AJ build / `S8EDERIPR3` inverse), not isoparametric
`det(J)`. Production adaptive Object.is remains open.

Also: when `/DTIX` equals TSTOP, OpenRadioss may take one extra cycle past
endTime and force-write a second `.sta` — always use `_0001` for parity.
