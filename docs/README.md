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
| [09 — Oracle bitwise floor](research/09-oracle-bitwise-floor.md) | Taylor H8C/LAW2 residual = truncation; shared-kernel path to Object.is |

## MVP models

| Doc | What it covers |
| --- | --- |
| [Taylor bar](mvp-taylor-bar.md) | J2 hex + rigid wall + OpenRadioss bitwise oracle |
| [Letter A inflate](mvp-inflate-a.md) | Neo-Hookean membrane + fast-load (dynamic) pressure ramp + banded open Radioss reference on a consistently outward-oriented mesh. Slow-load is not validated. The Inflation ABC ~54 kPa figure is not claimed. Source letters B/C still have inconsistent winding (404 of 2178 and 412 of 1972 triangles); the inflate refine ladder inherits that winding unless fixed. |
| [Sphere check (closed form)](diag-pr18-openradioss-control/sphere-result.md) | Recorded slow-sphere result: rising branch 0.9% pass, limit-point stretch 4.7% miss (flat top of the pressure curve), snap-through 1.1% pass, 28 kPa hold 0.2% pass, both step sizes. |
| [Kill-off default / every-frame Themis gate](diag-pr18-openradioss-control/kill-off-default-results.md) | Shipped velocity kill off. Letter A freeze 16 ms stretch 2.105, no punch. Stretch is validated at the 16 ms freeze and lags the decks earlier in the run. Themis surviving-deck spread (triangle in through ~11.5 ms) still misses overall. |
| [Stretch diagnostics (rules first)](diag-pr18-openradioss-control/stretch-diagnostics-prediction.md) | Read-only energy / median / time-shift measurement. Rules committed before the run. Not a gate. |
| [Inflate engineering review](engineering-review-inflate-a.md) | Nine Trust elements; fast-load only |
| [Radioss slow-load desk](radioss-qs-desk.md) | Reference-only OpenRadioss slow-load tape (`gate: none`; not used by any gate) |

## Sources

Primary OpenRadioss materials reviewed:

- [OpenRadioss Confluence space](https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/overview?homepageId=1016017)
- [OpenRadioss GitHub](https://github.com/OpenRadioss/OpenRadioss) (AGPL-3.0)
- [openradioss.org](https://www.openradioss.org/)
- Altair Radioss Theory Manual (2022) — formulations, elements, contact, materials
- Altair Radioss user docs — starter/engine workflow, LS-DYNA keyword mapping, results checking

See [references/sources.md](references/sources.md) for the full bibliography.
