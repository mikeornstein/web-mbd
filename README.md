# web-mbd

Flexible multibody dynamics in the browser.

A client-side CAE app for nonlinear flexible multibody simulation — crash, impact, mechanisms, and large-deformation dynamics — with the analysis capability of tools like LS-DYNA, rebuilt for a modern architecture that runs locally in the browser.

No cluster. No license server. The model, the solver, and the results stay on the machine.

## Why this exists

Production crash and flexible-body codes are still 1980s–2000s Fortran stacks wrapped in desktop GUIs. They are accurate, and they are also slow to iterate on: installers, license tokens, HPC queues, and post-processors that do not live in the same place as the model.

`web-mbd` is the opposite bet:

- **Client-side first.** The solver runs in the tab (WebGPU compute + WASM), not on a remote job farm. Open a model, press run, watch it.
- **Flexible bodies, not just rigid MBD.** Joints, constraints, and contact on bodies that actually deform — shells, solids, beams — not stick-figure mechanisms with a flexibility afterthought.
- **One surface for pre, solve, and post.** Geometry, mesh, materials, contacts, time history, and field plots in a single web app. No deck-file round trip through three programs.
- **Modern internals.** Typed scene graph, GPU-resident state, incremental assembly, and a solver designed around data-oriented kernels instead of 40 years of COMMON blocks.

The goal is not a toy demo of a bouncing cube. The goal is production-shaped explicit and implicit dynamics that a structural engineer can actually use.

## Scope

| Capability | Status |
| --- | --- |
| Rigid multibody (joints, constraints, contacts) | planned |
| Flexible bodies (linear modal + nonlinear FE) | planned |
| Explicit dynamics (central difference / symplectic) | **MVP in-tree** (Taylor bar, refined mesh) |
| Implicit dynamics (Newmark / HHT, Newton–Raphson) | planned |
| Nonlinear materials (plasticity, rubber, foam) | **J2 linear hardening MVP** |
| Contact & impact (penalty, constraint, mortar) | **rigid-wall penalty MVP** |
| Shells, solids, beams, discrete elements | **hex solids MVP** |
| GPU time integration (WebGPU) | planned |
| Interactive 3D pre/post | **MVP canvas pre/post** (Taylor workbench) |
| LS-DYNA / OpenRadioss deck import | planned (oracle export + pin compare) |

### First model: Taylor bar

Copper-like cylinder into a rigid wall — the Layer-1 gate from the research notes. See [`docs/mvp-taylor-bar.md`](docs/mvp-taylor-bar.md).

```bash
pnpm install
pnpm test          # unit + Taylor golden / determinism / oracle pin
pnpm taylor        # headless Taylor bar solve + metrics
pnpm oracle:taylor # optional live OpenRadioss same-mesh compare
pnpm dev           # workbench: research → pre → solve → post
pnpm test:e2e      # Playwright proof of the same path
```

This repository is the product, not a paper. Algorithms land here when they run in the browser on real models.

## Architecture (target)

```
┌─────────────────────────────────────────────┐
│  Web app (TypeScript)                       │
│  model tree · mesh · contacts · plots       │
└───────────────────┬─────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │  Scene / model IR     │  typed, versioned
        └───────────┬───────────┘
                    │
     ┌──────────────┴──────────────┐
     │  Solver runtime             │
     │  WASM (CPU kernels)         │
     │  WebGPU (explicit, contact) │
     └──────────────┬──────────────┘
                    │
        field output · time history · energy
```

- **Model IR** — a structured, versioned representation of parts, materials, sections, contacts, BCs, and output requests. Keyword decks compile into this; the UI edits this; the solver consumes this.
- **CPU path (WASM)** — implicit solves, constraint stabilization, sparse factorization, and anything that is still sequential or poorly mapped to GPU.
- **GPU path (WebGPU)** — explicit steps, contact detection/force, element internals, and field reduction. State stays on the device across steps.
- **Determinism** — same model, same browser, same answer. Parallelism does not mean racey residuals.

## Who it is for

Engineers who already know what an hourglass mode is, and who are tired of waiting on a queue to find out they had the wrong contact thickness.

Also: researchers who want a programmable, inspectable FMBD stack they can extend without a vendor SDK.

## Research

Prior-art research (OpenRadioss Confluence + broader solver landscape) lives in [`docs/`](docs/README.md). Short version: **start fresh** for the WebGPU/WASM runtime; treat OpenRadioss as an external validation oracle and LS-DYNA/Radioss deck import target — do not fork the Fortran/MPI stack into the browser.

## Status

Research docs are in-tree. The first solver MVP (Taylor bar, explicit hex + J2 + rigid wall) runs via `pnpm test` / `pnpm taylor`, and the browser workbench loads that stock research model through pre → solve → post. WebGPU and richer field viz are next.

If you care about this problem — FE crash codes, geometric nonlinear MBD, GPU time integration, or putting serious CAE in a browser — issues and design notes are welcome.

## Develop

Install [Node.js](https://nodejs.org/) 22 or newer and [pnpm](https://pnpm.io/) 10, then:

```bash
pnpm install
pnpm dev
```

Checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The production site is [GitHub Pages](https://mikeornstein.github.io/web-mbd/). Changes land through pull requests. `main` is protected. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).

