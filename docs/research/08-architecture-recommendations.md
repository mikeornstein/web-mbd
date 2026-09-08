# Architecture recommendations

Concrete plan synthesizing research docs `00`–`07` for web-mbd.

## North star

One browser app: geometry → mesh → physics IR → explicit/implicit/FMBD solvers → fields and histories — with MCP for agents — validated against analytical cases and OpenRadioss as an external oracle.

## System diagram

```
┌──────────────────────────────────────────────────────────┐
│ apps/web                                                 │
│  pre · solve controls · post · agent chat (optional)     │
└───────────────┬─────────────────────────────┬────────────┘
                │                             │
                ▼                             ▼
        packages/ir ◄────────────── packages/mcp
                │
        ┌───────┼────────┬────────────┐
        ▼       ▼        ▼            ▼
   geom/occt  mesh/gmsh  io-decks   runtime
                                   ┌──────┴──────┐
                                   ▼             ▼
                              wasm-cpu      webgpu-explicit
                                   │             │
                                   └──────┬──────┘
                                          ▼
                                     results bus
```

## Model IR (non-negotiable center)

Versioned documents, roughly:

- `Meta` — units, version, solver intents
- `Geometry` — B-Rep handles / references
- `Mesh` — nodes, elements, sets, quality
- `Parts` — mesh regions + section + material
- `Materials` — law id + parameters
- `Contacts` / `Constraints` / `RigidBodies`
- `Loads` / `IC` / `Curves`
- `Outputs`
- `Compat` — import warnings

Compile IR → **SolverWorld** (SoA buffers, GPU buffers). Never let the UI edit GPU buffers behind the IR’s back without a transaction.

## Runtime

### Explicit path (priority)

- WebGPU compute: element forces, contact force, integrate.
- Broadphase on a slower cadence (Radioss pattern).
- Lumped mass; hourglass energy tracked.
- Deterministic reductions by default.

### WASM CPU path

- Reference kernels for tests.
- Implicit factorization / Newton when GPU sparse story is immature.
- Fallback when WebGPU missing.

### FMBD path

- Rigid joints + constraint stabilization.
- ANCF beams/shells for large-deformation flexible bodies (Chrono-informed).
- Couple to contact shared with explicit FE where possible.

## I/O

| Format | Direction | Priority |
| --- | --- | --- |
| web-mbd project JSON | in/out | P0 |
| STEP | in/(out) | P0 |
| Gmsh `.msh` | in | P0 |
| LS-DYNA `.key` | in (subset) | P1 |
| Radioss `.rad` | in (subset) | P1 |
| VTK/CSV | out | P1 |
| Full deck export | out | P2 |

Importer emits coverage reports; CI fails on regressions in supported subset.

## Validation & CI

- PR: unit + method + import + determinism.
- Nightly: meso performance + optional OpenRadioss oracle container.
- Publish energy-error and throughput artifacts.

## Licensing posture

- Keep web-mbd sources under a chosen non-AGPL license until intentionally otherwise.
- Do not vendor OpenRadioss into the browser bundle.
- Document third-party WASM (OCCT, Gmsh) licenses in NOTICE.
- Oracle container is a CI tool, not a distributed dependency of the app.

## Phased delivery (technical, not calendar)

### Phase A — Skeleton

IR schema, empty scene, WebGPU capability gate, SDOF + single-element explicit, energy plot.

### Phase B — Contact + shells

Penalty contact fixture, under-integrated shell + hourglass, Taylor bar, deck import of tiny `.key`.

### Phase C — Pre chain

STEP → OCCT → Gmsh worker → assign mats/contacts in UI.

### Phase D — FMBD

Joints + ANCF cable/beam; couple to contact.

### Phase E — Implicit

Newmark + Newton on WASM; share materials where possible.

### Phase F — Agent

MCP tools over IR; validate_run evidence gates; optional oracle_compare.

## Pitfall radar (sticky notes)

| Pitfall | Mitigation |
| --- | --- |
| Fork Radioss “just to go faster” | Re-read `02-build-fork-or-fresh.md` |
| Silent keyword drop | Compat report + strict CI |
| Mass scaling defaults | Opt-in + DM/M viz |
| Nondeterministic GPU atomics | Sorted assemble / coloring |
| ParaView-only post | In-app fields first |
| Agent edits decks | MCP→IR only |
| Neon 1M as v1 demo | Meso budgets |

## Success criteria for “we built the right thing”

1. Engineer imports a small crash coupon (or builds in UI), runs in-tab, sees energy balance and deformation without installing a solver.
2. Same model’s global metrics sit within documented tolerance of OpenRadioss oracle on CI.
3. Agent can mesh, set contact, solve, and return probe + energy evidence via MCP without touching keyword files.
4. Flexible mechanism with deforming links runs in the same app as the crash coupon.

## Next research / design spikes (still docs or tiny prototypes later)

- Pick shell formulation #1 and write a theory note with references.
- Draft IR JSON Schema.
- Spike WebGPU SoA explicit trampoline vs WASM.
- List LS-DYNA keyword subset for P1 importer (nodes, shells, mat24/piecewise, contact automatic, rigidwall, initial velocity).
