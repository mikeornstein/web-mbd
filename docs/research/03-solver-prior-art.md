# Solver prior art landscape

OpenRadioss is the primary crash-explicit reference; this note places it among related solvers and stacks web-mbd should learn from.

## Tier A — Industrial crash / explicit nonlinear

| Code | License / access | Strength | Weakness vs web-mbd |
| --- | --- | --- | --- |
| **OpenRadioss** | AGPL-3.0 | Full crash stack, LS-DYNA-ish decks, HPC | Fortran/MPI, fractured pre/post |
| **Altair Radioss** (commercial) | Proprietary | Support, encryption, extras | Not embeddable |
| **Ansys LS-DYNA** | Proprietary (+ limited free node caps) | Industry default crash | Closed; deck target only |
| **PAM-CRASH / others** | Proprietary | Auto crash heritage | Closed |

**Takeaway:** Compete on *architecture and UX*, not on day-one keyword parity. Speak `.key` / `.rad` as import dialects.

## Tier B — Open FEA generalists (weak explicit crash)

| Code | Notes |
| --- | --- |
| **CalculiX** | Abaqus-like `.inp`; explicit dynamics widely considered fragile; PrePoMax GUI; inp→rad converters exist |
| **Code_Aster + Salome** | Broad multiphysics; not crash-specialized |
| **Elmer** | Multiphysics HPC; weak crash story |
| **FEBio** | Soft tissue / biomechanics; useful contact/nonlinear ideas |
| **Sparselizard / GetFEM / …** | Research FE; not crash product |

**Takeaway:** Do not build web-mbd on CalculiX explicit. Use these for static/implicit cross-checks and meshing GUIs inspiration only.

## Tier C — Flexible multibody / mechanisms

| Code | Notes |
| --- | --- |
| **Project Chrono** | BSD-licensed C++; rigid + ANCF FEA beams/shells; validated vs literature/ANSYS/Abaqus; Python API; WASM ports exist experimentally (`chrono.wasm`) |
| **Hotint / MBDyn / Simbody** | MBD-focused; less industrial crash contact |
| **Recent GPU total-Lagrangian FMBD papers** | GPU Newton + collision on triangle soups; use Chrono/FEniCS as CPU baselines |

**Takeaway:** Chrono is the best open *formulation* reference for flexible multibody (ANCF, joints, DAE index reduction). Prefer learning from Chrono docs/tests over forking Radioss for mechanisms. License is friendlier if we ever vendor small pieces.

## Tier D — Modern HPC FE frameworks (implicit / matrix-free GPU)

| Code | Notes |
| --- | --- |
| **MFEM + libCEED** | Matrix-free operators, GPU backends (CUDA/HIP/SYCL), CEED bake-off problems (BP1/BP3) |
| **deal.II** | Highly tuned matrix-free CPU/GPU; sum factorization |
| **FEniCSx** | UFL productivity; good hyperelastic validation stories |
| **libMesh / MOOSE** | App framework pattern |

**Takeaway:** Steal **operator-evaluation and GPU memory patterns** for the implicit/Newmark path. Do not expect these stacks to ship Radioss-class contact out of the box.

## Tier E — Browser / WASM / WebGPU physics

| Project | Relevance |
| --- | --- |
| **Tetrament** | WebGPU softbody FEM + tet meshing + SDF colliders — closest “feel” demo to client FE |
| **FEAScript** | JS FEM API, Jacobi/WebGPU, vtk.js viz — API ergonomics |
| **fea_app (Shushakov)** | Rust WASM + WebGPU PCG/SpMV — numerical plumbing patterns |
| **Yantra** | Browser heat on voxels — product packaging lessons (WebGPU gate, worker voxelize) |
| **occt-wasm / brepjs / OpenGeometry / GMSH-JS** | Geometry + mesh in-browser |
| **OpenRadioss-WebGUI** | Server-side Radioss + three.js viewer — anti-pattern for our thesis, useful UX checklist |

**Takeaway:** Browser FE is real for *small/medium* models. web-mbd must define honest size budgets and progressive fidelity (see benchmarking doc).

## Physics modules inventory (what “all the solvers” means for us)

Organize web-mbd as multiple solvers behind one IR, not one monolith:

1. **Rigid MBD** — joints, constraints, contacts (Chrono-like).
2. **Flexible MBD** — modal + ANCF/geometrically nonlinear beams/shells.
3. **Explicit FE** — central difference / symplectic; contact; crash materials (Radioss-like).
4. **Implicit FE** — Newmark/HHT + Newton; statics, slow dynamics (MFEM-like operators).
5. **Discrete / specialized (later)** — DEM, SPH, ALE only if product demand appears.

Each solver consumes the same IR subset and emits the same field/time-history schema.

## Formulation choices to lock early

| Topic | Incumbent default | web-mbd lean |
| --- | --- | --- |
| Time integration (crash) | Central difference | Same; optional symplectic variants |
| Shells | Under-integrated + hourglass (QEPH etc.) | Start with one robust shell + hourglass; add formulations behind IR flags |
| Contact | Penalty (Radioss TYPE7 family) | Penalty first; constraint/mortar later |
| Flexible beams | Various | ANCF from Chrono literature for large rotation FMBD |
| Mass matrix | Lumped explicit | Lumped explicit; consistent for implicit |
| Hourglass | Essential | First-class energy accounting |
| AMS / mass scaling | Industrial necessity | Implement AMS-like carefully; never silent CST |

## Cross-code coupling (when agents ask for “the best solver”)

OASiS-style multi-code agent hubs show demand for routing problems to FEniCSx vs deal.II vs FEBio. web-mbd should:

- Expose capability tags on solvers (`explicit_contact`, `ancf_beam`, `implicit_hyperelastic`).
- Allow **external oracle** hooks (OpenRadioss CLI) in dev/CI without shipping them to end users.
- Keep one IR so agents do not rewrite decks per code.

## Summary map

```
                    industrial crash
                 OpenRadioss / LS-DYNA
                         │
            import decks │ validate metrics
                         ▼
              web-mbd model IR + solvers
                    │         │
         Chrono/ANCF│         │MFEM-like implicit
           ideas    │         │ GPU operators
                    ▼         ▼
              FMBD path   Implicit path
                    │
                    ▼
            Browser runtime (WebGPU/WASM)
            Geometry: OCCT/brep · Mesh: Gmsh
            Viz: vtk.js / WebGPU
```
