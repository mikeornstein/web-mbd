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
5. **Compare** — float64 restart / TH probes, not anim float32 VTK, for the
   final `Object.is` gate.

## Build (C smoke kernel)

```bash
cc -O2 -fPIC -shared -o libforce_kernel.so force_kernel.c -lm
```

See `force_kernel.h` for the ABI.
