# OpenRadioss deep dive

Primary sources: [OpenRadioss Confluence](https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/overview?homepageId=1016017), [GitHub OpenRadioss/OpenRadioss](https://github.com/OpenRadioss/OpenRadioss), Altair Radioss Theory Manual (2022), Altair Radioss user documentation.

## What OpenRadioss is

OpenRadioss is the AGPL-3.0 open-source release of Altair Radioss: an industry explicit finite-element solver for highly nonlinear dynamic events (crash, impact, drop, blast, forming). It shares input formats and much of the source lineage with commercial Radioss. Altair still sells a commercial Radioss with support, encryption, and features not in the open tree.

For web-mbd it is the closest open analogue to “LS-DYNA-class” crash physics.

## Product shape (user-visible)

Two binaries, not one:

1. **Starter** — reads model (Radioss Block `.rad` or supported LS-DYNA `.key`), checks consistency, domain-decomposes (Metis), renumbers locally, writes per-rank restart `.rst` files (and often synthesizes an Engine deck from `*CONTROL_TERMINATION`).
2. **Engine** — MPI + OpenMP time integration from restart + Engine control deck; writes animation (`Annn` / `.h3d`) and time history (`T01`).

Environment: `RAD_CFG_PATH` → `hm_cfg_files` (keyword syntax), `OMP_STACKSIZE`, optional OpenMPI.

This split optimizes HPC startup (local memory, parallel read) and is a poor fit for “open model → press run in a tab.”

## Theory core (from Radioss Theory Manual)

Radioss/OpenRadioss is built around:

- **3D Lagrangian mesh description**
- **Explicit central-difference** time integration → small stable dt
- **Under-integrated elements** + hourglass control
- **Element-by-element force assembly** (no global tangent every step)
- **Penalty contact** (primary industrial path)
- **Highly vectorized** implementation heritage

Major theory chapters map cleanly to modules we will need: basic continuum, FE discretization, dynamics/stability, element library (tet/hex/solid-shell/shell/truss/beam/spring), kinematic constraints, interfaces/contact, material laws, monitored volumes, static/dynamic relaxation, parallelization, plus ALE/SPH extensions we can defer.

## Explicit algorithm (HMPP Confluence + `resol.F`)

Pseudo-code from OpenRadioss HMPP Development Insights:

```
while T < Tend:
  contact_sorting_criteria + communication
  if needed:
    contact sorting (+ extra communication)   # ~every 50–100 steps
  compute contacts + element forces
  communicate forces
  assemble kinematic conditions (+ comm)
  I/O (often gather to rank 0)
  dt = global_min(dt_local)
  compute accelerations
  integrate V, X
  communicate X, V
  T += dt
```

Implications for a GPU client solver:

- Separate **broadphase/sort** cadence from **force** cadence.
- Force and contact dominate; I/O must not stall the step (stream progressive fields).
- Global min-dt is a reduction — map to GPU subgroup/workgroup reductions carefully for **determinism**.

## Parallelism model

| Mechanism | Role |
| --- | --- |
| **Metis graph partitioning** | Static domain decomposition in Starter |
| **MPI** | Inter-domain force/X/V exchange; async isend/irecv; try to hide behind compute |
| **OpenMP** | Second-level parallelism inside a domain; MPI calls outside OpenMP regions |
| **MVSIZ packets** | Vector-length tiles for element/contact loops; cache locality; local scratch of size MVSIZ |
| **Parallel Arithmetic** | Fixed summation order independent of MPI grouping / OpenMP schedule → bitwise reproducibility across process/thread counts |

**Amdahl target:** ≥99% parallel work. Everything in the hot path must scale.

**web-mbd translation:** replace MPI domains with spatial tiles / mesh coloring; replace OpenMP with WebGPU workgroups; keep Parallel Arithmetic as a first-class design requirement (“same model, same browser, same answer”).

## Performance coding norms (Confluence: Vectorization and Optimization)

Habits worth keeping even in WGSL/WASM:

- Process elements/nodes in **fixed-size packets** (MVSIZ → workgroup size / subgroup).
- Hoist branchy tests out of inner loops; forbid unstructured control flow that kills vectorization.
- Prefer **SoA** (`POINT%X(1:N)`) over AoS.
- Layout rule of thumb: large extent last when ≥ vector length (`X(3,NUMNOD)`); packet-sized extent first (`C(MVSIZ,5)`).
- Avoid OOP in hot kernels unless measured.
- Integer powers, not real powers, where possible.

## Input system (Reader + cfg)

An external **Reader** library builds an input database from decks using `.cfg` files that declare card syntax. Starter queries via a small Fortran API (`HM_OPTION_COUNT`, `HM_OPTION_START`, `HM_GET_INTV`, `HM_GET_FLOATV`, …) with automatic submodel ID offsets and unit handling.

Adding a keyword means: write cfg → register in `data_hierarchy.cfg` → count in `contrl.F` → read routine → restart plumbing via `RESTART_MOD`.

**Pitfall for us:** keyword sprawl and cfg/restart coupling make the deck the *source of truth*. web-mbd should invert that: **typed IR is source of truth**; decks are importers/exporters with explicit coverage matrices.

## LS-DYNA compatibility

OpenRadioss can ingest many LS-DYNA keywords by mapping to Radioss equivalents during Starter. Altair documents:

- Only listed keywords/options are supported.
- Mapping does **not** guarantee LS-DYNA-identical results.
- Units via `*CONTROL_UNITS` matter for mapping.
- Known gaps and silent failures exist (e.g. orthotropic shell beta / fabric orientation running without warning — community issue pattern).

**web-mbd rule:** import with a machine-readable **compat report** (supported / partially supported / dropped). Never silent drop.

## Pre / post (Confluence: Pre and Post Processing)

| Role | Open source | Commercial |
| --- | --- | --- |
| Pre | Gmsh (+ Radioss/LS-DYNA export templates), text decks | HyperMesh |
| Post | ParaView after `anim_to_vtk` + `th_to_csv` | HyperView / HyperGraph; HyperView Player for `.h3d` playback |

This multi-tool chain is the UX debt OpenRadioss-WebGUI and similar projects try to shrink. web-mbd’s product bet is to eliminate it.

## Example / HPC models

- Application demos: tensile, forming/AMS, vehicle impacts (Camry/Yaris in LS-DYNA format), ModelExchange components.
- HPC scalability: **Neon ~1M elements**, **Taurus ~10M elements** (NCAC-derived, Altair Radioss Block). Full crash durations are tens–hundreds of ms; shortened `/RUN` times used for cluster smoke tests.
- CarCrashNet / public vehicle models: OpenRadioss vs LS-DYNA wall-force agreement on the order of single-digit percent on selected global metrics — useful as **system-level** comparison targets, not bitwise oracles.

## QA and results hygiene

- In-tree **`qa-tests`** driven by `or_qa_script` (Perl), used in GitHub Actions developer CI with MPI×OpenMP matrix.
- Runtime health: **energy error %**, **mass error**, **DM/M added mass**; Altair guidance ~±1–2% energy error as a soft band for good fully-integrated / QEPH runs; large positive/negative errors often signal divergence or bad kinematics.
- Mass scaling (`/DT/NODA/CST`) is a known footgun — can stabilize dt while corrupting local inertia; AMS is the preferred industrial “buy dt” technique when needed.

## Codebase characteristics (contributor docs)

- Fortran with strict house style (uppercase statements, INTENT, explicit bounds, one routine per file norms).
- Global allocation at Starter `LECTUR` / Engine `RESOL`; restart variables funneled through `RESTART_MOD`.
- Legacy commons coexist with modules; interfaces sparingly; Forcheck-style static QA.

**Engineering cost of a fork:** every new feature pays the restart/MPI/MVSIZ tax. Porting that tax to WASM does not buy a modern IR or GPU-resident state.

## License

**GNU Affero GPL v3.** Network use of a modified version obligates source disclosure to users of that service. Third-party code under `extlib/` may carry additional terms. Commercial Radioss remains a separate Altair product.

For a browser CAE product this is a strategic fork-blocker unless the entire product is intentionally AGPL.

## Bottom line for web-mbd

OpenRadioss is:

- the **best open physics reference** for crash/explicit,
- a **deck ecosystem** we should speak (import),
- a **bad substrate** for WebGPU-first architecture.

Use it as oracle + importer target. Reimplement kernels in a data-oriented, deterministic, GPU-resident runtime owned by this repo.
