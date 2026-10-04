# Element-type diagnosis decks

Do not replace `radioss/A-inflate` (the golden). Same material, density, 0→65 kPa / 40 ms pressure, `/ADYREL` + Rayleigh 80.

- `sh3n/` — each golden four-node shell split into two `/SH3N` on diagonal 0–2.
- `qeph/` — same golden mesh, property `Ishell=24` (QEPH), Ismstr=10 as written on golden.
- `qeph-ismstr2/` — same QEPH, Ismstr=2 (the strain flag this package actually runs on the golden).
- `fine/` — inflation-abc A-fine 1-to-4, re-oriented outward, `Ishell=1`.
