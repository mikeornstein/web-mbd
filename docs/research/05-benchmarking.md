# Benchmarking performance

Separate **correctness benchmarks** (validation doc) from **performance benchmarks** (this doc).

## What to measure

| Metric | Definition | Why |
| --- | --- | --- |
| **Steps / s** | Stable explicit steps per wall second | Primary explicit throughput |
| **Element-steps / s** | elements × steps / wall time | Normalize across models |
| **µs / element / step** | Inverse intensity | Compare to Radioss/HPC literature |
| **Time to first paint / first field** | Interactive feel | Product KPI |
| **Host↔device syncs / step** | Count | Catch accidental readbacks |
| **Memory (GPU / WASM)** | Peak resident | Browser survival |
| **Energy drift @ fixed dt** | Physics quality under perf knobs | Prevent cheating via unstable dt |
| **Scalability** | vs workgroup size, vs CPU workers | Tune defaults |

## Reference workloads

### Micro (PR CI, seconds)

- 1 hex or 1 shell patch, 1e4–1e5 steps.
- 2-body contact brick on brick.
- 1k–10k element tensile coupon.

### Meso (nightly, browser-real)

- 50k–200k shell vehicle component or box crash.
- Flexible multibody arm with ANCF links + joint motors.

### Macro (manual / dedicated machine)

- Downscaled **Neon-class** (~1e5–3e5 elems) — full Neon 1M is an HPC model; browsers need honest subsets.
- Do **not** treat Taurus 10M as an in-tab goal; use it only if we ever ship a native/oracle path.

OpenRadioss HPC models (Confluence HPC Benchmark Models):

- Neon 1M — single server / few nodes; full run 80 ms simulated.
- Taurus 10M — cluster scalability; 120 ms full; shortened runs for smoke.

AWS OpenRadioss sample scripts show starter cost exploding with subdomain count — another reason our architecture should not copy Starter partitioning for interactive solves.

## Baselines to publish

1. **Internal** — WASM CPU vs WebGPU on same IR.
2. **External oracle (optional)** — OpenRadioss on identical meso model, same machine CPU, report element-steps/s. Expect native Radioss to win on large CPU counts; web-mbd wins on zero-install latency and GPU path.
3. **Browser matrix** — Chrome/Edge (Windows/Linux), Safari (Metal). Record pass/fail for WebGPU compute.

## Performance budgets (proposed product SLOs)

| Scenario | Target (aspirational v1) |
| --- | --- |
| 10k shell elements, explicit, contact off | ≥ real-time to 5× real-time on mid laptop GPU |
| 100k shells, contact on | Interactive scrub with sub-realtime solve OK; progress streaming |
| Implicit static 50k dofs | Seconds, not minutes, for well-conditioned problems |
| Load STEP + mesh display | &lt; 5 s for typical part |

Revise after first instrumented prototypes; publish measured numbers in `docs/` rather than marketing claims.

## Methodology rules

1. **Warm-up** — discard first N steps (shader compile, pipeline create).
2. **Pin dt** for throughput tests so contact-adaptive dt does not confound.
3. **Report energy error** alongside throughput — reject runs that exceed health thresholds.
4. **Determinism mode vs fast mode** — if we ever allow nondeterministic atomics, benchmark both; default product mode is deterministic.
5. **No silent mass scaling** in published benches unless the case is explicitly an AMS study.

## Instrumentation plan

- Solver emits chrome `performance.mark` / JSON trace: `step`, `contact_sort`, `contact_force`, `elements`, `reduce_dt`, `integrate`, `output`.
- CI uploads flame summaries for meso cases.
- Compare kernel shares to OpenRadioss lore: contact sort infrequent but expensive; force eval dominates.

## What OpenRadioss teaches about perf work

- Packetize work (`MVSIZ`) → choose WebGPU workgroup sizes deliberately.
- SoA + locality beats clever OOP.
- Hide communication behind compute — in-browser, “communication” is pass barriers and buffer hazards.
- AMS can buy ~3× in forming-like cases with less damage than nodal CST — if we implement it, benchmark accuracy vs speed explicitly (see Blow Molding with AMS Confluence example).

## Anti-goals

- Chasing Neon 1M realtime in Chrome as a v1 gate.
- Benchmarking only bouncing cubes.
- Comparing against LS-DYNA GPU solvers without stating model and precision differences.
