# web-mbd documentation

Research and design notes for building a client-side flexible multibody / explicit dynamics CAE stack.

## Research (prior art)

| Doc | What it covers |
| --- | --- |
| [00 — Executive summary](research/00-executive-summary.md) | Verdict: start fresh, treat OpenRadioss as oracle |
| [01 — OpenRadioss deep dive](research/01-openradioss-deep-dive.md) | Architecture, algorithms, Confluence findings, pitfalls |
| [02 — Build, fork, or fresh](research/02-build-fork-or-fresh.md) | Decision matrix, AGPL implications, reuse patterns |
| [03 — Solver prior art](research/03-solver-prior-art.md) | Crash codes, FMBD, modern FE, browser/GPU stacks |
| [04 — Validation strategy](research/04-validation-strategy.md) | Unit → method → system → oracle comparison |
| [05 — Benchmarking](research/05-benchmarking.md) | Correctness vs performance metrics, Neon/Taurus, browser budgets |
| [06 — Geometry, meshing, pre/post](research/06-geometry-meshing-prepost.md) | CAD kernels, meshers, unified UI, I/O formats |
| [07 — Agentic APIs / MCP](research/07-agentic-apis-mcp.md) | Model IR as the agent surface, tool design |
| [08 — Architecture recommendations](research/08-architecture-recommendations.md) | Concrete build plan for web-mbd |

## Sources

Primary OpenRadioss materials reviewed:

- [OpenRadioss Confluence space](https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/overview?homepageId=1016017)
- [OpenRadioss GitHub](https://github.com/OpenRadioss/OpenRadioss) (AGPL-3.0)
- [openradioss.org](https://www.openradioss.org/)
- Altair Radioss Theory Manual (2022) — formulations, elements, contact, materials
- Altair Radioss user docs — starter/engine workflow, LS-DYNA keyword mapping, results checking

See [references/sources.md](references/sources.md) for the full bibliography.
