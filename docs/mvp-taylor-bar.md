# Taylor bar MVP

First end-to-end explicit solid model for web-mbd.

## What it proves

- Typed `ModelIR` (nodes, hex mesh, J2 linear hardening, rigid wall, ICs)
- Explicit central-difference solver (TypeScript / WASM-ready reference path)
- Lumped mass, CFL timestep, energy ledger, final length/radius metrics
- Deterministic repeats
- Quantitative gates against published Taylor-impact shape bands

## Run

```bash
npm install
npm test
npm run taylor
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

Acceptance (MVP):

- L_f / L₀ ∈ [0.55, 0.78]
- R_f / R₀ ∈ [1.15, 2.6] (mesh-sensitive foot flare; tighten later)
- \|energy error\| ≤ 8%
- Bitwise-stable metrics across repeated runs

## Layout

```
src/ir/           Model IR + validation
src/fe/           hex, J2, rigid wall, explicit solver
src/mesh/         cylinder hex generator
src/fixtures/     Taylor bar model
src/cli/          headless runner
tests/            vitest golden + determinism
```

## Out of scope (still)

WebGPU path, shells/FMBD, STEP/Gmsh, deck import, OpenRadioss oracle CI, mass scaling.
