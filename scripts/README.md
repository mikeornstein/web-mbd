# Live OpenRadioss probes

Kept scripts for re-checking Taylor oracle parity (need `OPENRADIOSS_PATH` and
usually `WMBD_OR_CALL_S8E=1` + relinked `libwmbd_or_hex.so`).

| Script | Purpose |
| --- | --- |
| `or-mesh-adaptive-vs-live.ts` | Adaptive OR-mesh vs live `.f64bin` |
| `f64bin-fixed-dt-probe.ts` | Fixed-Δt Object.is horizon |
| `f64bin-vs-wmbd.ts` | Coarse/production live compare |
| `f64bin-smoke.ts` | Quick f64bin runner smoke |
| `mass-vs-live.ts` | Lumped MS vs live dump |
| `mvsiz-nel16-probe.ts` | NEL=16 vs NEL=1 |
| `replay-or-dt-schedule.ts` | Replay live DT schedule |
| `probe-sta-divergence.ts` | E20.13 `.sta` floor |

Ephemeral bisect probes were removed before merge; see
`docs/research/09-oracle-bitwise-floor.md`.
