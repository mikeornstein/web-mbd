# OpenRadioss H8C force extract

Goal: replace `force_kernel.c` body with OpenRadioss `s8eforc3` + `m2law`
behind the existing `wmbd_hex_internal_forces` ABI so the web-mbd CD loop can
`Object.is`-match live OR at production CFL.

## Why not element_sandbox

`tools/mockup/element_sandbox` is **shell** LAW2 only (`shell_computation.F` →
`law2_computation.F`). Taylor needs **H8C solids** (`solide8e/s8eforc3.F` →
`mmain` → `m2law.F`).

## Status

| Layer | Status |
| --- | --- |
| TS ↔ C mirror `Object.is` | done (`force_kernel.c`, golden + solver FFI) |
| Float64 OR state compare (`.sta`) | done (`shapeFromSta`, oracle runner) |
| OR `s8eforc3`/`m2law` behind ABI | **libwmbd_or_hex.so** packs one-hex ELBUF/IPARG/PM/GEO via starter `WMBD_ALLOCBUF_AUTO`; default rc=`-2`; `WMBD_OR_CALL_S8E=1` calls `S8EFORC3` and returns forces (near-match vs C mirror on unit cube) |

## Build SHARED extract (in progress)

```bash
# One-time: OpenRadioss_extlib v75 under /tmp/OpenRadioss-src/extlib
./build-shared-engine.sh   # → libor_h8c.so (PIC), log in build/build.log
./relink-or-hex.sh         # → libwmbd_or_hex.so (OR objects + pack + BIND(C))
cc -O2 -o build/smoke_or_hex smoke_or_hex.c -ldl -lm
./build/smoke_or_hex build/libwmbd_or_hex.so              # pack rc=-2 + shared DT1
WMBD_OR_CALL_S8E=1 ./build/smoke_or_hex build/libwmbd_or_hex.so  # call S8EFORC3
```

**Commons must be in the same `.so` as `s8eforc3_`.** A separate wrapper `.so`
that `#include`s `com08_c.inc` gets its own BSS copy of `/COM08/` — `DT1` writes
do not reach the engine. `relink-or-hex.sh` re-links the engine object list plus
`or_hex_commons.F`, starter `WMBD_ALLOCBUF_AUTO`, `or_hex_force.F90`, and
`wmbd_or_com08.c` into `libwmbd_or_hex.so`.

`libgomp.so.1` must still be `dlopen`ed with `RTLD_GLOBAL` before the hex lib
(OpenMP symbols). Stock release `engine_linux64_gf` is ELF `EXEC` and cannot be
`dlopen`ed.

## Extract options (preferred order)

1. **PIC object archive from engine build** — build `engine_linux64_gf` from
   `/tmp/OpenRadioss-src` with `-fPIC`, archive the call tree of `s8eforc3` +
   `m2law` into `libor_h8c.so`, wrap with `or_bridge.c` that packs one hex into
   MVSIZ buffers and calls `S8EFORC3` / material path.
2. **Restart-step probe** — dump per-cycle nodal `A` after FORINT from a debug
   OR build; regression oracle while (1) lands.
3. Keep C mirror for TS↔native; float64 `.sta` gates stay relative until (1).

## ABI bridge sketch

```c
/* BIND(C) in or_hex_force.F90 */
int wmbd_hex_internal_forces_or(...);
/* rc: 0 = S8E ran; -2 = packed only; -4 = alloc fail */
```

`S8EFORC3` is **not** a one-hex pure function — first args are:

```
S8EFORC3(TIMERS, OUTPUT, ELBUF_TAB, NG, PM, GEO, … IXS, X, A, V, … IPARG, …)
```

Packing for one Taylor hex (`NEL=1`, `NPG=8`, LAW2, Isolid=17) — **implemented**:

