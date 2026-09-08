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
| OR `s8eforc3`/`m2law` behind ABI | **not linked** — inventory below |

## Build SHARED extract (in progress)

```bash
# One-time: OpenRadioss_extlib v75 under /tmp/OpenRadioss-src/extlib
./build-shared-engine.sh   # → libor_h8c.so (PIC), log in build/build.log
cc -O2 -o smoke_symbols smoke_symbols.c -ldl
./smoke_symbols build/libor_h8c.so   # verifies s8eforc3_ / m2law_ resolve
```

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
double wmbd_hex_internal_forces_or(
    const double x0[24], const double v0[24], const WmbdMat *mat,
    double stress_io[48], double eqps_io[8], double vol0_io[8],
    double dt, double f_out[24]);
```

Required packing (see `s8eforc3.F` / `forint.F`):

- Nodal `X`, `V`, `A` for 8 nodes → MVSIZ-strided OR arrays
- `ELBUF_TAB` LBUF: `SIG(6,NPG)`, `PLA`, `VOL0` / `VOL`
- `MAT_PARAM` / `PM` LAW2 constants (ρ, E, ν, a, b, n=1)
- `GEO` / `IGEO` solid props: Isolid=17, Icpre=1, Iframe=1, Ismstr=4
- `DT1` constitutive step (= web-mbd `dt`)
- Accumulate `FINT` → `f_out`

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
