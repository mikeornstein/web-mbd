# Taylor bar MVP

First end-to-end explicit solid model for web-mbd.

## What it proves

- Typed `ModelIR` (nodes, hex mesh, J2 linear hardening, rigid wall, ICs)
- Explicit central-difference solver (TypeScript / WASM-ready reference path)
- Full-integration hex aligned toward OpenRadioss H8C (`Isolid=17`, `Icpre=1`, `Iframe=1`, `Ismstr=4`) + LAW2 / PLAS_JOHNS
- Shape metrics: \(L_f/L_0\), \(R_f/R_0\), axial shortening, max \(|u|\), max \(\bar\varepsilon^p\)
- Deterministic repeats (bitwise-stable self runs)
- Same-mesh OpenRadioss oracle compare (live via `pnpm oracle:taylor`)

## Run

```bash
pnpm install
pnpm test
pnpm taylor
# Optional live oracle (needs OpenRadioss linux64 package):
export OPENRADIOSS_PATH=/path/to/OpenRadioss
pnpm oracle:taylor
```

## Fixture

`src/fixtures/taylorBar.ts` — OFHC-copper-like bar:

| Quantity | Value |
| --- | --- |
| L₀ | 32.4 mm |
| R₀ | 3.2 mm |
| V₀ | 227 m/s into wall at z = 0 |
| E, ν, σ_y, H | 117 GPa, 0.35, 400 MPa, 100 MPa |
| ρ | 8930 kg/m³ |
| Default mesh | structured square→disk hex, **nSide=6, nZ=16** (576 hexes) — **not Gmsh** |
| CFL | 0.9 (Radioss `/DT` + `128·V·SMAX` DELTAX) + adaptive dt |
| Wall | kinematic (Radioss `/RWALL` style) |

Acceptance (refined mesh, H8C/LAW2-aligned):

- L_f / L₀ ∈ [0.65, 0.69]
- R_f / R₀ ∈ [2.15, 2.35]
- \|energy error\| ≤ 5%
- max \(\bar\varepsilon^p\) ∈ [0.5, 8]
- Bitwise-stable metrics across repeated runs

Pinned OpenRadioss same-mesh oracle (`src/oracle/taylor-bar-oracle.json`):

| | web-mbd | OpenRadioss | rel. error |
| --- | --- | --- | --- |
| L_f / L₀ | ~0.6667 | ~0.6666 | ~0.02% |
| R_f / R₀ | ~2.246 | ~2.232 | ~0.6% |

Oracle gates (CI uses the pin; live re-run via `pnpm oracle:taylor`):

- \|Δ(L_f/L₀)\| / oracle ≤ 0.5%
- \|Δ(R_f/R₀)\| / oracle ≤ 2%

**Parity target:** with identical model / inputs / BCs, web-mbd and OpenRadioss should be bitwise identical (`Object.is` on shape metrics and nearest-neighbor–matched nodal coords). Current residual is ~0.6% foot radius after H8C PXC Icpre force path + SMAX `/DT` length (initial dt matches OR to ~0.01%; ~2559 vs ~2606 cycles). Remaining work: strain-side mean-dilatation volume correction (`s8edefo3` DSV) and finer RWALL/foot timing.

## Element / mesh notes

- **Element:** 8-node hex, trilinear, **2×2×2 Gauss**, updated Lagrangian, Radioss SROTA3 Jaumann, LAW2-style hypoelastic J2 + bulk EOS pressure, Icpre via ZEP3 strip + PXC mid-face pressure forces, kinematic rigid wall.
- **CFL:** Radioss `128·V·SMAX` DELTAX (not ∛V / min-edge), scale 0.9, adaptive.
- **Mesh:** `src/mesh/cylinderHex.ts` structured generator (square mapped to disk, extruded in Z). Gmsh is still future work.

## Layout

```
src/ir/           Model IR + validation
src/fe/           hex, J2/LAW2, rigid wall, explicit solver
src/mesh/         cylinder hex generator
src/fixtures/     Taylor bar model
src/research/     stock models from research notes
src/oracle/       Radioss export, VTK shape parse, pinned compare
src/ui/           browser workbench (pre / solve / post)
src/viz/          canvas mesh + energy plots
src/cli/          headless runner + OpenRadioss driver
tests/            vitest golden + determinism + oracle pin
e2e/              Playwright workbench proof
```
