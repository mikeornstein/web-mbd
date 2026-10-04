# How the engine chooses the adaptive relaxation period

Description only. No toy change in this file. No source copied.

The public tree `github.com/OpenRadioss/OpenRadioss` currently returns 404
from this environment. The same engine paths were read from
`github.com/OpenCourant/OpenCourant` (community continuation). The golden
listing `radioss/A-inflate/run/Ainflate_0001.out` prints
`CommitID: 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`. The period routine at
that commit has the same 200-cycle first-on constant. **read from code**
and **read from file**.

**License (for the user to decide):** that engine is licensed under the
GNU Affero General Public License. This note is independent prose. Copying
the engine source into web-mbd is not done here and could put web-mbd under
that license.

## Factor

**read from docs** (`/DYREL` help page): relaxation factor β defaults to
**1**. **read from code** (`engine/source/input/freform.F` 707): a bare
`/ADYREL` also sets the factor to 1. The optional `/ADYREL/FREQ_` filter
frequency is **0** on a bare card (`freform.F` 682), so energies are **not**
low-pass filtered before the period is measured (`static.F` `E_PERIOD`,
212–306: the filter is used only when that frequency is positive).

The help-page update is

\[
V_{t+\Delta t}=(1-2\omega)\,V_{t-\Delta t/2}+(1-\omega)\,\gamma_t\,\Delta t,
\qquad
\omega=\beta\,\Delta t/T.
\]

**read from code** (`static.F` `STATIC`, 84–96): the engine applies the
same update by changing nodal acceleration each step, with a single rate
`BETATE` in place of β / T, using the half-step time increment `DT12`. So
the quantity to implement is that rate, in per second. When the rate is
positive, the help-page period is T = 1 / rate (β = 1). **inference**, not
a fitted number.

## What T is computed from (physics)

T is **not** a user number on `/ADYREL`. **read from code**
(`static.F` `E_PERIOD` 279–301 and `ENER_W0` 313–431):

It is the **longest time, so far, that internal energy has been rising**,
or the **longest time that kinetic energy has been rising**, whichever the
update rule uses on that step.

Two global scalars are watched, every engine cycle:

1. Internal energy (the engine’s `ENINT`).
2. Kinetic energy = translational kinetic energy plus rotational kinetic
   energy (the engine’s `ENCIN + ENROT`).

**computed by a previous run** (golden listing): rotational kinetic energy
prints as 0.000 at every 200-cycle row, so on this deck the kinetic scalar
is translational only.

A **peak** of either scalar is declared when that scalar is lower on this
step than on the previous step, and is not negative. At a peak, that
scalar’s rising-time clock is reset to zero. Each step, both clocks
advance by the current time increment `DT1`, and the engine keeps the
**maximum** rising time seen for internal energy and for kinetic energy.

Those two maxima are the periods. The candidate rate is **one over that
period**, then limited as below.

## How often it updates

**read from code** (`resol.F` 8594): the period routine runs **once per
engine cycle** when `/ADYREL` is on (`ISTAT = 3`, set at `freform.F` 710).
The acceleration update runs every cycle while time is between start and
stop (`resol.F` 7593–7600, `static.F` 78–81).

The **clocks and the two max periods update every cycle**. The **rate**
changes only when:

- a peak of internal energy is seen, or
- a peak of kinetic energy is seen, or
- the rate is still zero after **200** cycles and internal energy is
  above a tiny floor, or
- the rate has already been turned on, no peak this cycle, and the rate
  is more than **1.1** times one over the larger of the two max periods
  (then it is cut back to that one-over-period value).

**read from code:** 200 is `NC_ACT` (`static.F` 337). The 1.1 is a literal
in `static.F` 425–426.

## Initial value

**read from code:**

- Parse time (`freform.F` 707–709): factor 1, user period field 0, rate 0.
- Starter restart record (`starter/source/restart/ddsplit/wrcomm.F`
  306–309): the saved rate, both energy memories, both clocks, both max
  periods, and the filter scratch are **zero**.
- Cycle 0 (`static.F` 347–360): the live rate is copied from that saved
  value (zero on a first run) and the period routine **returns** without
  applying the 200-cycle rule yet.

So the rate is **0** until cycle 200, then the first-on value below, unless
a peak has already fired the same first-on branch.

Start time 0, stop time = run end if omitted (`freform.F` 683–686,
`static.F` 78). This deck is a bare `/ADYREL`, so the card is on from 0
to 50 ms. **read from file** plus **read from docs**.

## Constants (all from the source, none fitted)

