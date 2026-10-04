/**
 * Every-frame 0–16 ms Themis deck-spread gate. Not a physics pass.
 *
 * The golden's engine commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba
 * is pinned only to the OpenCourant copy, not the original OpenRadioss tree.
 * AGPL solver is not shipped in the Pages bundle.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOAD_FAMILY_DYNAMIC_PLOAD_40MS } from "../src/inflate/constants.js";
import { lockedLawCard } from "../src/inflate/lawCard.js";
import {
  compareInflateToGolden,
  formatEveryFrameTable,
  SHIPPED_KILL_OFF_FREEZE,
  SIXTEEN_MS_SPREAD_NOTE,
  type InflateToySample,
} from "../src/oracle/compareInflate.js";
import { loadInflateGolden } from "../src/oracle/inflateGolden.js";
import {
  DECK_FINE_REORIENTED,
  DECK_ISHELL24_ISMSTR2,
  DECK_TRIANGLE_SH3N,
  deckSpreadAt,
  GOLDEN_TAPE,
  INFLATE_GATING_BAR,
} from "../src/oracle/survivingDecks.js";

const DIAG = new URL("../docs/diag-pr18-openradioss-control/", import.meta.url);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`every-frame: bad ${label}`);
  return v;
}

function snapshotMax(run: unknown, t_ms: number): number | null {
  if (!isRecord(run)) throw new Error("run");
  const snaps = run["snapshots"];
  if (!Array.isArray(snaps)) throw new Error("snapshots");
  for (const row of snaps) {
    if (!isRecord(row)) throw new Error("snap");
    if (num(row["t_ms"], "t_ms") !== t_ms) continue;
    if (row["available"] !== true) return null;
    const stats = row["stats"];
    if (!isRecord(stats)) throw new Error("stats");
    return num(stats["max"], "max");
  }
  throw new Error(`no snapshot at ${String(t_ms)} ms`);
}

function killOffSamples(): InflateToySample[] {
  return [
    { t: 0, lambdaMax: 1.0000000074505808, volume_mL: 420.5477389711655, p: 0 },
    { t: 0.002002992059327919, lambdaMax: 1.1183172586557617, volume_mL: 520.0139970474382, p: 3254.8620964078686 },
    { t: 0.0040013169923814994, lambdaMax: 1.108327114264293, volume_mL: 525.0123369833336, p: 6502.140112619937 },
    { t: 0.006001741783163348, lambdaMax: 1.2855257454832372, volume_mL: 570.3991833132725, p: 9752.83039764044 },
    { t: 0.008004723846906503, lambdaMax: 1.4077530823945796, volume_mL: 601.9857131699121, p: 13007.676251223067 },
    { t: 0.010002621665691975, lambdaMax: 1.4716475093227872, volume_mL: 643.8240746767805, p: 16254.260206749459 },
    { t: 0.012004801886361497, lambdaMax: 1.5644431198580904, volume_mL: 694.6543799496277, p: 19507.80306533743 },
    { t: 0.014000748502444316, lambdaMax: 1.7363983261849765, volume_mL: 757.601942213197, p: 22751.21631647201 },
    { t: 0.016003703120549294, lambdaMax: 2.105201010510652, volume_mL: 866.0832041483628, p: 26006.0175708926 },
  ];
}

describe("every-frame Themis deck-spread (committed tapes)", () => {
  it("deck literals match element-type.json and the golden oriented tape", () => {
    const decks: unknown = JSON.parse(readFileSync(new URL("element-type.json", DIAG), "utf8"));
    if (!isRecord(decks)) throw new Error("element-type");
    const runs = decks["runs"];
    if (!isRecord(runs)) throw new Error("runs");
    expect(snapshotMax(runs["qephIsmstr2"], 2)).toBe(DECK_ISHELL24_ISMSTR2[1]?.lambdaMax);
    expect(snapshotMax(runs["qephIsmstr2"], 16)).toBe(DECK_ISHELL24_ISMSTR2[4]?.lambdaMax);
    expect(snapshotMax(runs["fine"], 2)).toBe(DECK_FINE_REORIENTED[1]?.lambdaMax);
    expect(snapshotMax(runs["fine"], 16)).toBe(DECK_FINE_REORIENTED[4]?.lambdaMax);
    expect(snapshotMax(runs["sh3n"], 2)).toBe(DECK_TRIANGLE_SH3N[1]?.lambdaMax);
    expect(snapshotMax(runs["sh3n"], 16)).toBeNull();

    const tape: unknown = JSON.parse(readFileSync(new URL("oriented-ismstr2-metrics.json", DIAG), "utf8"));
    if (!Array.isArray(tape)) throw new Error("golden tape");
    for (const want of GOLDEN_TAPE) {
      const hit = tape.find((row) => {
        if (!isRecord(row)) return false;
        return Math.abs(num(row["t"], "t") * 1000 - want.t_ms) < 0.5 || row["frame"] === want.t_ms / 2;
      });
      if (hit === undefined || !isRecord(hit)) throw new Error(`tape ${String(want.t_ms)}`);
      expect(num(hit["lam_max"], "lam")).toBe(want.lambdaMax);
      expect(num(hit["V_mL"], "V")).toBe(want.volume_mL);
    }
  });

  it("6/10/12/14 ms deck min/max are interpolated; triangle is in the spread through 8 ms", () => {
    const at6 = deckSpreadAt(6);
    expect(at6.interpolated).toBe(true);
    expect(at6.triangleNote).toContain("in the gating spread");
    expect(at6.triangle).not.toBeNull();
    expect(at6.min).toBe(at6.triangle?.lambdaMax);
    const at2 = deckSpreadAt(2);
    expect(at2.interpolated).toBe(false);
    expect(at2.min).toBe(DECK_TRIANGLE_SH3N[1]?.lambdaMax);
    expect(at2.triangleNote).toContain("in the gating spread");
    const at16 = deckSpreadAt(16);
    expect(at16.interpolated).toBe(false);
    expect(at16.min).toBe(GOLDEN_TAPE[8]?.lambdaMax);
    expect(at16.max).toBe(DECK_FINE_REORIENTED[4]?.lambdaMax);
    const at10 = deckSpreadAt(10);
    expect(at10.interpolated).toBe(true);
    expect(at10.triangle).toBeNull();
    expect(at10.triangleNote).toContain("last 8 ms");
    const at16tri = deckSpreadAt(16);
    expect(at16tri.triangleNote).toContain("died ~11.5 ms");
  });

  it("committed kill-off tape tally with triangle in the spread; 16 ms uses the locked sentence", () => {
    const golden = loadInflateGolden();
    const cmp = compareInflateToGolden(
      {
        warn: {
          frame: SHIPPED_KILL_OFF_FREEZE.frame,
          t: 0.016003703120549294,
          lambdaMax: SHIPPED_KILL_OFF_FREEZE.lambdaMax,
          p: 26006.0175708926,
          volume_mL: SHIPPED_KILL_OFF_FREEZE.volume_mL,
          psi_J: 7.313,
          warn: true,
        },
        loadFamily: LOAD_FAMILY_DYNAMIC_PLOAD_40MS,
        meshFingerprint: golden.mesh.fingerprint,
        punchedThrough: false,
        psi_J: 7.313,
        law: lockedLawCard(),
        samples: killOffSamples(),
      },
      golden,
    );
    expect(cmp.gatingBar).toBe(INFLATE_GATING_BAR);
    expect(cmp.ok).toBe(false);
    expect(cmp.themisOk).toBe(false);
    const want: Record<number, boolean> = {
      0: true,
      2: true,
      4: false,
      6: true,
      8: true,
      10: false,
      12: false,
      14: false,
      16: false,
    };
    for (const row of cmp.frames) {
      expect(row.themisInside).toBe(want[row.t_ms]);
      expect(row.volumeInside).toBe(true);
      expect(row.pressureInside).toBe(true);
      if (row.t_ms === 10 || row.t_ms === 12 || row.t_ms === 14) {
        expect(row.deckInterpolated).toBe(true);
      }
    }
    const at4 = cmp.frames.find((row) => row.t_ms === 4);
    expect(at4?.belowFloorRel).not.toBeNull();
    expect(at4?.floorName).toContain("triangle");
    const at16 = cmp.frames.find((row) => row.t_ms === 16);
    expect(at16?.oldBarInside).toBe(true);
    expect(at16?.themisInside).toBe(false);
    const table = formatEveryFrameTable(cmp);
    expect(table).toContain(SIXTEEN_MS_SPREAD_NOTE);
    expect(table).toContain("tally total:");
    expect(table).toContain("Themis reading (not the score)");
    expect(table).toContain("in the gating spread");
    expect(table).toContain("deck min/max interpolated");
  });
});
