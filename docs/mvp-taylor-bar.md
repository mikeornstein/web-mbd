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

| | web-mbd | OpenRadioss (host `.f64bin`) | rel. error |
| --- | --- | --- | --- |
| L_f / L₀ | ~0.666562024028488 | ~0.666562024028490 | ~3×10⁻¹⁵ |
| R_f / R₀ | ~2.231889693506488 | ~2.231889693506474 | ~6×10⁻¹⁵ |

Oracle gates (CI uses the pin; live re-run via `pnpm oracle:taylor`):

- \|Δ(L_f/L₀)\| / oracle ≤ 1×10⁻¹³ rel
- \|Δ(R_f/R₀)\| / oracle ≤ 1×10⁻¹³ rel
- Fine fixed-DT live probe (`tests/taylor-fine-dt-parity.test.ts`, needs `OPENRADIOSS_PATH`): ≤ 5×10⁻⁶ rel and NN < 0.1 μm (float64 `.sta`)

**Parity target:** with identical model / inputs / BCs, web-mbd and OpenRadioss should be bitwise identical (`Object.is` on shape metrics and ID-aligned nodal coords). Prefer host `.f64bin` from a patched `stat_node.F` over E20.13 `.sta` (see `docs/research/or-f64bin-host-dump.md`). With F20-snapped X0, near-zero scrub (1e-18), fixed Δt, and OR-ABI `JCVT=0`, **1×Δt metrics+coords are `Object.is` vs live `.f64bin`**. Matching Radioss `ONEP333=1.333` SSP and hierarchical DETDP DELTAX makes **native adaptive DT₀ `Object.is`**. Production 6×6×16 @ 80 μs native CFL vs live `.f64bin` is now ~few ulps (`bitwiseEqual` / `coordsBitwiseEqual` still false; gates require ≤1×10⁻¹³).

**Residual diagnostics (same mesh):**
- Pre-ONEP333 adaptive residual was ~4.5×10⁻⁶ (DT-phase). After SSP/DELTAX alignment, production lands at ~3×10⁻¹⁵ Lf / ~6×10⁻¹⁵ Rf / ~3×10⁻¹⁶ m aligned.
- Plastic **fixed-DT refinement** still useful for formulation checks; true `Object.is` at production CFL needs closing the last ulps (force FP contraction and/or mid-run DT micro-drift). See `docs/research/09-oracle-bitwise-floor.md`.

## Element / mesh notes

- **Element:** 8-node hex, trilinear, **2×2×2 Gauss**, updated Lagrangian, Radioss SROTA3 Jaumann, LAW2-style hypoelastic J2 + bulk EOS pressure, Icpre via DSV vol0 + ZEP3 strip + PXC mid-face pressure forces, kinematic rigid wall.
- **CFL / time:** Radioss `128·V·SMAX` DELTAX, scale 0.9, adaptive with Radioss `resol` order and `DT12=½(DT1+DT2)` velocity update and `DT2 ≤ 1.1·DT2OLD`.
- **Quadrature:** Radioss H8C 2×2×2 order and `PG = 0.577350269189625`.
- **Mesh:** `src/mesh/cylinderHex.ts` structured generator (square mapped to disk, extruded in Z). Gmsh is still future work.

## Layout

```
src/ir/           Model IR + validation
src/fe/           hex, J2/LAW2, rigid wall, explicit solver
src/mesh/         cylinder hex generator
src/fixtures/     Taylor bar model
src/research/     stock models from research notes
src/oracle/       Radioss export, `.sta`/VTK shape parse, pinned compare
src/ui/           browser workbench (pre / solve / post)
src/viz/          canvas mesh + energy plots
src/cli/          headless runner + OpenRadioss driver
tests/            vitest golden + determinism + oracle pin
e2e/              Playwright workbench proof
```
