# Kill-off as shipped default

The golden’s engine commit `6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba`
is pinned only to the OpenCourant copy, not the original OpenRadioss
tree.

Justified by measurement, not a fit to the letter:

- Engine-rate relaxation did not close the golden gap.
- Listing 2 μs step on kill-off Letter A was step-independent.
- Sphere follows the closed form: rising branch 0.9% pass, limit-point
  stretch 4.7% miss (slow creep near the flat top of the pressure
  curve), snap-through 1.1% pass, settled hold at 28 kPa 0.2% pass, at
  both step sizes. See [sphere-result.md](sphere-result.md).

Shipped default is velocity kill **off**. Rayleigh mass 80 /s stays.
No 0.18 peak kill. No continuous relaxation.

## Letter A (oriented, shipped)

Live factory freeze matches the committed kill-off tape:

- First stretch ≥ 2 at **16.00 ms**, frame **8**, stretch
  **2.105201010510652**, volume **866.08 mL**, pressure **26.01 kPa**.
- Punch-through: **false**.
- The 20 ms blow-up (stretch 12.5) was the unoriented mesh. Not this
  path.

## Letter B (listed, unvalidated, unstable past stretch 2)

Kill off. First stretch ≥ 2 at **18.00 ms**, stretch **2.028**, volume
**936.9 mL**. Punch-through **false** at the freeze. Still labeled
unvalidated / unstable past stretch 2. No Radioss tape.

## Letter C (hidden)

Kill off. Punch-through **true** at **0.94 ms**, stretch huge, volume
negative. Stays hidden.

## Compare gate

Themis surviving-deck stretch spread, every 2 ms from 0 to 16 ms.
See [every-frame-results.md](every-frame-results.md). Job name:
`compare:inflate — Themis deck-spread bar (currently misses)`.
