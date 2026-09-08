# Agentic APIs and MCP

How agents should drive web-mbd — learning from CAE-Agent-Hub, OASiS, HyperWorks MCP, Ennova/OpenFOAM MCP stories, and OpenRadioss’s deck-centric world.

## Problem with deck-first agents

Today an agent “using OpenRadioss” typically:

1. Writes or patches `.rad`/`.key` text.
2. Shells out to starter/engine.
3. Greps `.out` / converts Annn.

Failure modes: silent unsupported keywords, brittle text edits, no structured validation, huge tool surfaces, and no shared memory with the GUI the human is staring at.

## Design principle

**The Model IR is the agent API.** MCP tools mutate and query IR, run solvers, and return structured metrics. Decks are import/export adapters, not the live contract.

```
Agent ⇄ MCP (web-mbd server or in-process)
            ⇄ Model IR
            ⇄ Solvers / mesher / viz hooks
```

For the client-side product, MCP can be:

- a **local stdio server** wrapping the same TypeScript IR library the UI uses, and/or
- **in-app agent tools** (no network) with identical schemas.

Keep one schema.

## Tool surface (v1 proposal)

### Session / model

| Tool | Purpose |
| --- | --- |
| `model_get` | Summarize IR (parts, mats, contacts, counts) |
| `model_load` | Load project / STEP / deck |
| `model_export` | JSON IR, optional deck export |
| `compat_report` | Last import coverage |

### Geometry / mesh

| Tool | Purpose |
| --- | --- |
| `geom_from_step` | Import solid |
| `geom_boolean` / `geom_defeaturing` | CAD ops with measured reports |
| `mesh_generate` | Size, element type, quality thresholds |
| `mesh_quality` | Histogram + worst elements |

### Physics setup

| Tool | Purpose |
| --- | --- |
| `material_set` | Assign law + params with units |
| `section_set` | Shell thickness, integration |
| `contact_create` | Surfaces, gap, friction, penalty |
| `bc_set` / `ic_set` | Boundaries, initial velocity |
| `output_request` | Histories and fields |

### Solve / validate

| Tool | Purpose |
| --- | --- |
| `solve_run` | Backend (`webgpu`/`wasm`), end time, dt control |
| `solve_status` | Progress, dt, energy error live |
| `solve_cancel` | |
| `results_probe` | Node/element traces |
| `results_energy` | Energy balance table |
| `validate_run` | Execute named golden / method benchmark |
| `oracle_compare` | Optional: diff vs OpenRadioss (dev environments) |

### Safety

- Writes that spend “serious” CPU (mesh, solve) require explicit tool calls with budgets (max elements, max seconds).
- Destructive clears confirm via parameter `confirm: true`.
- Never expose raw shell to the agent by default.

## Schema quality (what OASiS/CAE hubs get right)

- Curated **solver knowledge** (pitfalls, element catalogs) as resources, not only tools.
- **Evidence gates** — agent must attach energy error / probe values before claiming success.
- Capability tags so the agent picks explicit vs implicit vs FMBD.

## Resources to expose over MCP

- IR JSON Schema
- Material law parameter docs
- Validation case catalog
- This research pack (`docs/research/*`)
- Compat matrix for LS-DYNA/Radioss keywords

## Relationship to OpenRadioss MCP ideas

HyperWorks MCP and Radioss job wrappers are valid for enterprises already on Altair. web-mbd should interoperate by:

- Importing decks those tools produce.
- Optionally calling out to OpenRadioss as `oracle_compare` in lab setups.

Do not make HyperMesh a required agent backend.

## Client-side special case

Because solve happens in the browser:

- Agents must understand **device limits** (no WebGPU → WASM fallback or refuse).
- Long solves need progress notifications (MCP progress or polling `solve_status`).
- Large binaries (OCCT/Gmsh WASM) imply cold-start; tools should report init state.

## Anti-patterns

1. Agent edits giant keyword files as the primary API.
2. Tools that only return screenshots without numeric evidence.
3. Separate “UI model” and “agent model.”
4. Allowing mass scaling / dt cheats without returning DM/M in the tool result.
5. AGPL oracle invocation from a hosted multi-tenant service without legal review.

## Implementation sketch

- Single `@web-mbd/ir` package with Zod/JSON Schema.
- `@web-mbd/mcp` implements tools against IR + runtime interfaces.
- UI and MCP are two façades over the same commands (CQRS-lite).
- Record command log for replay / debugging (“agent activity” optional later).
