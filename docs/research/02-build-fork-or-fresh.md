# Build upon, fork, or start fresh

Decision record for how web-mbd should relate to OpenRadioss and other incumbents.

## Options

### A — Fork OpenRadioss

Clone the AGPL tree, keep Starter/Engine, eventually retarget backends.

| Pros | Cons |
| --- | --- |
| Immediate access to decades of elements, materials, contact | AGPL-3.0: modified network service must offer corresponding source |
| Existing qa-tests and industrial decks | Fortran + MPI + restart files vs TypeScript/WebGPU product |
| Community recognition | Browser cannot host MPI domains meaningfully; WASM Fortran is a science project |
| | Silent LS-DYNA gaps and HyperMesh-centric workflow stay |
| | Dual maintenance forever against Altair upstream |

**Verdict:** Reject as product core. Optional: keep a pinned OpenRadioss build in CI as an **oracle binary**, not as a dependency linked into the app.

### B — Build upon (wrap / extend without owning physics)

Run OpenRadioss (or Radioss commercial) as a sidecar; web UI + converters (pattern: OpenRadioss-WebGUI, HyperWorks MCP, inp2rad).

| Pros | Cons |
| --- | --- |
| Fast path to “real” crash answers | Not client-side; reintroduces installers/HPC |
| Reuses validation already in the wild | Two sources of truth (deck vs UI) |
| Good teaching / enterprise bridge | Latency and ops kill the “press run in the tab” thesis |

**Verdict:** Accept as an **optional bridge** (desktop helper, CI oracle, agent tool), never as the only solver path.

### C — Start fresh (recommended)

Own model IR + solvers; import decks; validate against OpenRadioss/LS-DYNA/analytical suites.

| Pros | Cons |
| --- | --- |
| License freedom | Long road to industrial keyword coverage |
| Architecture matches WebGPU/WASM | Must re-derive/reimplement formulations carefully |
| Unified pre/solve/post | Need disciplined validation to earn trust |
| Agentic MCP can target clean IR | Community may ask “why not Radioss?” — answer with oracle diffs |

**Verdict:** **This is the product path.** Steal algorithms and tests; do not steal the process model.

### D — Hybrid contribution

Upstream useful open work (exporters, examples, bug reports) to OpenRadioss while building web-mbd independently.

**Verdict:** Do this opportunistically. Improves the shared oracle without coupling releases.

## Decision matrix (weighted for web-mbd goals)

Goals from root README: client-side first, flexible bodies, one surface for pre/solve/post, modern internals, production-shaped explicit/implicit dynamics.

| Criterion | Weight | Fork | Wrap | Fresh |
| --- | --- | --- | --- | --- |
| Runs in browser without native solver | 5 | 1 | 1 | 5 |
| Unified pre/solve/post | 5 | 2 | 3 | 5 |
| Path to LS-DYNA/Radioss deck import | 4 | 5 | 5 | 4 |
| License flexibility | 4 | 1 | 3 | 5 |
| Time-to-first-correct-crash-physics | 3 | 5 | 5 | 2 |
| GPU-resident explicit performance | 5 | 2 | 1 | 5 |
| Deterministic parallel answers | 4 | 4 | 4 | 4 |
| Agentic/MCP cleanliness | 3 | 2 | 3 | 5 |

Scores (weight × rating): Fork 88, Wrap 84, Fresh **140**. Fresh wins on the product-defining axes; fork/wrap win only on short-term physics completeness.

## What “fresh” still reuses

Reuse as **specifications and assets**, not as linked code:

1. Radioss Theory Manual formulations (cite; reimplement).
2. OpenRadioss example decks → compile into IR golden tests.
3. Neon/Taurus (downscaled) for performance envelopes.
4. Energy/mass error definitions for runtime health.
5. Keyword mapping tables as importer checklists.
6. Chrono ANCF / flexible MBD papers for joints + large-deformation beams/shells (BSD-friendlier ecosystem if we ever vendor).
7. MFEM/libCEED/deal.II ideas for matrix-free GPU operator evaluation (implicit path).

## Pitfalls of the incumbent approach (checklist to dodge)

1. **Deck-as-database** — cfg sprawl, restart serialization, dual Starter/Engine truth.
2. **HPC-first parallelism** — MPI domains before single-node GPU residency.
3. **Toolchain fracture** — mesh here, solve there, convert Annn→vtk, plot T01 elsewhere.
4. **Compat theater** — “reads LS-DYNA” without guaranteed semantics or loud failures.
5. **Mass-scaling culture** — hide stiffness with added mass; corrupt results quietly.
6. **Copyleft surprise** — AGPL on a web product without intentional open-core policy.
7. **Validation = “it ran”** — need quantitative oracles, not animation eyeballing alone.

## Recommended policy statement (for README / CONTRIBUTING later)

> web-mbd implements its own solvers under this repository’s license. OpenRadioss is a reference oracle and an import/export compatibility target. We do not vendor OpenRadioss sources into the browser runtime. CI may run OpenRadioss on golden decks to diff global metrics and selected traces against web-mbd.

## When to revisit the fork decision

Revisit only if all of the following become true:

- Legal clears AGPL for the entire shipped surface (or Altair offers a different license for a subset).
- A maintained Fortran→WGSL or WASM GPU story exists that preserves Parallel Arithmetic.
- The product thesis shifts from client-side solve to hosted Radioss-compatible cloud.

Until then, stay fresh.