| symbol | value | where |
| --- | ---: | --- |
| factor β | 1 | `freform.F` 707; `/DYREL` help default |
| first-on wait | 200 cycles | `static.F` 337 |
| rate cap (no AMS) | 0.01 / Δt | `static.F` 370; `constant_mod.F` 658 `EM02 = 0.01` |
| first-on rate | 0.01 × cap = **10⁻⁴ / Δt** | `static.F` 375 |
| AMS cap (not this deck) | 0.05 / Δt | `static.F` 372; `constant_mod.F` 692 |
| internal-energy floor (double precision) | 10⁻¹² | `static.F` 365–366; `constant_mod.F` 668 |
| kinetic / internal ratio below which a kinetic peak is ignored | 0.001 | `static.F` 407; `constant_mod.F` 659 |
| kinetic-peak rate must already be below 1.5 × candidate | 1.5 | `static.F` 407; `constant_mod.F` 747 |
| kinetic-peak rate is not cut below half its current value | 1/2 | `static.F` 408–410 |
| no-peak cutback trigger | 1.1 × (1 / max period) | `static.F` 425–426 |
| filter frequency on a bare card | 0 (off) | `freform.F` 682 |

After the rate has been turned on, an **internal-energy peak** sets the
rate to the **minimum** of its current value and min(cap, 1 / max internal
rising time). A **kinetic peak**, once on, only adjusts the rate if
kinetic energy is more than 0.001 of internal energy; the new value is
clamped between half the old rate and min(old rate, min(cap, 1 / max
kinetic rising time)). The rate is therefore **not increased** after
first-on, except that the half-old-rate floor can hold it up a little on
a kinetic peak. **read from code** (`static.F` 377–413).

## Rayleigh 80 per second

**read from code:** mass Rayleigh damping is a **different** routine
(`engine/source/assembly/damping.F`, using the starter `/DAMP` α). It is
called from `resol.F` around 7483–7510. The period routine does **not**
read α. A bare `/ADYREL` does **not** change its constants because this
deck also has Rayleigh 80 per second.

**inference:** 80 per second still changes the motion, so it can change
**when** the energies peak, and therefore the measured T. That is coupling
through state, not a second formula.

## Can the toy compute this from its own state?

**Yes**, with no fitted number. **read from code.** Each step the toy
already has:

- translational kinetic energy (rotational = 0, matching this listing),
- internal energy,
- the time increment,
- the step count.

Those are exactly the inputs. The constants in the table are pinned.

## Effective rate over 0 to 16 ms, next to Rayleigh 80 /s

The live rate is β / T with β = 1, i.e. `BETATE` in per second.

**read from code:** 0 until cycle 200, then first-on value **10⁻⁴ / Δt**,
then only down (or held) as 1 / (longest rising time) if that is smaller.

**computed from the golden listing** (`Ainflate_0001.out` cycle table;
print every 200 cycles, so peaks between prints are not resolved):

| time | cycle | Δt (s) | 10⁻⁴ / Δt (first-on scale) | 0.01 / Δt (cap) |
| --- | ---: | ---: | ---: | ---: |
| 0 | 0 | 2.274×10⁻⁵ | 4.4 /s (not yet applied) | 440 /s |
| 2.79 ms | 200 | 1.971×10⁻⁶ | **51 /s** | 5070 /s |
| 15.98 ms | 4800 | 4.026×10⁻⁶ | 25 /s if first-on were redone; it is not | 2480 /s |

Internal energy in that table rises after an early dip (0.189 J at
2.79 ms, 0.166 J at 4.04 ms, then up through 6.26 J at 16.0 ms). Kinetic
energy is 0.064 J at 2.79 ms, down to ~0.011 J near 7 ms, then slowly up.
Rotational kinetic energy is 0. **computed by a previous run.**

**guess (not a per-cycle print of the rate):** from 2.8 ms to 16 ms the
adaptive rate stays on the order of **50 per second** (same order as
Rayleigh **80 per second**), because first-on is ~51 /s at the 2.8 ms
step, later 1 / (several milliseconds of rising internal energy) is
smaller than the cap but not smaller than ~50 /s until the rise is longer
than about 20 ms. This is **not** computed. A later implementation can
print the toy’s rate every sample; this file does not run that.

Compared with the toy’s current 0.18 peak-kill: that is a different
mechanism (`ISTAT = 2` kinetic-energy relaxation zeros velocities at
peaks; `freform.F` 634–656). `/ADYREL` is `ISTAT = 3`, a continuous
per-step rate of tens per second, not a 0.18 scale at peaks. **read from
code.**

## Mapping to the help page, in one paragraph

β = 1. T is the longest rising time of internal or kinetic energy, with
the first 200 cycles using T_first = 10⁴ Δt instead (rate 10⁻⁴ / Δt).
Each step ω = (β / T) Δt = rate × Δt, and accelerations are mixed with
velocities as on the `/DYREL` page. No other constant is required.
