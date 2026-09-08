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
| OR `s8eforc3`/`m2law` behind ABI | **libor_h8c.so built** (PIC SHARED); symbols resolve via smoke test; MVSIZ packing TODO |

## Build SHARED extract (in progress)

```bash
# One-time: OpenRadioss_extlib v75 under /tmp/OpenRadioss-src/extlib
./build-shared-engine.sh   # → libor_h8c.so (PIC), log in build/build.log
cc -O2 -o smoke_symbols smoke_symbols.c -ldl
./smoke_symbols build/libor_h8c.so   # verifies s8eforc3_ / m2law_ (preloads libgomp)
```

`libor_h8c.so` leaves OpenMP unresolved (`omp_init_lock_`); the smoke test
`dlopen`s `libgomp.so.1` with `RTLD_GLOBAL` first. Relink with `-lgomp` is a
follow-up if we want a self-contained shared object.

Stock release `engine_linux64_gf` is ELF `EXEC` and cannot be `dlopen`ed; the
shared rebuild is required.

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

1. Allocate / zero `ELBUF_TAB(NG)` LBUF: `SIG(6,8)`, `PLA(8)`, volumes
2. Fill `PM` / `MAT_PARAM` LAW2 (ρ, E, ν, a, b, n=1)
3. Fill `GEO` / `IGEO` solid props (Icpre=1, Iframe=1, Ismstr=4)
4. Pack nodal `X`,`V` (and zero `A`) into OR node arrays for 8 ITAB ids
5. Set `DT1` / group `IPARG` flags matching the exported deck
6. Call `S8EFORC3` (or a thin Fortran wrapper that sets commons first)
7. Scatter `FINT` / updated `SIG`/`PLA` back to `f_out` / `stress_io` / `eqps_io`

Stub: `or_bridge.c` currently returns `-1`. Symbols in `libor_h8c.so` are verified
by `smoke_symbols` / `tests/or-h8c-symbols.test.ts`.

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
