# Shared force kernel (bitwise oracle path)

Goal: one compiled H8C + LAW2 (+ RWALL kinematics) force evaluation used by
web-mbd's central-difference loop so nodal state can `Object.is`-match
OpenRadioss at production CFL.

## Why

Fine fixed-DT experiments (`docs/research/09-oracle-bitwise-floor.md`) show the
remaining ~5×10⁻⁶ adaptive residual is TypeScript↔gfortran truncation / FP
contraction, not a missing formulation term. Independent kernels will not match
IEEE bits.

## Plan

1. **Boundary** — keep `hexInternalForces` / `j2Update` / `applyRigidWallKinematic`
   as the sole force API the solver calls (done in `src/fe/`).
2. **C mirror** — `force_kernel.c` ports the TS force path 1:1 for FFI smoke
   tests (TS↔C `Object.is` on one element proves the loader).
3. **OR extract** — replace the C mirror with a thin wrapper around OpenRadioss
   `s8eforc3` + `m2law` + `rgwall` (or call a prebuilt OR object archive).
4. **Wire** — optional `SolveOptions.forceBackend: "ts" | "native"`; default TS
   until the OR extract is validated.
5. **Compare** — float64 `/STATE/DT/ALL` `.sta` (`stat_node.F` E20.13), not
   anim float32 VTK, for the final `Object.is` gate (wired in
   `src/oracle/shapeFromSta.ts` + oracle runner).

## OpenRadioss Fortran extract (next)

OpenRadioss engine is a single CMake Fortran/C/C++ glob of the whole tree — there is
no prebuilt `libs8e.a`. A bitwise OR force backend needs one of:

1. **Thin engine object link** — build `engine_linux64_gf` from `/tmp/OpenRadioss-src`
   with `-fPIC`, archive `s8eforc3` + `m2law` + deps into `libor_h8c.so`, and adapt
   `wmbd_hex_internal_forces` to pack/unpack OR's MVSIZ element buffers (largest
   effort: ELBUF / mat_param / common blocks).
2. **Restart-step probe** — instrument a debug OR build to dump per-cycle nodal
   `A` after FORINT for the Taylor deck; use as a regression oracle while (1) lands.
3. **Keep C mirror** for TS↔native Object.is; treat OR float64 TH/restart compare
   under shared fixed Δt as the interim production gate until (1) is done.

Preferred order: (2) for visibility → (1) for true `Object.is`.
