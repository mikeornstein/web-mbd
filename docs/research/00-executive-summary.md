# Executive summary — solver prior art for web-mbd

**Verdict: start fresh for the solver runtime. Do not fork OpenRadioss into the browser. Treat OpenRadioss (and LS-DYNA where available) as the external oracle for validation and as the deck-compat target for import.**

This is a research conclusion for `web-mbd`: a client-side flexible multibody / crash-capable CAE app (WebGPU + WASM). OpenRadioss is the strongest open incumbent for the physics we care about (explicit nonlinear dynamics, contact, crash). Its algorithms and test corpus are gold. Its *implementation shape* — Fortran, starter/engine split, MPI domain decomposition, HyperMesh-era I/O — is the opposite of a browser-native stack.

## One-page decision

| Option | Fit for web-mbd | Why |
| --- | --- | --- |
| **Fork OpenRadioss** and port to WASM/WebGPU | Poor | AGPL-3.0 copyleft on network use; 30+ years of Fortran COMMON/restart plumbing; MPI/OpenMP model does not map to WebGPU workgroups; starter binary + `.rst` files fight a single-tab UX |
| **Wrap OpenRadioss** as a remote/native sidecar | Useful as *oracle*, wrong as *product core* | Matches existing OpenRadioss-WebGUI / HyperWorks MCP patterns; reintroduces installers, queues, and dual surfaces we are trying to eliminate |
| **Contribute upstream** to OpenRadioss | Good for community, orthogonal to product | Improves the oracle and deck ecosystem; does not deliver client-side solve |
| **Start fresh**, steal formulations + validation | **Recommended** | Own the model IR, GPU kernels, and unified pre/solve/post; import Radioss/LS-DYNA decks; compare answers to OpenRadioss on a curated suite |

## What to steal from OpenRadioss (without forking)

1. **Physics inventory** — under-integrated shells/solids, hourglass control, penalty contact, rigid walls, spotwelds/TYPE2, material laws, AMS vs mass scaling, energy/mass error accounting.
2. **Explicit loop structure** — contact sort infrequently; force assembly every step; kinematic conditions; global `dt = min(dt_local)`; integrate V, X. See Confluence HMPP notes and `resol.F`.
3. **Data-oriented performance habits** — packets of `MVSIZ`, SoA layout, locality rules, avoid AoS and OOP in hot paths. Translate packets → GPU workgroup tiles.
4. **Parallel arithmetic / determinism** — fixed reduction order so thread/domain count does not change answers. Critical for browser: same model, same browser, same answer.
5. **Deck surface** — LS-DYNA `.key` and Radioss Block `.rad` as *import formats* into a typed IR, not as the live edit model.
6. **QA culture** — energy error %, DM/M added mass, `qa-tests` / `or_qa_script`, Neon 1M / Taurus 10M for scale (scaled down for browser).

## What to dodge (incumbent pitfalls)

- **Silent keyword drop** on LS-DYNA import (unsupported cards run with no warning — GitHub #1491 pattern). Our importer must fail loud and emit a coverage report.
- **Starter/engine/file round-trip** as the only workflow. Keep compile → solve → stream fields in one process.
- **Pre/post fragmentation** (HyperMesh + solver + HyperView/ParaView converters). One scene graph owns geometry, mesh, BC, results.
- **Mass scaling as a default crutch** (`/DT/NODA/CST`). Prefer AMS-like ideas or honest dt; always expose added-mass fields.
- **AGPL into a SaaS/browser product** without a legal strategy. Fresh code under a chosen license; AGPL only if we deliberately open the whole stack.
- **Assuming Radioss ≡ LS-DYNA answers**. Even Altair documents that mapped keywords do not guarantee matching commercial LS-DYNA results.

## How the rest of the stack should look

| Layer | Direction |
| --- | --- |
| **Geometry** | Browser B-Rep (occt-wasm / brepjs) + STEP import; defeaturing as first-class ops |
| **Meshing** | Gmsh-WASM or native worker for hex/tet/shell; quality metrics in IR |
| **Model IR** | Versioned typed scene: parts, mats, sections, contacts, constraints, outputs |
| **Solvers** | Explicit GPU (primary); implicit/WASM (secondary); rigid + flexible MBD (Chrono/ANCF-informed) |
| **Pre/post** | Single web app; vtk.js / custom WebGPU viz; time history in-app |
| **Agentic** | MCP over the IR + run/validate tools; never raw Fortran decks as the agent’s only API |
| **Validation** | Method of manufactured solutions → classic benchmarks → OpenRadioss oracle diffs |

## Scope of this research pack

Docs `01`–`08` expand the evidence: OpenRadioss internals, fork decision, broader prior art, validation, benchmarking, geometry/pre-post, MCP, and a concrete architecture plan.

No production solver code is included in this commit — documentation only.
