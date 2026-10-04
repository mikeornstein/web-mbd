# Radioss `/DYREL` and `/ADYREL` as documented

Written after `adyrel-continuous-prediction.md` was committed, and
**before** any new toy run. No period or factor is invented here.

Pages read (2025, 2026, and unversioned `help.altair.com` carry the
same text):

- `/ADYREL`: https://help.altair.com/hwsolvers/rad/topics/solvers/rad/adyrel_engine_r.htm
  also https://2026.help.altair.com/2026/hwsolvers/rad/topics/solvers/rad/adyrel_engine_r.htm
  and https://2025.help.altair.com/2025/hwsolvers/rad/topics/solvers/rad/adyrel_engine_r.htm
- `/DYREL`: https://help.altair.com/hwsolvers/rad/topics/solvers/rad/dyrel_engine_r.htm
  also https://2026.help.altair.com/2026/hwsolvers/rad/topics/solvers/rad/dyrel_engine_r.htm
  and https://2025.help.altair.com/2025/hwsolvers/rad/topics/solvers/rad/dyrel_engine_r.htm
- `/DAMP` (deck’s Rayleigh card, not the relaxation card):
  https://help.altair.com/hwsolvers/rad/topics/solvers/rad/damp_starter_r.htm

## `/DYREL` — formula, period, factor, defaults

**read from docs** (`/DYREL` page, all three URLs above).

Engine keyword. Format:

```
/DYREL
β    T
```

| field | meaning | default if omitted |
| --- | --- | --- |
| β | relaxation factor | **1.0** |
| T | period to be damped | **none listed** |

Velocity update, quoted from the page’s definition of T:

\[
V_{t+\Delta t} = (1 - 2\omega)\, V_{t - \Delta t/2} + (1 - \omega)\, \gamma_t\, \Delta t
\]

with

\[
\omega = \beta\, \Delta t / T
\]

That is a **per-step** velocity update. It is not a one-shot scale of
all velocities at a kinetic-energy peak. The page does not define
γ_t in words; **inference:** γ_t is the nodal acceleration at time t
(standard central-difference notation). That inference is not used
to pick a number.

The page does **not** give a default for T. T is a required user
field on `/DYREL`.

## `/ADYREL` — formula, period, factor, defaults

**read from docs** (`/ADYREL` page, all three URLs above).

Engine keyword. Format:

```
/ADYREL
Tstart    Tstop
```

The start/stop line is optional.

| field | meaning | default if omitted |
| --- | --- | --- |
| Tstart | start time | **0.0 s** |
| Tstop | stop time | **final time of the analysis** |

Comments on that page, quoted in substance:

1. `/ADYREL` is based on `/DYREL`, **but the period to be damped is
   automatically calculated and varies during the simulation**.
2. If start and stop times are not included, adaptive dynamic
   relaxation is active until the end time defined by `/RUN`.

The `/ADYREL` page does **not** list β. It does **not** list T as a
user field. It does **not** give a formula for the automatic period.
It does **not** give a default numerical period. It does **not**
repeat the `/DYREL` velocity-update equation (it only says it is
based on `/DYREL`).

**inference (not used as a constant):** a bare `/ADYREL` uses the
`/DYREL` update with β = 1 (the `/DYREL` default) and some
time-varying T that Radioss computes internally. The help pages do
not say how T is computed, so that T cannot be copied into the toy.

## This deck’s actual settings

**read from file.** Engine `radioss/A-inflate/Ainflate_0001.rad`:

```
/ADYREL
/END
```

Bare card. No Tstart, no Tstop, no β, no T. `/RUN` final time is
0.05 s. **read from docs:** omitted Tstart = 0.0 s, omitted Tstop =
final `/RUN` time, so the card is on from 0 through 50 ms, including
the 0–40 ms pressure ramp.

**read from file.** Starter `radioss/A-inflate/Ainflate_0000.rad`
`/DAMP/1`:

```
                  80                 0.0         1         0                 0.0               1E+30
```

**read from docs** (`/DAMP` page): Rayleigh viscosity
C = α M + β K. This line is mass coefficient α = **80 per second**,
stiffness coefficient **0**, node group 1, no skew, start 0, stop
1e30. That mass damping is already in the toy (`RAYLEIGH_ALPHA = 80`).
It is a separate card from `/ADYREL`. It does not supply T.

## What is pinned vs what is missing

Pinned, **read from docs** plus this deck:

- Velocity update (the `/DYREL` equation above).
- Relaxation factor β default **1.0** on `/DYREL`. `/ADYREL` does not
  override it.
- `/ADYREL` start 0, stop = `/RUN` end (0.05 s here).
- Rayleigh mass α = 80 /s, already implemented.

**Not pinned** on either help page, and **not on the deck**:

- The period T that `/ADYREL` “automatically calculated and varies”.
- Any substitute for T (frequency, highest eigenmode, kinetic-energy
  period, mesh-wave time, …).
- Any numerical ω other than ω = β Δt / T, which still needs T.

The toy cannot evaluate ω without T. Inventing T, or fitting it so
the 0–16 ms curve looks like Radioss, is forbidden by the work
order.

## Stop

Step 1 fails here. Continuous relaxation is **not** implemented. The
0.18 peak kill is **not** replaced. The shipped default is **not**
changed. The sphere check, the every-frame scoring test, and the
0–16 ms table are **not** run.

User choice needed before anything else: a **documented** source for
the automatic period (a help page, theory manual section, or an
explicit T you will accept as this deck’s setting). OpenRadioss
source is not a help.altair.com page and will not be used unless you
say so. No fitted constant.