| Flag | Value | Notes |
| --- | --- | --- |
| ISOLID / JHBE | 17 | H8C → `S8EFORC3` |
| ISMSTR | 4 | `GBUF%SMSTR` |
| ICPRE | 1 | PXC mean pressure |
| **IFRAME / JCVT** | **0** (extract default) | Live deck sets IFRAME=1, but Jaumann (JCVT=0) matches live OR Taylor to ~1e-14 at fixed DT; extract co-rot pack still drifts. Set `JCVT=1` in commons only when co-rot packing is fixed. |
| NPT / NPG | 8 | `NPTR=NPTS=NPTT=2` |

Done in `or_hex_force.F90` / `or_hex_commons.F`:

1. `WMBD_OR_INIT_COMMONS` — PARAM/COM01/COM04/VECT01/PARIT/TIMERI
2. Hand-tag ELBUF + starter **`WMBD_ALLOCBUF_AUTO`** (engine `allocbuf_auto_` is restart-only)
3. Pack `PM`/`MAT_PARAM` LAW2, `GEO`/`IGEO`, `IXS`, `X`/`V`, LBUF `SIG`/`PLA`/`VOL`
4. Opt-in `WMBD_OR_CALL_S8E=1` → `S8EFORC3`; scatter `-(F11..F38)` into `f_out` (OR FORINT sign)
5. Unit-cube smoke: `||F||` matches C-mirror `jcvt=1` to ~1e-14 relative after sign flip
6. CD via koffi: `hexInternalForcesOr` → `wmbd_hex_internal_forces_or_pthread` (persistent 64 MiB-stack worker; Node JS thread is too small for S8E MVSIZ locals) with per-element SMSTR/OFF cache. One-shot create/join was ~100× too slow for production Taylor.
7. **GP pack/scatter order** must use OR’s `IP = IR + ((IS-1)+(IT-1)*NPTS)*NPTR` (ξ / IR fastest = `RADIOSS_GAUSS`). Nesting `IR→IS→IT` with `ip++` permutes state and blew up Rf / collapsed CFL; fixed.
8. **MAT_PARAM / PM** match `hm_read_mat02_jc` (IFORM=0 JC, ICC=1, VP=2, EPS0=1, PMIN=−EP20).
9. **`hist_io[32]`** persists LBUF EINT/EPSD/QVIS/RHO per element through koffi (shared ELBUF otherwise leaks across hexes).

Coarse Taylor (2×2×4) after GP fix + **extract JCVT=0**:

| Compare | t | relLf | relRf | notes |
| --- | --- | --- | --- | --- |
| OR-ABI vs TS `jcvt:0` | 80 μs fixed Δt | ~1e-15 | ~1e-15 | near `Object.is` |
| OR-ABI vs live `.sta` | 80 μs fixed Δt | ~2e-14 | ~1e-12 | E20.13 floor |
| OR-ABI vs live `.sta` | 80 μs CFL=0.9 | ~9e-6 | ~6e-6 | within production gates |

Extract `JCVT=1` (deck IFRAME) still drifts vs live (~3e-4 Rf) — co-rot packing/frame residual; default extract stays Jaumann until that is fixed.

Remaining for production `Object.is` on full Taylor:

- Same-mesh adaptive CFL: share DT schedule or drive production mesh through OR-ABI JCVT=0 and re-pin
- Prefer in-process float64 compare (not `.sta` E20.13)
- Optional: fix extract co-rot (`JCVT=1`) to match deck IFRAME literally

Smokes: `smoke_or_hex` / `tests/or-h8c-symbols.test.ts` / `tests/force-or-solver.test.ts`.

## Dependency inventory

Run from a machine with the OR source tree:

```bash
./inventory-deps.sh /tmp/OpenRadioss-src
```

Lists Fortran units directly referenced by `s8eforc3.F` and `m2law.F` (first
hop). Full transitive closure is large (commons, `mmain`, viscosity, …) — expect
to link a substantial engine subset or the whole `engine` objects with `-fPIC`.

## Non-goals

- Do not substitute OR nodal results into the web-mbd solver to fake parity.
- Do not use anim float32 VTK for the final `Object.is` gate (use `.sta`).
