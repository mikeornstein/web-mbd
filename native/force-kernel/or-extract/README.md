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
| OR `s8eforc3`/`m2law` behind ABI | **libwmbd_or_hex.so** = PIC engine objects + BIND(C) wrapper; `/COM08/` DT1 shared; **ELBUF/IPARG/PM packing TODO** (entry returns `-1`) |

## Build SHARED extract (in progress)

```bash
# One-time: OpenRadioss_extlib v75 under /tmp/OpenRadioss-src/extlib
./build-shared-engine.sh   # → libor_h8c.so (PIC), log in build/build.log
./relink-or-hex.sh         # → libwmbd_or_hex.so (OR objects + BIND(C) wrapper)
cc -O2 -o build/smoke_or_hex smoke_or_hex.c -ldl
./build/smoke_or_hex build/libwmbd_or_hex.so   # BIND(C) + shared /COM08/ DT1
```

**Commons must be in the same `.so` as `s8eforc3_`.** A separate wrapper `.so`
that `#include`s `com08_c.inc` gets its own BSS copy of `/COM08/` — `DT1` writes
do not reach the engine. `relink-or-hex.sh` re-links the engine object list plus
`or_hex_force.F90` / `wmbd_or_com08.c` into `libwmbd_or_hex.so`.

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
/* or_bridge.c — packs web-mbd one-hex state into OR MVSIZ element buffers */
int wmbd_hex_internal_forces_or(...);  /* returns 0 on success; -1 until packed */
```

`S8EFORC3` (from `s8eforc3.F`) is **not** a one-hex pure function — first args are:

```
S8EFORC3(TIMERS, OUTPUT, ELBUF_TAB, NG, PM, GEO, … IXS, X, A, V, … IPARG, …)
```

Packing checklist for one Taylor hex group (`NEL=1`, `NPG=8`, LAW2, Isolid=17):

Verified from live starter `TAYLOR_0000.out` (default Taylor deck):

| Flag | Value | Notes |
| --- | --- | --- |
| ISOLID / JHBE | 17 | H8C → `S8EFORC3` |
| ISMSTR | 4 | small strain; `GBUF%SMSTR` live |
| ICPRE | 1 | PXC mean pressure |
| **IFRAME / JCVT** | **1** | **co-rotational** (`SRCOOR3` + `SRROTA3`); **not** Jaumann/`SROTA3` |
| NPT / NPG | 8 | `NPTR=NPTS=NPTT=2` |
| COROTATIONAL SYSTEM FLAG | 1 | starter echo of JCVT |

> web-mbd implements `jcvt: 1` (`SRCOOR3`/`SRROTA3`, `x_local = R x`,
> `F_global = Rᵀ F_local`) but **defaults to `jcvt: 0`** — co-rot still exceeds
> oracle gates (~4e-5 Rf). Pin `jcvt: 0` for Jaumann golden / TS↔C Object.is.
> Shared OR `S8EFORC3` packing remains the path to production `Object.is`.

1. Allocate / zero `ELBUF_TAB(NG)` LBUF: `SIG(6,8)`, `PLA(8)`, volumes
2. Fill `PM` / `MAT_PARAM` LAW2 (ρ, E, ν, a, b, n=1); `uparam(1:11)`, `iparam(1:4)`
3. Fill `GEO` / `IGEO` solid props (Icpre=1, Iframe=1, Ismstr=4)
4. Pack nodal `X`,`V` (and zero `A`) into OR node arrays for 8 ITAB ids
5. Set `DT1` / group `IPARG` flags matching the exported deck (`JCVT=1`)
6. Call `S8EFORC3` (or a thin Fortran wrapper that sets commons first)
7. Scatter `FINT` / updated `SIG`/`PLA` back to `f_out` / `stress_io` / `eqps_io`

**Commons:** wrapper must be relinked into the same `.so` as engine objects
(`relink-or-hex.sh` → `libwmbd_or_hex.so`). A separate `.so` gets a private
`/COM08/` BSS.

**ELBUF alloc:** engine `allocbuf_auto_` reads restart `READ_DB` — not usable
from scratch. Prefer starter-style hand alloc or compile starter `allocbuf_auto`
deps. `wmbd_hex_internal_forces_or` currently sets `DT1` and returns `-1`.

Smokes: `smoke_or_hex` / `tests/or-h8c-symbols.test.ts`.

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
