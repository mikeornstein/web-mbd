# Geometry, meshing, pre- and post-processing

OpenRadioss’s Confluence stance is honest: serious models need an external pre-processor; results need an external post-processor; converters glue them. web-mbd’s thesis is to collapse that chain into one client app. This note picks concrete building blocks.

## Incumbent workflow (to replace)

```
CAD (anywhere)
  → HyperMesh / Gmsh / LS-PrePost / PrePoMax
  → .rad or .key deck
  → OpenRadioss Starter → .rst
  → Engine → Annn + T01 (+ h3d)
  → anim_to_vtk + th_to_csv
  → ParaView / HyperView
```

Pain: semantic loss in converters, duplicated identity (part IDs), no live coupling between mesh edits and last solve, agent-hostile.

## Target workflow

```
STEP / sketch / imported deck
  → Geometry kernel (B-Rep)
  → Mesher (worker)
  → Model IR (materials, contact, BCs, outputs)
  → Solver (WASM / WebGPU)
  → Field + history buffers (same scene graph)
  → In-app viz + optional VTK/CSV export
```

## Geometry

### Requirements

- Import STEP (and eventually IGES); export STEP for round-trip with desktop CAD.
- Booleans, fillets, defeaturing (tiny hole removal, imprint) as explicit ops agents can call.
- Tessellation for display separate from analysis mesh.
- Deterministic kernels where possible (avoid CPU-dependent geometry).

### Prior art to use

| Option | Role |
| --- | --- |
| **occt-wasm** | Production-minded OpenCascade in WASM; TypeScript API; workers via Comlink |
| **brepjs** | Productized TS façade over OCCT (and future Rust kernel); agent verification loop story |
| **brepkit** | Rust B-Rep aiming at smaller WASM; watch maturity |
| **OpenGeometry** | Rust/WASM CAD primitives for web apps |
| **FreeCAD / pythonOCC** | Server-side only fallback — conflicts with client-first unless optional |

**Recommendation:** Start with **occt-wasm / brepjs** for STEP + booleans. Keep mesh display tessellation lazy. Do not reinvent B-Rep.

## Meshing

### Requirements

- Tri/quad shells, tet/hex solids, beams along wires.
- Size fields, local refinement, boundary layers later.
- Quality metrics stored on IR (Jacobian, aspect, skew).
- Runs off main thread (Worker); COOP/COEP if using pthread Gmsh builds.

### Prior art

| Option | Role |
| --- | --- |
| **Gmsh** (native) | OpenRadioss’s own recommended OSS pre mesh path; Radioss/LS-DYNA export templates exist |
| **GMSH-JS** | Gmsh + OCC in WASM; powerful but large (~tens of MB with OCC); needs cross-origin isolation for threads |
| **Custom tet** (e.g. Tetrament Delaunay) | Softbody-oriented; not industrial CAD mesh |
| **PrePoMax / Salome** | UX references, not embeddable cores |

**Recommendation:**

- v1: **GMSH-JS** or Wasm Gmsh subset for tet/shell from B-Rep; document download size.
- Parallel track: accept external `.msh` / deck meshes so power users bypass in-tab meshing.
- Never require HyperMesh.

## Model assembly (pre beyond CAD)

Must live in the web app, not in keyword text:

- Parts, instances, transforms
- Materials & sections (thickness, integration rules)
- Contacts & rigid walls
- Constraints / joints / rigid bodies
- Initial velocity, gravity, curves
- Output requests (nodes, sets, field vars, sample dt)

**Deck import** populates these objects; UI edits objects; solver reads objects. Export to `.key`/`.rad` is optional and lossy where unsupported.

## Post-processing

### In-app (primary)

- Deformed mesh animation with field coloring (stress, plastic strain, thickness, contact pressure).
- Time-history plots (forces, energies, dt, DM/M).
- Probes and section cuts.
- Prefer **GPU buffers already resident** after solve — avoid serialize→ParaView→reload as the happy path.

### Libraries

| Lib | Use |
| --- | --- |
| **Three.js / WebGPURenderer** | Interactive scene, manipulators |
| **vtk.js / Glance patterns** | Unstructured grid fields, serious FE viz |
| Custom WebGPU | Fast path when solver state is already device-side |

### Export (secondary)

- VTK/VTU or vtk.js scene for ParaView users.
- CSV of histories.
- glTF deformed surfaces for lightweight sharing.

OpenRadioss’s `anim_to_vtk` / `th_to_csv` prove users want these escapes; ship them without making them mandatory.

## Identity and units

- Preserve stable IDs through import when possible; allocate web-mbd UUIDs internally; keep `externalIds` map for deck round-trips.
- Unit system is explicit on the model (Radioss/LS-DYNA footguns). Display layer converts; solver stores SI canonical or declared system consistently.

## Performance / UX constraints

- Geometry ops and meshing in Workers; cancellable.
- Progressive meshing previews (coarse → fine).
- Do not block tab on 100k-face boolean without progress.
- Gate WebGPU with a clear capability screen (Yantra lesson).

## Anti-patterns from the OpenRadioss ecosystem

1. Text-editor-only modeling for anything beyond single elements.
2. Multi-hop `inp → rad → vtk` with silent feature loss.
3. Post-only HyperView Player without contours as “good enough.”
4. Assuming LS-PrePost forever for contact setup.

## Suggested ownership boundaries in repo

```
packages/geom      # OCCT bindings façade
packages/mesh      # Gmsh worker client + quality
packages/ir        # typed model IR + zod/json schema
packages/io-decks  # .key / .rad / .msh importers
packages/viz       # scene + fields + plots
apps/web           # unified UI
```
