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
| Nonlinear materials (plasticity, rubber, foam) | **J2 linear hardening MVP** + **neo-Hookean membrane inflate (letter A)** |
| Contact & impact (penalty, constraint, mortar) | **rigid-wall penalty MVP** + **TYPE19-class Gapmin kiss (node-node; not bitwise TYPE19)** |
| Shells, solids, beams, discrete elements | **hex solids MVP** + **quad membrane shells (letters A/B/C)** |
| GPU time integration (WebGPU) | planned |
| Interactive 3D pre/post | **MVP canvas pre/post** (Taylor + inflate A/B/C; mesh edges default ON) |
| LS-DYNA / OpenRadioss deck import | planned (oracle export + pin compare). **Inflate: offline OpenRadioss golden JSON only — solver not in Pages** |

### First model: Taylor bar

Copper-like cylinder into a rigid wall — the Layer-1 gate from the research notes. See [`docs/mvp-taylor-bar.md`](docs/mvp-taylor-bar.md).

```bash
pnpm install
pnpm test          # unit + Taylor golden / determinism / oracle pin + inflate Radioss gate
pnpm taylor        # headless Taylor bar solve + metrics
pnpm inflate       # headless letter-A NH inflate + warn metrics
pnpm compare:inflate # machine-diff vs checked-in OpenRadioss golden (exit 0/1)
pnpm oracle:taylor # live OpenRadioss bitwise Object.is (needs OPENRADIOSS_PATH)
pnpm dev           # workbench: research → pre → solve → post
pnpm test:e2e      # Playwright proof of the same path
```

Second stock family: letters **A / B / C** neo-Hookean inflate. Locked μ/ρ/H0;
load family **`dynamic-pload-40ms`** is the filled OpenRadioss golden (PR#8
`/PLOAD` 0→65 kPa / 40 ms). This is the **fast-load (dynamic) case only**.
**Slow-load (quasi-static) is not validated:** last measured at head `8a05992`
the toy was off 7.7% stretch, 8.8% pressure, 65% volume and the balloon folded;
that code was removed, not fixed. The Inflation ABC ~54 kPa figure is **not
claimed**. The page leads with **letter A** (the only validated letter, selected
by default). Letter B is an **unvalidated demo** (no Radioss tape). Letter C is
**hidden** (degenerate / unstable). Default view shows **mesh edges**.
OpenRadioss stays offline: the Pages app never bundles the AGPL solver. See
[`docs/mvp-inflate-a.md`](docs/mvp-inflate-a.md) and
[`docs/engineering-review-inflate-a.md`](docs/engineering-review-inflate-a.md).

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

Research docs are in-tree. The first solver MVP (Taylor bar, explicit hex + J2 + rigid wall) runs via
`pnpm test` / `pnpm taylor`. Letter-A neo-Hookean inflate is gated against a checked-in
OpenRadioss **fast-load (dynamic)** golden (`pnpm inflate` / `pnpm compare:inflate`).
The page leads with letter A. Letter B is an **unvalidated demo**; letter C is
**hidden** (degenerate / unstable). Slow-load
(quasi-static) is **not validated** (code removed, not fixed). The Inflation ABC
~54 kPa figure is **not claimed**. The AGPL solver is not in the browser. The
workbench loads research models through pre → solve → post. Default mesh shading includes
edges. WebGPU and richer field viz are next.

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

