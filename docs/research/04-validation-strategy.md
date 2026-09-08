# Validation strategy

How we prove web-mbd is correct — without becoming OpenRadioss.

## Principles

1. **Layered evidence** — unit kernels → method benchmarks → system crash metrics → oracle diffs.
2. **Quantitative gates** — every golden test has tolerances and tracked quantities.
3. **Fail loud on model semantics** — importer coverage is part of validation.
4. **Energy and mass are first-class** — adopt Radioss-style energy error and added-mass reporting.
5. **Determinism tests** — same IR + same seed + same backend ⇒ bitwise or ulp-bounded match across thread/tile counts.

## Layer 0 — Numerical kernels

| Test | Intent |
| --- | --- |
| Floating reduction order | Parallel Arithmetic analogue on CPU and GPU |
| Shape function / B-matrix single element | Spot vs hand derivation |
| Stress update material points | Plasticity, hyperelastic return maps |
| Contact gap/force on two-facet fixture | Penalty stiffness scaling |
| Time integrator on SDOF spring-mass | Analytic period / energy drift |

Run on both WASM reference and WebGPU path; diff within ulps.

## Layer 1 — Verification (code solves the equations it claims)

Classic explicit / contact / plasticity suites:

| Benchmark | Why |
| --- | --- |
| **Taylor bar** (elastic-plastic cylinder on rigid wall) | Large strain, contact, plasticity; compare final length/radius to published/test (OptiStruct OS-V:1200 style tables) |
| **Elastic wave / bar impact** | Wave speed, free-end velocity |
| **Single element patch tests** | Constant stress/strain, hourglass free modes controlled |
| **NAFEMS contact** (R0081 / R0094 families) | Hertz, punch, friction stick-slip — even if quasi-static via dynamic relaxation |
| **Cantilever / spinning ANCF beam & shell** | Chrono validation cases vs literature |
| **Rigid pendulum / four-bar** | Constraint stabilization, energy |

Accept tolerances as % or absolute bands documented per case.

## Layer 2 — Method of manufactured solutions / manufactured energy

For continuum kernels where contact is absent: impose smooth manufactured motion, derive body force, measure L2 error vs refinement. Use for regression when changing GPU kernels.

## Layer 3 — OpenRadioss oracle comparison

Pin a version of OpenRadioss in CI (native container, not in-browser).

Workflow:

1. Author or import a deck that OpenRadioss runs cleanly.
2. Compile the same model into web-mbd IR (via importer or dual-written fixture).
3. Run both to the same termination time with comparable output requests.
4. Diff:
   - Global: internal energy, kinetic energy, contact energy, hourglass energy, mass, DM/M, wall/contact force peaks and timing.
   - Traces: selected node displacements/velocities, section forces.
   - Fields (optional): probe locations, not full mesh bitwise.

**Success policy (initial):**

- Energy balance / peaks within **5–10%** on intentionally simple models.
- Tighten per-feature as formulations align.
- Never require bitwise match to OpenRadioss (different hourglass/contact defaults will disagree).

Use public models carefully (NCAC vehicles, Camry/Yaris examples, CarCrashNet comparisons) as **aspirational** system tests — too heavy for default CI; nightlies or manual.

## Layer 4 — Physical / published references

Where OpenRadioss itself was correlated to tests (e.g. published vehicle pulses), treat physical data as the outer ring. Document that web-mbd→OpenRadioss agreement ≠ automatic test agreement.

## Importer validation

Separate suite:

- Parse golden `.key` / `.rad` snippets → IR.
- Emit **coverage JSON**: keyword, mapped IR entity, status (`exact`, `approx`, `unsupported`).
- Round-trip IR → canonical JSON snapshot tests.
- Negative tests: unsupported cards must error or warn at chosen strictness level (default **strict** in CI).

## Runtime health checks (every solve)

Mirror Radioss engineer practice in the UI and MCP:

- Energy error % time history with thresholds.
- Mass growth / DM/M if any scaling or constraint mass.
- dt history and % of steps at contact-limited dt.
- Divergence detectors (NaN, exploding energy) → hard stop with actionable message.

## QA harness shape (proposed)

```
tests/
  unit/           # kernels, materials
  method/         # Taylor, NAFEMS, ANCF, MBD
  import/         # deck coverage
  oracle/         # optional OpenRadioss diffs (CI flag)
  determinism/    # tile/thread permutations
```

Gate merges on `unit` + `method` + `import` + `determinism`. Run `oracle` on main/nightly when the native binary is available.

## What not to do

- Ship features validated only by “looks like a crash video.”
- Claim LS-DYNA compatibility without oracle or mapping tests.
- Hide mass scaling without DM/M visualization.
- Compare different contact formulations without documenting the delta.
