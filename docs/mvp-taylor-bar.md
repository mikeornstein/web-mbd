# Taylor bar MVP

First end-to-end explicit solid model for web-mbd.

## What it proves

- Typed `ModelIR` (nodes, hex mesh, J2 linear hardening, rigid wall, ICs)
- Explicit central-difference solver (TypeScript reference path)
- Full-integration hex aligned to OpenRadioss H8C (`Isolid=17`, `Icpre=1`,
  `Iframe=1`, `Ismstr=4`) + LAW2 / PLAS_JOHNS
- Shape metrics: \(L_f/L_0\), \(R_f/R_0\), axial shortening, max \(|u|\), max \(\bar\varepsilon^p\)
- Deterministic repeats (bitwise-stable self runs)
- **Same-mesh OpenRadioss bitwise oracle** (`Object.is` on metrics + ID-aligned
  coords via `pnpm oracle:taylor`)

## Run

```bash
pnpm install
pnpm test
pnpm taylor
# Live oracle (needs patched OpenRadioss linux64 + OPENRADIOSS_PATH):
export OPENRADIOSS_PATH=/path/to/OpenRadioss
pnpm oracle:taylor
```

Default oracle path: OR-mesh `S8EFORC3` + SCUMU3 + starter `NODES%MS` from the
same run; **requires** `bitwiseEqual` and `coordsBitwiseEqual`. Set
`WMBD_OR_MESH=0` for the TypeScript force backend (ulp floor, gates ≤1e-13).

## Fixture

`src/fixtures/taylorBar.ts` — OFHC-copper-like bar:

| Quantity | Value |
| --- | --- |
| L₀ | 32.4 mm |
| R₀ | 3.2 mm |
| V₀ | 227 m/s into wall at z = 0 |
| E, ν, σ_y, H | 117 GPa, 0.35, 400 MPa, 100 MPa |
| ρ | 8930 kg/m³ |
| Default mesh | structured square→disk hex, **nSide=6, nZ=16** (576 hexes) |
| CFL | 0.9 + adaptive dt (`128·V·SMAX` DELTAX) |
| Wall | kinematic (`/RWALL` style) |

Acceptance: L_f/L₀ ∈ [0.65, 0.69], R_f/R₀ ∈ [2.15, 2.35], \|energy error\| ≤ 5%,
max \(\bar\varepsilon^p\) ∈ [0.5, 8], bitwise-stable self repeats.

Pinned oracle (`src/oracle/taylor-bar-oracle.json`): production adaptive
**Object.is** vs host `.f64bin` (`alignedMax: 0`).

See `docs/research/09-oracle-bitwise-floor.md` and
`docs/research/or-f64bin-host-dump.md`.

## Element / mesh notes

- **Element:** 8-node hex, 2×2×2 Gauss, Jaumann default (`jcvt: 0`), LAW2 + bulk
  EOS, Icpre DSV + ZEP3 + PXC, kinematic rigid wall.
- **CFL / time:** Radioss DELTAX, scale 0.9, `resol` order, `DT12=½(DT1+DT2)`.
- **Mesh:** `src/mesh/cylinderHex.ts` (square→disk, extruded Z).

## Layout

```
src/ir/           Model IR + validation
src/fe/           hex, J2/LAW2, rigid wall, explicit solver
src/mesh/         cylinder hex generator
src/fixtures/     Taylor bar model
src/oracle/       Radioss export, .f64bin/.sta parse, pinned compare
src/cli/          headless runner + OpenRadioss driver + OR-mesh force
native/           C mirror + OpenRadioss extract (libwmbd_or_hex.so)
tests/            vitest (incl. Object.is gates)
scripts/          kept live-OR probes (see floor doc)
```
