# Prediction: toy 0.18 velocity kill switched off

Written **before** any kill-off run. Diagnosis only. Default toy, 2/5/5 bands,
stiffness, load law, and `compare:inflate` stay unchanged.

This file records (1) what the Radioss adaptive-dynamic-relaxation engine card
actually is, then (2) the one-mechanism prediction and what would refute it.

## Step 1 — read first (no runs)

Official page used:
https://help.altair.com/hwsolvers/rad/topics/solvers/rad/adyrel_engine_r.htm
(same text at
https://2026.help.altair.com/2026/hwsolvers/rad/topics/solvers/rad/adyrel_engine_r.htm).
The card is based on dynamic relaxation
https://help.altair.com/hwsolvers/rad/topics/solvers/rad/dyrel_engine_r.htm.

OpenRadioss uses the same engine-card format. The listing already committed
under `radioss/A-inflate/run/` is from this package (engine commit
`6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`); it was not regenerated for this
step.

### (a) Exact parameters from the deck

**read-from-file.** Engine file `radioss/A-inflate/Ainflate_0001.rad` lines 21–25:

```
# /ADYREL = adaptive dynamic relaxation (OpenRadioss engine).
# Radioss has no PARAM,INREL — that keyword is OptiStruct only.
/ADYREL
/END
```

The card is a bare `/ADYREL` with **no** start-time line and **no** stop-time
line. The next keyword is `/END`. Run time on `/RUN` is `0.05` seconds (50 ms).
Pressure ramp on the starter card is 0 → 65 000 Pa in 0.04 s (40 ms), then hold
to 0.05 s.

**read-from-documentation.** Optional fields and defaults:

| field | in this deck | default if omitted |
| --- | --- | --- |
| start time | omitted | 0.0 s |
| stop time | omitted | final time of the analysis (`/RUN` = 0.05 s) |

The listing (`radioss/A-inflate/run/Ainflate_0001.out`) prints
`FINAL TIME = 0.05` and, under `ADAPTIVE DYNAMIC RELAXATION`,
`NODE GROUP ID (=0 ALL NODES) = 0`. No start/stop times are printed, matching
the omitted optional line. **read-from-file.**

### (b) Time window: does it act during the 40 ms pressure ramp?

**read-from-documentation.** If start and stop times are not included, adaptive
dynamic relaxation “is active until the end time defined by `/RUN`.” Defaults
are start 0.0 s and stop = final analysis time.

**read-from-file.** `/RUN` final time is 0.05 s. The 40 ms ramp is 0–0.04 s,
inside that window.

**Plain answer:** it **is active during the whole 40 ms pressure ramp**, and
through the 10 ms hold, unless the run dies earlier. It is **not** a
pre-load-only step. The documentation does **not** describe a convergence test
that turns it off by itself; the only documented off-switch is the optional
stop time, which this deck does not set.

This **does not** weaken the 0.18 explanation on time-window grounds. The
Radioss card is on while pressure is ramping.

### (c) What it does to velocities or energy

**read-from-documentation.** `/ADYREL` is “dynamic relaxation with auto-defined
adaptive damping.” Comment 1: it is based on `/DYREL`, but “the period to be
damped is automatically calculated and varies during the simulation.”

`/DYREL` is a **velocity update each step**, not a one-shot kill:

- relaxation factor β (default 1)
- period T
- ω = β Δt / T
- V_{t+Δt} = (1 − 2ω) V_{t−Δt/2} + (1 − ω) γ_t Δt

That **damps** velocities using an automatically chosen period. It does **not**
zero all velocities. It does **not** multiply all velocities by a fixed 0.18
at kinetic-energy peaks.

**guess (clearly marked):** the toy’s 0.18 scale at kinetic-energy peaks is an
Underwood-style residual-velocity kill. That is a **different algorithm** from
the documented Radioss card. The time window supports “Radioss is relaxing
during the ramp.” The **mechanism** does not support “Radioss does the same
0.18 peak kill.” This test still turns the toy kill off, because that is the
one-mechanism check. It does not claim 0.18 is what Radioss implements.

### (d) Did it actually run, and when?

**read-from-file.** Engine listing `Ainflate_0001.out` line 102–103, **before
cycle 0**:

```
 ADAPTIVE DYNAMIC RELAXATION
 NODE GROUP ID (=0 ALL NODES) . . . . . . . . . .          0
```

So the engine **parsed and enabled** the card for every node at start. The
cycle table then prints kinetic energy every 200 cycles from t = 0 through
runaway (~22 ms). Kinetic energy is **never** zero after t = 0 (example:
0.0636 J at 2.8 ms, 0.012 J around 8–12 ms, 1.85 J at 20.8 ms, then tens of
joules as the shell blows). The run ends with
`ERROR : NODAL TIME STEP LESS OR EQUAL DTMIN`, not with a message that
relaxation stopped.

**read-from-file.** `engine.log` has **no** per-cycle “relaxation triggered”
lines. The listing also has **no** later “adaptive dynamic relaxation off”
line.

**guess (clearly marked):** there is no discrete “it triggered at time X”
event in this log. Combined with (b), it was **on from t = 0** until the
timestep crash (~22 ms), continuously, not as a peak-kill at selected times.

## Step 2 — prediction (before any kill-off run)

**Prediction (the claim under test):**

With the toy’s 0.18 velocity kill **switched off** (oriented mesh, otherwise
the same locked law and load):

1. Toy stretch at **2 ms** moves from **1.12 toward Radioss 1.71** (closer than
   the current 1.12, not farther).
2. Stretch, volume, and pressure over the **whole overlapping run** stay inside
   **2% / 5% / 5%** of the matching Radioss tape.

Matching a **single frame** (including 2 ms alone, or first stretch ≥ 2 alone)
does **not** count as support.

The unoriented mesh with the kill **on** must still reproduce the old ~0.3%
match at first stretch ≥ 2. That is the baseline that the package already
passed; if it fails, the experiment is broken and the prediction is not tested.

### What result would refute it

Any one of these refutes the prediction:

- At 2 ms, oriented stretch does **not** move toward 1.71 (stays near 1.12, or
  moves away).
- Any overlapping frame has stretch error **> 2%**, or volume error **> 5%**,
  or pressure error **> 5%**. A late snap (stretch 1.61 → 4.33 while Radioss
  has already run away, or a new snap at another time) is a refute, even if
  2 ms looks better.
- Unoriented + kill on no longer matches the old Radioss unoriented tape
  inside the same bands (~0.3% was the published match).

If the kill-off run moves 2 ms stretch toward 1.71 but the rest of the curve
leaves the bands, the 0.18 kill is **implicated in the early lag** and
**rejected as the whole-run explanation**. That is still a refute of this
prediction as written. No scale number will be fitted afterward.

If the kill-off run barely changes 2 ms stretch, the 0.18 kill is **not** the
mechanism of the 1.12 vs 1.71 lag, even though Radioss relaxation is on during
the ramp.

### Runs that will be made after this file is committed (not yet run)

| id | mesh | toy 0.18 kill | Radioss tape |
| --- | --- | --- | --- |
| A | oriented (fingerprint `f9635c7f`) | **off** | oriented Ismstr-2 |
| B | unoriented as-wound (`d9c56487`) | **off** | unoriented OpenCourant |
| C | unoriented as-wound (`d9c56487`) | **on** (baseline) | unoriented OpenCourant |

Kill off/on only through a diagnostic flag or environment variable. Default
toy stays kill **on**. No stiffness, load-law, band, or `compare:inflate`
change.
