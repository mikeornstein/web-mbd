# Taylor bar MVP

First end-to-end explicit solid model for web-mbd.

## What it proves

- Typed `ModelIR` (nodes, hex mesh, J2 linear hardening, rigid wall, ICs)
- Explicit central-difference solver (TypeScript / WASM-ready reference path)
- Full-integration hex + Wilkins bulk viscosity, lumped mass, CFL timestep, energy ledger
- Shape metrics: \(L_f/L_0\), \(R_f/R_0\), axial shortening, max \(|u|\), max \(\bar\varepsilon^p\)
- Deterministic repeats
- Tightened quantitative gates + **same-mesh OpenRadioss oracle compare**

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
| CFL | 0.2 |

Acceptance (refined mesh):

- L_f / L₀ ∈ [0.59, 0.64]
- R_f / R₀ ∈ [1.35, 1.55]
- \|energy error\| ≤ 5%
- max \(\bar\varepsilon^p\) ∈ [0.5, 8]
- Bitwise-stable metrics across repeated runs

Pinned OpenRadioss same-mesh oracle (`src/oracle/taylor-bar-oracle.json`):

| | web-mbd | OpenRadioss | rel. error |
| --- | --- | --- | --- |
| L_f / L₀ | ~0.618 | ~0.667 | ~7% |
| R_f / R₀ | ~1.47 | ~2.23 | ~34% |

Oracle gates (CI uses the pin; live re-run via `pnpm oracle:taylor`):

- \|Δ(L_f/L₀)\| / oracle ≤ 12%
- \|Δ(R_f/R₀)\| / oracle ≤ 45%

Foot-radius disagreement is expected for now: penalty rigid wall + hypoelastic J2 vs Radioss `/RWALL` + `PLAS_JOHNS` (n=1) on `Isolid=17`. Length agrees much more closely. Tighten radius further as contact/HG align.

## Element / mesh notes

- **Element:** 8-node hex, trilinear, **2×2×2 Gauss**, updated Lagrangian, Jaumann stress rate, hypoelastic J2 return map, artificial bulk viscosity.
- **Mesh:** `src/mesh/cylinderHex.ts` structured generator (square mapped to disk, extruded in Z). Gmsh is still future work.

## Layout

```
src/ir/           Model IR + validation
src/fe/           hex, J2, rigid wall, explicit solver
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

## Browser workbench

The Vite app loads this fixture from the research catalog (`src/research/catalog.ts`), shows undeformed mesh + model tree in **Pre**, runs `solveExplicit` in **Solve**, and plots deformed mesh + energy history + displacement/plastic-strain metrics in **Post**. Prove with `pnpm test:e2e`.

## Out of scope (still)

WebGPU path, shells/FMBD, STEP/Gmsh, deck import, mass scaling. Live OpenRadioss in default CI (pin is checked offline).
