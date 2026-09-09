# Oracle bitwise parity (Taylor H8C / LAW2)

## Status

**Achieved:** production adaptive Taylor bar is `Object.is` vs same-mesh live
OpenRadioss on shape metrics and ID-aligned nodal coords (host `.f64bin`).

| Case | Path | Result |
| --- | --- | --- |
| Fixed Δt ≥10 steps (2×2×4) | TS + OR-ABI | Object.is (vitest) |
| Adaptive 80 μs (2×2×4) | OR mesh SCUMU3 | Object.is (vitest) |
| Adaptive 80 μs (6×6×16) | OR mesh SCUMU3 + starter `NODES%MS` | Object.is (`pnpm oracle:taylor`) |

Pin: `src/oracle/taylor-bar-oracle.json` (`bitwiseEqual` / `coordsBitwiseEqual`,
`forceBackend: or-mesh-scumu3+live-ms`). Gates require Object.is on the default
oracle path (`WMBD_OR_MESH=0` keeps the TypeScript ulp-floor backend).

## How it matches

1. **Shared FORINT** — `assembleInternalForcesOrMesh` → `S8EFORC3` in MVSIZ
   packets ≤128, scatter via live `SCUMU3` into `anod`.
2. **Same starter masses** — inject `NODES%MS` from `wmbd_postforint_0.f64bin`
   (same exported deck). Standalone TS center-volume mass still differs ~1 ulp
   on some production nodes vs starter JCVT=1 local DET.
3. **Matched CD** — cold `DT1=0`, constitutive uses `DT1`, `RADIOSS_ONEP333`,
   hierarchical DETDP DELTAX, LAW2 AMU via `ρ₀·(V₀/V)/ρ₀−1`, ACCELE `A=F·(1/MS)`,
   `/RWALL` kinematics, F20-snapped X0, scrub `|x|≤1e-18`, earliest STATE dump
   (not TSTOP overshoot).

## Float64 state path

Anim→VTK is float32. Prefer host `.f64bin` (patched `stat_node.F`) over E20.13
`.sta`. See `docs/research/or-f64bin-host-dump.md` and
`docs/research/or-patches/`.

## Kept probes

| Script | Role |
| --- | --- |
| `scripts/or-mesh-adaptive-vs-live.ts` | Adaptive OR-mesh vs live (optional `WMBD_OR_LIVE_MS=1`) |
| `scripts/f64bin-fixed-dt-probe.ts` | Fixed-Δt Object.is horizon |
| `scripts/f64bin-vs-wmbd.ts` | Production/coarse live compare |
| `scripts/mass-vs-live.ts` | Lumped MS vs live (coarse Object.is) |
| `scripts/mvsiz-nel16-probe.ts` | NEL=16 ≡ NEL=1 (ruled out packet-width floor) |
| `scripts/replay-or-dt-schedule.ts` | Live DT schedule replay |
| `scripts/probe-sta-divergence.ts` | E20.13 `.sta` floor |

## Historical notes

Early residuals (~1e-5 adaptive) were DT₀ phase (`ONEP333` + hierarchical
DELTAX), then cycle-0 constitutive `DT1`, then GradN/VOL hierarchical AJ, then
SCUMU3 `anod` vs F11 re-gather. Multi-NEL width alone was not the floor
(NEL=16 ≡ NEL=1). Detail dumps: `docs/research/av-dumps/`,
`docs/research/adaptive-dumps/` (NCYCLE 0–2 samples).
