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
| L_f / L₀ | ~0.666559 | ~0.666562 | ~0.0004% |
| R_f / R₀ | ~2.231901 | ~2.231890 | ~0.0005% |

Oracle gates (CI uses the pin; live re-run via `pnpm oracle:taylor`):

- \|Δ(L_f/L₀)\| / oracle ≤ 0.001% (1×10⁻⁵ rel)
- \|Δ(R_f/R₀)\| / oracle ≤ 0.002% (2×10⁻⁵ rel)
- Fine fixed-DT live probe (`tests/taylor-fine-dt-parity.test.ts`, needs `OPENRADIOSS_PATH`): ≤ 5×10⁻⁶ rel and NN < 0.1 μm

**Parity target:** with identical model / inputs / BCs, web-mbd and OpenRadioss should be bitwise identical (`Object.is` on shape metrics and nearest-neighbor–matched nodal coords). Current CFL=0.9 adaptive residual is ~0.0005% Rf / ~0.0004% Lf (~0.14 μm max nearest-neighbor nodal gap; `bitwiseEqual: false`) after matching Radioss `resol` CD order (FORINT→DT12→RWALL→V→X, no double-kick), infinite-plane `/RWALL` ITIED=0 (`rgwall.F`), H8C PXC Icpre, SMAX `/DT`, DSV `vol0`, Radioss variable-dt (`DT12=½(DT1+DT2)`, `DT2≤1.1·DT2OLD`), and Radioss PG quadrature. Adaptive DT tracks OpenRadioss within ~0.01% mean; lockstep with printed OR DT2 does not close the residual.

**Residual diagnostics (same mesh):**
- Mid-run anims (20/40/60/80 μs): relative Lf error peaks near **60 μs** (~0.007%) then shrinks by 80 μs; NN peaks ~1.8 μm at 60 μs → ~0.14 μm at end.
- Elastic-only + shared fixed DT already sits near the anim float32 floor.
- Plastic **fixed-DT refinement** (both codes): at Δt=5×10⁻⁸ residual ~3×10⁻⁵; at Δt=2.5×10⁻⁸ → ~1×10⁻⁶ Lf / ~3×10⁻⁷ Rf / ~0.05 μm NN. So the CFL=0.9 gap is primarily **independent truncation / FP contraction** between TypeScript and gfortran, not a missing constitutive or contact term (Grad N hierarchical vs isoparametric agree to ~1e-15).
- Same-algorithm element-order FP noise alone is ~1e-15. True `Object.is` at production CFL still requires a **shared compiled force kernel** (OR H8C/LAW2 path callable from the web-mbd CD loop). See `docs/research/09-oracle-bitwise-floor.md`.

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
src/oracle/       Radioss export, VTK shape parse, pinned compare
src/ui/           browser workbench (pre / solve / post)
src/viz/          canvas mesh + energy plots
src/cli/          headless runner + OpenRadioss driver
tests/            vitest golden + determinism + oracle pin
e2e/              Playwright workbench proof
```
