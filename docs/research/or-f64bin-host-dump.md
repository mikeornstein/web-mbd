# OpenRadioss host float64 node dump (`.f64bin`)

Patched `stat_node.F` writes a STREAM unformatted sibling of each `.sta`:

- File: `ROOT_NNNN.f64bin` (same stem as the `.sta`, via `INQUIRE(IUGEO)`)
- Record: little-endian `int32 ITAB` + `3 × float64` raw `X` (28 bytes/node)
- No E20.13 truncation; tinier underflows than the `.sta` 1e-90 wipe may remain

## Apply patch (local OpenRadioss tree)

```bash
# Against OpenRadioss engine source matching the oracle binary:
patch -p1 < docs/research/or-patches/stat_node.f64bin.patch   # .f64bin nodes
patch -p1 < docs/research/or-patches/ecrit.dt-f64bin.patch     # .f64bin DT schedule
#
# Build (example):
cd "$OPENRADIOSS_SRC/engine"
./build_script.sh -arch=linux64_gf -no-python -nt=$(nproc)
# If -no-python stubs miss symbols, complete the PYTHON_DISABLED dummies in
# common_source/modules/cpp_python_funct.cpp (stock stubs omit several ABIs).
cp cbuild_engine_linux64_gf/engine_linux64_gf "$OPENRADIOSS_PATH/exec/"
```

web-mbd prefers `.f64bin` beside the selected endTime `.sta` when present
(`src/cli/openRadiossRunner.ts`, `coordSource: "f64bin"`).
Replay live DT with `scripts/replay-or-dt-schedule.ts`.

## Early-cycle A/V dump (`resol.av-dump.patch`)

Patched `resol.F` also writes, for `NCYCLE<=2` and `ISPMD==0`:

- `wmbd_postaccele_N.f64bin` — after `ACCELE` (A = F/m, pre-RGWALL)
- `wmbd_postwall_N.f64bin` — after `RGWAL0`

Header: `int32 NCYCLE, NUMNOD` + `float64 DT1, DT2, DT12`.
Per node: `int32 ITAB` + `3×A` + `3×V` + `3×X` + `MS` (little-endian STREAM).

```bash
patch -p1 < docs/research/or-patches/resol.av-dump.patch
# rebuild engine, then:
OPENRADIOSS_PATH=... pnpm exec tsx scripts/av-dump-forint-probe.ts
```

Proven vs live dumps: first-cycle **DT1=0 / DT12=DT2/2** (web-mbd `solver.ts`
now matches); NCYCLE=0 rigid-translation A cancels in live (~1e-30) but not in
TS (~1e-9); face A after wall ~1e-13 relative; mid-bar A at NCYCLE=2 ~1e-10
relative — see `docs/research/09-oracle-bitwise-floor.md`.

## Object.is prerequisites

1. **Same X0:** snap web-mbd mesh through `formatRadiossF20` (`createTaylorBarModel`).
2. **Near-zero scrub:** `scrubNearZeros(..., 1e-18)` on both sides before
   `alignedCoordGap` (`shapeFromF64bin.ts`).
3. **Shared force path + matched DT:** fixed Δt, short horizon — 1×Δt OR-ABI vs
   live `.f64bin` reaches metrics+coords `Object.is`. Adaptive CFL=0.9 at 80 μs
   remains ~1e-5 relative (phase), not closed by the host dump alone.
4. **Cold DT1=0:** first-cycle `DT12=½ DT2` (not seeded `DT1=DT2`).
