# Inflation toy: where it stands, and the one decision for Mike

Everything below is measured on pull request 22 (draft), latest checked head `3358afe`, against four reference runs of the OpenRadioss engine through the OpenCourant community copy (the "decks": golden, Ishell 24, fine, triangle). The golden's engine commit is `6ac7e7d`. Nothing was tuned to make these numbers look better. Nothing is merged or published.

## Missed bars (Themis's strict test — all still fail on this head)

Energy was Chiron's bar. Themis's bar that gates by default is the stretch-vs-surviving-decks spread. None of these are waved through. Option 1 keeps every one on record as missed; Mike is the one who would be lowering all of them, including the default spread-based stretch bar.

- **Stretch outside surviving-deck spread (compare:inflate — Themis's default gate).** Frame tally: inside the surviving-deck spread at 2, 6 and 8 ms; at 4 ms the toy is 4.5% below the triangle deck (outside); outside at 10 to 16 ms; at the 16 ms freeze about 1.08% low (inside the old 2% band, still outside the spread). This is the default bar that gates.
- **Node distance.** Toy-to-deck node distance is 2.6–3.2× the deck-to-deck gap, against a bar of 1.0×, at 4, 8 and 16 ms.
- **Median stretch.** About 12.5% low at 8 ms (passes about 3% low at the 16 ms freeze).
- **Shift spread.** 0.59 ms against a bar of 0.5 ms.
- **Energy (Chiron's bar).** 0.003 J under the lowest deck at 8 ms (0.771 J vs 0.774 J).

## On record (must stay on this page)

- Old mesh was wound inward; earlier Letter A pass withdrawn.
- Sphere check: rising branch 0.9% (pass), snap-through 1.1% (pass), limit point 4.7% short (miss, kept as recorded).
- Velocity kill switched off (shipped default).
- Explicit: Letter B stays labeled unstable; Letter C stays hidden. Option 1 is Letter A only — "Letter A only" alone is not enough.
- Official OpenRadioss release link returns 404; golden pinned to OpenCourant commit `6ac7e7d`. The AGPL licence line rides on the final approval card — this page notes that, and does not put the licence text here.

## What is established

(The "16 ms freeze" is the moment the film's most stretched spot first reaches double its length, which is where the freeze comparison is made.)

- **At the 16 ms freeze the toy is close on several scalars.** The film's stored strain energy, as the engine reports it, is within 1.4% of the golden deck, median film stretch is about 3% low, and volume and pressure are within 5%. That does not clear the missed bars above.
- **The film is the same film.** Mass is identical in the toy and every deck (0.01792624 kg; same density, thickness and area).
- **Stored strain energy mid-run.** At 8 ms the toy stores 0.771 J; the decks store 0.774 to 0.794 J.
- **The old "maximum stretch lags by 3.5 ms" claim is retired.** On the wobble-blind measure the maximum-stretch shift is about zero (−0.08 ms), so the earlier 3.46 ms figure was a yardstick artifact, not a claim about the toy.
- **The film runs behind the reference solvers, but not by one steady delay.** Fitted shifts on volume gain from rest range about 0.2 to 1.0 ms by deck and window (golden: 0.18 ms over 0–4, 1.01 ms over 4–8, 0.68 ms over 8–16, 0.51 ms over all frames). The rule written before looking said: if the windows differ by 0.2 ms or more with no early-heavy pattern, report that the lag is not a single shift. That is what happened, so we do not quote one number as the lag. The early-window fit (0.18 ms on golden 0–4) is not used to explain the 17 to 25 mL volume shortfall at 4 ms; those two facts sit side by side without a claimed link. Separately, median stretch is about 12% low at 8 ms and about 3% low at the freeze.
- **The work puzzle is explained.** Pressure work adds up pressure times each small volume gain, so volume gained late in the pressure ramp costs more. The toy's work divided by (final pressure times volume change) is 0.40; the decks' is 0.31 to 0.33. The decks gained more of their volume early, at low pressure. Checked: 0.40 × 13002 Pa × 181.4 mL is 0.943 J, against the recorded 0.947 J.

## What is still open

- **Shape.** Node positions in the toy sit about three times farther from the decks than the decks sit from each other (2.6 to 3.2 times at 4, 8 and 16 ms). The film is not shown to match the decks' shape.
- **Leftover motion.** At 8 ms the decks are almost still. The toy still holds about 9.6% of its pressure work as motion, against 0.9 to 1.6% for the decks. Earlier, at 4 ms, the toy holds 25.9% against the decks' 11.9 to 21.4%. Which time each figure comes from: the 25.9% share is read at exactly 4.0 ms, where the toy's motion energy is 0.065 J and still climbing; the 9.6% share is read at exactly 8.0 ms, where it is 0.091 J. The every-step table covers 4.0 to 8 ms: the motion energy rises from 0.065 J at 4.0 ms to about 0.110 J at 4.5 ms. That rise from 0.065 to 0.110 J between 4.0 and 4.5 ms is unexplained. From 4.5 to 8 ms it stays between about 0.077 and 0.111 J, swinging slowly with a period of roughly 1.2 to 1.7 ms (only two or three swings in that window), with a fast ripple of about 0.001 J on top. So it is a high level that does not die away, not a large fast rattle. Our best reading of the later window is a slow, lightly damped swing of the whole film, which the toy's small built-in damping would take dozens of swings to remove; why the decks settle faster is not found, and we do not claim a cause.
- **Tight energy bar.** Restated: toy 0.771 J versus lowest deck 0.774 J at 8 ms. Miss under Chiron's bar; Themis's default gate remains the stretch-vs-surviving-decks spread above.

## Ruled out

Film mass, the engine's film-stabilizing energy, called hourglass energy (about 0.004 J), and the maximum-stretch lag as a claim about the toy (wobble-blind shift about zero).

## Wording that ships if you say yes

The page and any caption say the film runs behind the reference solvers by an uneven amount that is not one steady delay (fitted range about 0.2 to 1.0 ms by deck and window; no single lag is quoted), is checked at the 16 ms freeze, and does not claim to match their shape or to be physically exact. There is no caption on the canvas today; option 1 adds the one line under it. Scope stays Letter A only; B stays labeled unstable; C stays hidden.

## On the final approval card (when Mike says go)

- Letter A only; Letter B stays labeled unstable; Letter C stays hidden.
- Golden engine: OpenCourant community package, commit `6ac7e7d` (official OpenRadioss release link returns 404). AGPL licence line rides on this card.
- Working preview link from the named head.
- One card per final version; merge and publish still need Mike's explicit yes.

## The one decision

Where should the pass mark sit?

1. **Recommended: accept it as an honest rough film.** Pass at the 16 ms freeze, with the wording above, plus one plain line under the canvas (text only, no change to how the film is drawn): "Checked at the 16 ms freeze. Runs behind the reference solvers by an uneven amount that is not one steady delay. Not shown to match their shape." Themis's strict test stays on record as missed — all five bars listed above, including the default stretch-vs-surviving-decks spread that gates — and you are the one lowering all of them. One pick, one reason: the end state is close, and the open items are about timing and shape, which the honest wording already says. Letter A only; B stays labeled unstable; C stays hidden.
2. **Backup: keep it held.** Keep Themis's strict bar (spread-based stretch gate included). Do one more round on the leftover motion before anything is shot or published (the lag recompute on volume change from rest is already done and reported above): one labeled experiment, never shipped: hold the pressure constant for a short time and watch how fast the film's swing dies away in the toy and in one deck, so the pressure ramp cannot muddy the comparison. The prediction is written first.

Nothing is merged, published or reshot until you say go and name the head.
