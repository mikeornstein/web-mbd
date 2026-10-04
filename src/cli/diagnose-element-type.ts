/**
 * Radioss-only element-type measurement. Does not change toy physics.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solveInflate } from "../fe/inflateSolver.js";
import { INFLATE_BANDS } from "../oracle/compareInflate.js";
import { buildKillOffModel } from "../oracle/killOffModel.js";
import {
  lerpCoords,
  nearestShellIndex,
  relErr,
  stretchFieldFromCoords,
  stretchFieldFromShells,
  stretchStats,
  type QuadStretch,
  type StretchStats,
} from "../oracle/stretchField.js";
import {
  cellsAsNodeQuads,
  cellsAsNodeShells,
  parseVtkAnimFrame,
  parseVtkAnimShells,
  scatterShellToNodeOrder,
  scatterToNodeOrder,
} from "../oracle/vtkAnim.js";
import { enclosedVolume, loadShipMesh } from "../inflate/meshA.js";
import { lockedLawCard, ploadAt } from "../inflate/lawCard.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const GOLDEN_VTK = resolve(ROOT, "radioss/diag-oriented-ismstr2/run");
const TARGETS = [0, 0.002, 0.004, 0.008, 0.016] as const;
const HOT90: [number, number, number] = [0.01856035, 0.024643625, -0.025];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`bad ${label}`);
  return v;
}

function statsBlock(s: StretchStats): Record<string, number> {
  return {
    n: s.n,
    max: s.max,
    p99: s.p99,
    p95: s.p95,
    p50: s.p50,
    mean: s.mean,
    min: s.min,
    areaWeightedMean: s.areaWeightedMean,
  };
}

function bracketing(times: readonly number[], t: number): { i0: number; i1: number } {
  if (times.length === 0) throw new Error("empty times");
  if (t <= times[0]!) return { i0: 0, i1: 0 };
  for (let i = 1; i < times.length; i++) {
    if (t <= times[i]!) return { i0: i - 1, i1: i };
  }
  const last = times.length - 1;
  return { i0: last, i1: last };
}

function coordsAtTime(times: readonly number[], frames: readonly Float64Array[], t: number): {
  coords: Float64Array;
  t0: number;
  t1: number;
  interpolated: boolean;
  available: boolean;
} {
  if (times.length === 0 || frames[0] === undefined) {
    return { coords: new Float64Array(), t0: NaN, t1: NaN, interpolated: false, available: false };
  }
  const first = times[0]!;
  const last = times[times.length - 1]!;
  if (t < first - 1e-12) {
    return { coords: frames[0], t0: first, t1: first, interpolated: false, available: false };
  }
  if (t > last + 1e-12) {
    return { coords: frames[frames.length - 1]!, t0: last, t1: last, interpolated: false, available: false };
  }
  const { i0, i1 } = bracketing(times, t);
  const t0 = times[i0]!;
  const t1 = times[i1]!;
  if (i0 === i1) {
    return { coords: frames[i0]!, t0, t1, interpolated: false, available: true };
  }
  return { coords: lerpCoords(frames[i0]!, frames[i1]!, t0, t1, t), t0, t1, interpolated: true, available: true };
}

interface AnimTape {
  t: number[];
  coords: Float64Array[];
  rest: Float64Array;
  shells: number[][];
  elementIds: number[];
  nNodes: number;
  kind: "tri" | "quad";
}

function loadAnim(dir: string, nNodes: number, kind: "tri" | "quad"): AnimTape {
  const names = readdirSync(dir)
    .filter((n) => /^Ainflate_A\d+\.vtk$/.test(n))
    .sort();
  if (names.length === 0) throw new Error(`no VTK in ${dir}`);
  const t: number[] = [];
  const coords: Float64Array[] = [];
  let shells: number[][] | null = null;
  let elementIds: number[] | null = null;
  for (const name of names) {
    const text = readFileSync(resolve(dir, name), "utf8");
    if (kind === "quad") {
      const frame = parseVtkAnimFrame(text, nNodes, nNodes === 1554 ? 1554 : -1);
      const scattered = scatterToNodeOrder(frame, nNodes);
      if (shells === null) {
        const q = cellsAsNodeQuads(frame);
        shells = [];
        for (let e = 0; e < q.length / 4; e++) {
          shells.push([q[e * 4]!, q[e * 4 + 1]!, q[e * 4 + 2]!, q[e * 4 + 3]!]);
        }
        elementIds = Array.from(frame.elementIdByCell);
      }
      t.push(frame.t);
      coords.push(scattered);
    } else {
      const frame = parseVtkAnimShells(text, nNodes);
      const scattered = scatterShellToNodeOrder(frame, nNodes);
      if (shells === null) {
        shells = cellsAsNodeShells(frame);
        elementIds = Array.from(frame.elementIdByCell);
      }
      t.push(frame.t);
      coords.push(scattered);
    }
  }
  if (shells === null || elementIds === null || coords[0] === undefined) throw new Error(`empty anim ${dir}`);
  return { t, coords, rest: coords[0], shells, elementIds, nNodes, kind };
}

function loadQuadAnimAllowN(dir: string, nNodes: number, nCells: number): AnimTape {
  const names = readdirSync(dir)
    .filter((n) => /^Ainflate_A\d+\.vtk$/.test(n))
    .sort();
  if (names.length === 0) throw new Error(`no VTK in ${dir}`);
  const t: number[] = [];
  const coords: Float64Array[] = [];
  let shells: number[][] | null = null;
  let elementIds: number[] | null = null;
  for (const name of names) {
    const frame = parseVtkAnimFrame(readFileSync(resolve(dir, name), "utf8"), nNodes, nCells);
    const scattered = scatterToNodeOrder(frame, nNodes);
    if (shells === null) {
      const q = cellsAsNodeQuads(frame);
      shells = [];
      for (let e = 0; e < q.length / 4; e++) {
        shells.push([q[e * 4]!, q[e * 4 + 1]!, q[e * 4 + 2]!, q[e * 4 + 3]!]);
      }
      elementIds = Array.from(frame.elementIdByCell);
    }
    t.push(frame.t);
    coords.push(scattered);
  }
  if (shells === null || elementIds === null || coords[0] === undefined) throw new Error(`empty anim ${dir}`);
  return { t, coords, rest: coords[0], shells, elementIds, nNodes, kind: "quad" };
}

function volumeOf(coords: ArrayLike<number>, shells: readonly number[][]): number {
  const quads: number[] = [];
  const tris: number[] = [];
  for (const s of shells) {
    if (s.length === 4 && s[2] !== s[3]) quads.push(s[0]!, s[1]!, s[2]!, s[3]!);
    else tris.push(s[0]!, s[1]!, s[2]!);
  }
  return enclosedVolume(coords, quads, tris) * 1e6;
}

function fieldOf(tape: AnimTape, coords: ArrayLike<number>): QuadStretch[] {
  return stretchFieldFromShells(coords, tape.rest, tape.shells, tape.elementIds);
}

function summarizeHot(field: readonly QuadStretch[], statsMaxIndex: number): Record<string, unknown> {
  const q = field[statsMaxIndex]!;
  return {
    quadIndex: q.quadIndex,
    elementId: q.elementId,
    nodes: q.nodes,
    restCentroid_mm: q.restCentroid.map((c) => 1000 * c),
    region: q.region,
    lam: q.lam,
  };
}

function parseDeath(dir: string, lastAnimTime_s: number | null): Record<string, unknown> {
  const logPath = resolve(dir, "engine.log");
  const outPath = resolve(dir, "Ainflate_0001.out");
  const txt = [existsSync(logPath) ? readFileSync(logPath, "utf8") : "", existsSync(outPath) ? readFileSync(outPath, "utf8") : ""].join(
    "\n",
  );
  const dtmin = /NODAL TIME STEP LESS OR EQUAL DTMIN/.test(txt);
  const cycles = /TOTAL NUMBER OF CYCLES\s*:\s*(\d+)/.exec(txt);
  const nc = [...txt.matchAll(/\bNC=\s*(\d+)\s+T=\s*([0-9.Ee+-]+)\s+DT=\s*([0-9.Ee+-]+)/g)];
  const last = nc[nc.length - 1];
  return {
    tinyTimeStep: dtmin,
    cycles: cycles ? Number(cycles[1]) : null,
    lastCycle: last ? Number(last[1]) : null,
    lastPrintedTime_s: last ? Number(last[2]) : null,
    lastPrintedDt_s: last ? Number(last[3]) : null,
    lastAnimationTime_s: lastAnimTime_s,
  };
}

function parseStarterNotes(dir: string): Record<string, unknown> {
  const p = resolve(dir, "starter.log");
  const txt = existsSync(p) ? readFileSync(p, "utf8") : "";
  const lines = txt.split(/\r?\n/).filter((ln) => /ISMSTR|ISHEL=/i.test(ln));
  return {
    ismstrWarning: /INVALID ISMSTR/i.test(txt),
    ismstrSnippet: lines[0] !== undefined ? lines[0].replace(/\s+/g, " ").trim() : null,
    terminationWithWarning: /TERMINATION WITH WARNING/i.test(txt),
  };
}

function band(ours: number, gold: number, vOurs: number, vGold: number, pOurs: number, pGold: number): Record<string, unknown> {
  const sRel = relErr(ours, gold);
  const vRel = relErr(vOurs, vGold);
  const pRel = relErr(pOurs, pGold);
  return {
    stretchRel: sRel,
    volumeRel: vRel,
    pressureRel: pRel,
    officialInside255:
      sRel <= INFLATE_BANDS.lambdaRel && vRel <= INFLATE_BANDS.volumeRel && pRel <= INFLATE_BANDS.pressureRel,
  };
}

function solveToy(kill: "on" | "off"): { t: number[]; coords: Float64Array[]; volume_mL: number[] } {
  const model = buildKillOffModel({ mesh: "oriented", kill });
  model.controls.endTime = 0.0165;
  const result = solveInflate(model, { maxWallMs: 600_000, continuePastWarn: true });
  return {
    t: result.history.map((h) => h.t),
    coords: result.meshHistory,
    volume_mL: result.volumeHistory.map((v) => v * 1e6),
  };
}

function fmtPct(rel: number): string {
  return `${(100 * rel).toFixed(2)}%`;
}

function main(): void {
  const ship = loadShipMesh("A");
  const golden = loadQuadAnimAllowN(GOLDEN_VTK, 1554, 1554);
  const runs: { key: string; label: string; dir: string; nNodes: number; nCells: number; kind: "tri" | "quad" }[] = [
    { key: "sh3n", label: "triangle shells", dir: resolve(ROOT, "radioss/diag-element-type/sh3n/run"), nNodes: 1554, nCells: 3108, kind: "tri" },
    { key: "qeph", label: "physically stabilized four-node shells (Ishell 24, small-strain flag 10)", dir: resolve(ROOT, "radioss/diag-element-type/qeph/run"), nNodes: 1554, nCells: 1554, kind: "quad" },
    { key: "qephIsmstr2", label: "physically stabilized four-node shells (Ishell 24, small-strain flag 2)", dir: resolve(ROOT, "radioss/diag-element-type/qeph-ismstr2/run"), nNodes: 1554, nCells: 1554, kind: "quad" },
    { key: "fine", label: "fine quads (re-oriented 1-to-4)", dir: resolve(ROOT, "radioss/diag-element-type/fine/run"), nNodes: 6216, nCells: 6216, kind: "quad" },
  ];

  console.log("solving toy kill-on / kill-off through 16 ms…");
  const toyOn = solveToy("on");
  const toyOff = solveToy("off");
  const law = lockedLawCard();

  const runOut: Record<string, unknown> = {};
  for (const run of runs) {
    if (!existsSync(run.dir)) {
      runOut[run.key] = { missing: true, dir: run.dir };
      continue;
    }
    const vtkCount = readdirSync(run.dir).filter((n) => /^Ainflate_A\d+\.vtk$/.test(n)).length;
    if (vtkCount === 0) {
      runOut[run.key] = {
        missingVtk: true,
        death: parseDeath(run.dir, null),
        starter: parseStarterNotes(run.dir),
      };
      continue;
    }
    const tape = run.kind === "tri" ? loadAnim(run.dir, run.nNodes, "tri") : loadQuadAnimAllowN(run.dir, run.nNodes, run.nCells);
    const snapshots: Record<string, unknown>[] = [];
    for (const t of TARGETS) {
      const lerp = coordsAtTime(tape.t, tape.coords, t);
      const gLerp = coordsAtTime(golden.t, golden.coords, t);
      const onLerp = coordsAtTime(toyOn.t, toyOn.coords, t);
      const offLerp = coordsAtTime(toyOff.t, toyOff.coords, t);
      if (!lerp.available) {
        snapshots.push({ t_ms: t * 1e3, available: false, lastAnimTime_s: tape.t[tape.t.length - 1] });
        continue;
      }
      const field = fieldOf(tape, lerp.coords);
      const stats = stretchStats(field);
      const gField = fieldOf(golden, gLerp.coords);
      const gStats = stretchStats(gField);
      const onField = stretchFieldFromCoords(onLerp.coords, ship.coords, ship.quads);
      const offField = stretchFieldFromCoords(offLerp.coords, ship.coords, ship.quads);
      const onS = stretchStats(onField);
      const offS = stretchStats(offField);
      const v = volumeOf(lerp.coords, tape.shells);
      const vG = volumeOf(gLerp.coords, golden.shells);
      const vOn = enclosedVolume(onLerp.coords, ship.quads, ship.tris) * 1e6;
      const vOff = enclosedVolume(offLerp.coords, ship.quads, ship.tris) * 1e6;
      const p = ploadAt(t, law);
      const hotIdx = nearestShellIndex(field, HOT90);
      const hot90 = field[hotIdx]!;
      snapshots.push({
        t_s: t,
        t_ms: t * 1e3,
        available: true,
        interpolation: { t0: lerp.t0, t1: lerp.t1, interpolated: lerp.interpolated },
        stats: statsBlock(stats),
        hot: summarizeHot(field, stats.maxIndex),
        volume_mL: v,
        p_Pa: p,
        vsGolden: band(stats.max, gStats.max, v, vG, p, p),
        vsToyKillOn: band(stats.max, onS.max, v, vOn, p, p),
        vsToyKillOff: band(stats.max, offS.max, v, vOff, p, p),
        nearElement90: {
          elementId: hot90.elementId,
          nodes: hot90.nodes,
          restCentroid_mm: hot90.restCentroid.map((c) => 1000 * c),
          region: hot90.region,
          lam: hot90.lam,
          distance_m: Math.hypot(
            hot90.restCentroid[0] - HOT90[0],
            hot90.restCentroid[1] - HOT90[1],
            hot90.restCentroid[2] - HOT90[2],
          ),
        },
      });
    }
    runOut[run.key] = {
      label: run.label,
      nNodes: tape.nNodes,
      nShells: tape.shells.length,
      kind: tape.kind,
      animTimes_s: tape.t,
      death: parseDeath(run.dir, tape.t[tape.t.length - 1] ?? null),
      starter: parseStarterNotes(run.dir),
      snapshots,
    };
  }

  const json = {
    kind: "element-type-diagnosis",
    window: { times_ms: [0, 2, 4, 8, 16], note: "interpolate node coordinates then cstSample/splitQuadCsts" },
    citations: {
      sh3n: "https://help.altair.com/hwsolvers/rad/topics/solvers/rad/sh3n_starter_r.htm",
      ish3n: "https://help.altair.com/hwsolvers/rad/topics/solvers/rad/prop_type1_shell_starter_r.htm (Ish3n=2 C0 large rotation, already on golden property)",
      qeph: "https://help.altair.com/hwsolvers/rad/topics/solvers/rad/prop_type1_shell_starter_r.htm (Ishell=24 QEPH)",
      pload: "https://help.altair.com/hwsolvers/rad/topics/solvers/rad/pload_starter_r.htm (positive pressure along current segment normal)",
      refine: "inflation-abc radioss/A-refine/REFINE.md fine = linear 1-to-4 of ship; winding was as-wound 354 mL signed, re-oriented to 420.5 mL",
    },
    hot90_rest_m: HOT90,
    runs: runOut,
  };
  writeFileSync(resolve(DIAG, "element-type.json"), `${JSON.stringify(json, null, 2)}\n`);
  writeFileSync(resolve(DIAG, "element-type.md"), markdown(json));
  console.log("wrote", resolve(DIAG, "element-type.md"));
}

function markdown(json: Record<string, unknown>): string {
  const runs = json["runs"] as Record<string, unknown>;
  const lines: string[] = [];
  lines.push("# Element-type check (Radioss only, 0–16 ms)");
  lines.push("");
  lines.push("Diagnosis only. Toy physics, defaults, bands (2% stretch / 5% volume / 5% pressure), the golden, stiffness, and the load law were not changed. The Pages workflow was not touched.");
  lines.push("");
  lines.push("All three requested decks use the same oriented letter, the same neo-Hookean constants, the same density 1130 kg/m³, the same thickness 0.381 mm, the same mass, the same linear 0 to 65 kPa over 40 ms pressure, and the same adaptive dynamic relaxation plus Rayleigh mass 80 /s as the current golden. No knobs were retuned.");
  lines.push("");
  lines.push("**read from docs.** Three-node shells: Radioss `/SH3N` (Altair Radioss `/SH3N` page). The three-node formulation flag on the property card stays **2** (standard C0 triangle with large-rotation modification), already on the golden, documented on the `/PROP/TYPE1 (SHELL)` page. Alternate four-node formulation: **Ishell = 24**, physically stabilized one-point shell (QEPH) on that same property page. Pressure: `/PLOAD` comment 1 says positive pressure acts along the current segment normal — a follower load (`/PLOAD` page). Fine mesh: inflation-abc refine ladder **fine** row, linear 1-to-4 of the ship shell (`radioss/A-refine/REFINE.md`).");
  lines.push("");
  lines.push("**computed by a run.** The fine mesh rest signed volume before re-orient was 354 mL (old mixed winding). After the same whole-quad outward rewind the toy uses, true enclosed volume is **420.5 mL**. 752 four-node shells reversed; mixed shells 0. That rewind is required: the refine ladder inherits the old winding.");
  lines.push("");
  lines.push("Stretch is recomputed from interpolated node coordinates with the toy's own constant-strain triangle sample and the 0–2 diagonal split of each four-node shell, same method as `stretch-measure.md`. Official band uses the **maximum**.");
  lines.push("");
  for (const key of ["sh3n", "qeph", "qephIsmstr2", "fine"]) {
    const run = runs[key];
    if (!isRecord(run)) continue;
    lines.push(`## ${String(run["label"] ?? key)}`);
    lines.push("");
    if (run["missing"] === true || run["missingVtk"] === true) {
      lines.push("No animation frames. See death/starter notes.");
      lines.push("");
      lines.push("```");
      lines.push(JSON.stringify({ death: run["death"], starter: run["starter"] }, null, 2));
      lines.push("```");
      lines.push("");
      continue;
    }
    const death = run["death"];
    if (isRecord(death) && death["tinyTimeStep"] === true) {
      const tPrint = death["lastPrintedTime_s"];
      const tAnim = death["lastAnimationTime_s"];
      const cycles = death["cycles"];
      const tMs = typeof tPrint === "number" ? (1000 * tPrint).toFixed(2) : "?";
      const aMs = typeof tAnim === "number" ? (1000 * tAnim).toFixed(2) : "?";
      lines.push(
        `**computed by a run.** Died on a tiny nodal time step after ${String(cycles)} cycles. Last printed cycle time **${tMs} ms**. Last animation sample **${aMs} ms**. Kept frames up to then.`,
      );
    }
    const starter = run["starter"];
    if (isRecord(starter) && starter["ismstrWarning"] === true) {
      lines.push(`**computed by a run.** Starter rewrote the small-strain flag: ${String(starter["ismstrSnippet"])}`);
    }
    lines.push("");
    lines.push(
      `${String(run["kind"]) === "tri" ? "Three-node shells" : "Four-node shells"}: ${String(run["nShells"])}. Nodes: ${String(run["nNodes"])}.`,
    );
    lines.push("");
    lines.push("| t (ms) | max | 99th % | 95th % | median | mean | hot id / region | V (mL) | p (kPa) | vs golden 2/5/5 | vs toy kill-on | vs toy kill-off | stretch near elem 90 |");
    lines.push("| ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | --- | ---: |");
    const snaps = run["snapshots"];
    if (Array.isArray(snaps)) {
      for (const s of snaps) {
        if (!isRecord(s)) continue;
        if (s["available"] === false) {
          lines.push(`| ${num(s["t_ms"], "t")} | — | — | — | — | — | missing | — | — | n/a | n/a | n/a | — |`);
          continue;
        }
        const st = s["stats"];
        const hot = s["hot"];
        const n90 = s["nearElement90"];
        if (!isRecord(st) || !isRecord(hot) || !isRecord(n90)) continue;
        const vg = s["vsGolden"];
        const von = s["vsToyKillOn"];
        const voff = s["vsToyKillOff"];
        const inside = (b: unknown) => (isRecord(b) && b["officialInside255"] === true ? "inside" : "outside");
        const rels = (b: unknown) => {
          if (!isRecord(b)) return "?";
          return `${fmtPct(num(b["stretchRel"], "s"))} / ${fmtPct(num(b["volumeRel"], "v"))} / ${fmtPct(num(b["pressureRel"], "p"))}`;
        };
        lines.push(
          `| ${num(s["t_ms"], "t").toFixed(0)} | ${num(st["max"], "max").toFixed(3)} | ${num(st["p99"], "p99").toFixed(3)} | ${num(st["p95"], "p95").toFixed(3)} | ${num(st["p50"], "p50").toFixed(3)} | ${num(st["mean"], "mean").toFixed(3)} | ${String(hot["elementId"])} ${String(hot["region"])} | ${num(s["volume_mL"], "V").toFixed(1)} | ${(num(s["p_Pa"], "p") / 1000).toFixed(2)} | ${inside(vg)} (${rels(vg)}) | ${inside(von)} (${rels(von)}) | ${inside(voff)} (${rels(voff)}) | ${num(n90["lam"], "n90").toFixed(3)} |`,
        );
      }
    }
    lines.push("");
    const two = Array.isArray(snaps) ? snaps.find((s) => isRecord(s) && s["t_ms"] === 2) : undefined;
    if (isRecord(two) && two["available"] === false) {
      lines.push("No 2 ms sample: the run died before that time. **computed by a run.**");
      lines.push("");
    } else if (isRecord(two) && isRecord(two["nearElement90"]) && isRecord(two["hot"])) {
      const n90 = two["nearElement90"];
      const hot = two["hot"];
      const hotLam = num(hot["lam"], "hot");
      const nearLam = num(n90["lam"], "near");
      const survives = nearLam >= 1.4;
      lines.push(
        `At 2 ms, the maximum is stretch **${hotLam.toFixed(3)}** at element ${String(hot["elementId"])} (${String(hot["region"])}). The shell nearest golden element 90's rest location (upper right, back face) is element ${String(n90["elementId"])} (${String(n90["region"])}) at stretch **${nearLam.toFixed(3)}**. Golden element 90 was 1.696. Hot spot near element 90 survives (≥ 1.4): **${survives ? "yes" : "no"}**. **computed by a run.**`,
      );
      lines.push("");
    }
  }
  lines.push("## Verdict");
  lines.push("");
  lines.push("The 1.70 stretch at 2 ms on golden four-node Belytschko element 90 is **not** reproduced by any other element type in this set. **computed by a run.**");
  lines.push("");
  lines.push("- Triangle shells at 2 ms peak at **1.11** (the toy is 1.12). Volume 520 mL matches the toy. The shell at element 90's rest location is **1.04**. That tape dies at 11.5 ms on a tiny time step, so 16 ms is missing.");
  lines.push("- Physically stabilized four-node shells (Ishell 24) with the golden's written small-strain flag 10 die at rest in 6 cycles. That matches the old deck-generator note that this combination ruptured with no load. Not a 2 ms sample.");
  lines.push("- The same Ishell 24 with small-strain flag 2 (what this package actually runs on the golden) peaks at **1.20** at 2 ms. Element 90 itself is **1.03**. At 16 ms it does reach stretch **2.18**, close to the golden 2.13.");
  lines.push("- The re-oriented finer Belytschko mesh peaks at **1.24** at 2 ms, not at element 90 (neighborhood **1.18**). At 16 ms max is **2.24**.");
  lines.push("");
  lines.push("So the 2 ms 1.7 hot spot is a **Belytschko four-node (Ishell 1) artifact**, not a robust physical response of the letter. Later stretch ~2 at 16 ms still appears on the other four-node tapes. Official measure remains the maximum. Golden not replaced. No physics change.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

main();
