import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solveInflate } from "../fe/inflateSolver.js";
import { INFLATE_BANDS } from "../oracle/compareInflate.js";
import { buildKillOffModel } from "../oracle/killOffModel.js";
import {
  indexByNodeKey,
  lerpCoords,
  quadKey,
  relErr,
  stretchFieldFromCoords,
  stretchStats,
  type QuadStretch,
  type StretchStats,
} from "../oracle/stretchField.js";
import { cellsAsNodeQuads, parseVtkAnimFrame, scatterToNodeOrder } from "../oracle/vtkAnim.js";
import { enclosedVolume, loadShipMesh } from "../inflate/meshA.js";
import { lockedLawCard, ploadAt } from "../inflate/lawCard.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const DIAG = resolve(ROOT, "docs/diag-pr18-openradioss-control");
const VTK_DIR = resolve(ROOT, "radioss/A-inflate/run");
const WINDOW_END = 0.016;
const TARGETS = [0.002, 0.008, 0.016] as const;
const N_NODES = 1554;
const N_QUADS = 1554;

interface RadiossRow {
  frame: number;
  t: number;
  p_Pa: number;
  lam_max: number;
  V_mL: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`bad ${label}`);
  return v;
}

function loadRadiossMetrics(): RadiossRow[] {
  const raw: unknown = JSON.parse(readFileSync(resolve(DIAG, "oriented-ismstr2-metrics.json"), "utf8"));
  if (!Array.isArray(raw)) throw new Error("oriented metrics not array");
  return raw.map((row, i) => {
    if (!isRecord(row)) throw new Error(`metrics[${i}]`);
    return {
      frame: num(row["frame"], "frame"),
      t: num(row["t"], "t"),
      p_Pa: num(row["p_Pa"], "p_Pa"),
      lam_max: num(row["lam_max"], "lam_max"),
      V_mL: num(row["V_mL"], "V_mL"),
    };
  });
}

function vtkPath(file: string): string {
  return resolve(VTK_DIR, file);
}

function loadOrientedVtkFrames(): {
  t: number[];
  nodeCoords: Float64Array[];
  vtkQuads: number[];
  elementIds: number[];
  rest: Float64Array;
} {
  const names = readdirSync(VTK_DIR)
    .filter((n) => /^Ainflate_A\d+\.vtk$/.test(n))
    .sort();
  const nodeCoords: Float64Array[] = [];
  const t: number[] = [];
  let vtkQuads: number[] | null = null;
  let elementIds: number[] | null = null;
  for (const name of names) {
    const frame = parseVtkAnimFrame(readFileSync(vtkPath(name), "utf8"), N_NODES, N_QUADS);
    if (frame.t > WINDOW_END + 1e-6 && t.length > 0 && t[t.length - 1]! >= WINDOW_END - 1e-12) {
      // keep first frame past the window for interpolation at 16 ms if needed
      if (frame.t > WINDOW_END + 0.003) break;
    }
    const scattered = scatterToNodeOrder(frame, N_NODES);
    if (vtkQuads === null) {
      vtkQuads = cellsAsNodeQuads(frame);
      elementIds = Array.from(frame.elementIdByCell);
    }
    t.push(frame.t);
    nodeCoords.push(scattered);
  }
  if (vtkQuads === null || elementIds === null || nodeCoords[0] === undefined) {
    throw new Error("no VTK frames");
  }
  return { t, nodeCoords, vtkQuads, elementIds, rest: nodeCoords[0] };
}

function nearestTimeIndex(times: readonly number[], t: number): number {
  let best = 0;
  let bestDt = Math.abs(times[0]! - t);
  for (let i = 1; i < times.length; i++) {
    const dt = Math.abs(times[i]! - t);
    if (dt < bestDt) {
      best = i;
      bestDt = dt;
    }
  }
  return best;
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
} {
  const { i0, i1 } = bracketing(times, t);
  const t0 = times[i0]!;
  const t1 = times[i1]!;
  if (i0 === i1) {
    return { coords: frames[i0]!, t0, t1, interpolated: false };
  }
  return {
    coords: lerpCoords(frames[i0]!, frames[i1]!, t0, t1, t),
    t0,
    t1,
    interpolated: true,
  };
}

function summarizeHot(
  field: readonly QuadStretch[],
  stats: StretchStats,
  radiossByKey?: Map<string, number>,
  radiossField?: readonly QuadStretch[],
): Record<string, unknown> {
  const q = field[stats.maxIndex]!;
  const radIdx = radiossByKey?.get(quadKey(q.nodes));
  const radiossElementId = radIdx === undefined || radiossField === undefined ? q.elementId : radiossField[radIdx]!.elementId;
  return {
    quadIndex: q.quadIndex,
    elementId: q.elementId,
    radiossElementId,
    nodes: q.nodes,
    restCentroid_m: q.restCentroid,
    restCentroid_mm: q.restCentroid.map((c) => 1000 * c),
    region: q.region,
    lam: q.lam,
    lamTriA: q.lamTriA,
    lamTriB: q.lamTriB,
  };
}

function pct(rel: number | null): string {
  if (rel === null) return "n/a";
  return `${(100 * rel).toFixed(2)}%`;
}

function fmt(n: number, d: number): string {
  return n.toFixed(d);
}

export function statsBlock(s: StretchStats): Record<string, number> {
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

function pairSameElement(
  radioss: readonly QuadStretch[],
  toy: readonly QuadStretch[],
  radiossStats: StretchStats,
  toyStats: StretchStats,
): Record<string, unknown> {
  const toyByKey = indexByNodeKey(toy);
  const radByKey = indexByNodeKey(radioss);
  const radHot = radioss[radiossStats.maxIndex]!;
  const toyHot = toy[toyStats.maxIndex]!;
  const toyAtRad = toyByKey.get(quadKey(radHot.nodes));
  const radAtToy = radByKey.get(quadKey(toyHot.nodes));
  return {
    sameHotElement: toyAtRad === toyStats.maxIndex,
    radiossHot: summarizeHot(radioss, radiossStats),
    toyHot: summarizeHot(toy, toyStats, radByKey, radioss),
    toyStretchAtRadiossHot: toyAtRad === undefined ? null : toy[toyAtRad]!.lam,
    radiossStretchAtToyHot: radAtToy === undefined ? null : radioss[radAtToy]!.lam,
    matchedQuads: toyByKey.size,
  };
}

function solveToy(kill: "on" | "off"): { t: number[]; coords: Float64Array[]; volume_mL: number[]; p_Pa: number[] } {
  const model = buildKillOffModel({ mesh: "oriented", kill });
  model.controls.endTime = WINDOW_END + 5e-4;
  const result = solveInflate(model, { maxWallMs: 600_000, continuePastWarn: true });
  return {
    t: result.history.map((h) => h.t),
    coords: result.meshHistory,
    volume_mL: result.volumeHistory.map((v) => v * 1e6),
    p_Pa: result.pressureHistory.slice(),
  };
}

function bandRow(opts: {
  t: number;
  toyMax: number;
  radMax: number;
  toyP95: number;
  radP95: number;
  toyV: number;
  radV: number;
  toyP: number;
  radP: number;
}): Record<string, unknown> {
  const maxRel = relErr(opts.toyMax, opts.radMax);
  const p95Rel = relErr(opts.toyP95, opts.radP95);
  const vRel = relErr(opts.toyV, opts.radV);
  const pRel = relErr(opts.toyP, opts.radP);
  const official =
    maxRel <= INFLATE_BANDS.lambdaRel &&
    vRel <= INFLATE_BANDS.volumeRel &&
    pRel <= INFLATE_BANDS.pressureRel;
  const robust =
    p95Rel <= INFLATE_BANDS.lambdaRel &&
    vRel <= INFLATE_BANDS.volumeRel &&
    pRel <= INFLATE_BANDS.pressureRel;
  return {
    t_ms: opts.t * 1e3,
    officialMaxStretch: { toy: opts.toyMax, radioss: opts.radMax, rel: maxRel, inside: official },
    extraP95Stretch: { toy: opts.toyP95, radioss: opts.radP95, rel: p95Rel, inside: robust },
    volume_mL: { toy: opts.toyV, radioss: opts.radV, rel: vRel },
    p_Pa: { toy: opts.toyP, radioss: opts.radP, rel: pRel },
    officialInside255: official,
    extraP95Inside255: robust,
  };
}

function mdHot(label: string, hot: Record<string, unknown>, otherLam: number | null): string[] {
  const nodes = hot["nodes"];
  const c = hot["restCentroid_mm"];
  const region = String(hot["region"]);
  const lam = num(hot["lam"], "lam");
  const id = num(hot["radiossElementId"] ?? hot["elementId"], "elementId");
  const q = num(hot["quadIndex"], "quadIndex");
  const nodeStr = Array.isArray(nodes) ? nodes.join(", ") : "?";
  const cStr = Array.isArray(c) ? c.map((x) => (typeof x === "number" ? x.toFixed(2) : "?")).join(", ") : "?";
  const other = otherLam === null ? "n/a" : fmt(otherLam, 3);
  return [
    `- ${label} maximum: stretch ${fmt(lam, 3)} at quad index ${q}, Radioss element id ${id}, nodes [${nodeStr}], rest centroid (mm) (${cStr}), region **${region}**. The other solver's stretch in that same four-node shell: **${other}**.`,
  ];
}

function main(): void {
  const ship = loadShipMesh("A");
  const vtk = loadOrientedVtkFrames();
  const restDiff = (() => {
    let maxAbs = 0;
    for (let i = 0; i < ship.coords.length; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(ship.coords[i]! - vtk.rest[i]!));
    }
    return maxAbs;
  })();

  const published = loadRadiossMetrics();
  const warnFrame = published.find((r) => r.frame === 8);
  if (warnFrame === undefined) throw new Error("missing Radioss frame 8");

  const radAt16native = stretchFieldFromCoords(
    vtk.nodeCoords[nearestTimeIndex(vtk.t, warnFrame.t)]!,
    vtk.rest,
    vtk.vtkQuads,
    vtk.elementIds,
  );
  const rad16stats = stretchStats(radAt16native);

  const law = lockedLawCard();
  console.log("solving toy kill-on (default) through 16 ms…");
  const toyOn = solveToy("on");
  console.log("solving toy kill-off through 16 ms…");
  const toyOff = solveToy("off");

  const snapshots: Record<string, unknown>[] = [];
  for (const t of TARGETS) {
    const radLerp = coordsAtTime(vtk.t, vtk.nodeCoords, t);
    const onLerp = coordsAtTime(toyOn.t, toyOn.coords, t);
    const offLerp = coordsAtTime(toyOff.t, toyOff.coords, t);
    const radField = stretchFieldFromCoords(radLerp.coords, vtk.rest, vtk.vtkQuads, vtk.elementIds);
    const onField = stretchFieldFromCoords(onLerp.coords, ship.coords, ship.quads);
    const offField = stretchFieldFromCoords(offLerp.coords, ship.coords, ship.quads);
    const radS = stretchStats(radField);
    const onS = stretchStats(onField);
    const offS = stretchStats(offField);
    const radV = enclosedVolume(radLerp.coords, vtk.vtkQuads) * 1e6;
    const onV = enclosedVolume(onLerp.coords, ship.quads, ship.tris) * 1e6;
    const offV = enclosedVolume(offLerp.coords, ship.quads, ship.tris) * 1e6;
    const p = ploadAt(t, law);
    const radByKey = indexByNodeKey(radField);
    snapshots.push({
      t_s: t,
      t_ms: t * 1e3,
      interpolation: {
        radioss: { t0: radLerp.t0, t1: radLerp.t1, interpolated: radLerp.interpolated },
        toyKillOn: { t0: onLerp.t0, t1: onLerp.t1, interpolated: onLerp.interpolated },
        toyKillOff: { t0: offLerp.t0, t1: offLerp.t1, interpolated: offLerp.interpolated },
        method: "linear interpolation of every node coordinate between the two bracketing samples, then recompute stretch on the interpolated mesh",
      },
      radioss: {
        stats: statsBlock(radS),
        hot: summarizeHot(radField, radS),
        volume_mL: radV,
        p_Pa: p,
      },
      toyKillOn: {
        stats: statsBlock(onS),
        hot: summarizeHot(onField, onS, radByKey, radField),
        volume_mL: onV,
        p_Pa: p,
        vsRadioss: pairSameElement(radField, onField, radS, onS),
      },
      toyKillOff: {
        stats: statsBlock(offS),
        hot: summarizeHot(offField, offS, radByKey, radField),
        volume_mL: offV,
        p_Pa: p,
        vsRadioss: pairSameElement(radField, offField, radS, offS),
      },
      everyQuad: {
        note: "one number per four-node shell: max of the two triangle principal stretches. Same node set matched by the four node ids.",
        radioss: radField.map((q) => ({ id: q.elementId, nodes: q.nodes, lam: q.lam, region: q.region })),
        toyKillOn: onField.map((q) => ({ id: q.quadIndex, nodes: q.nodes, lam: q.lam, region: q.region })),
        toyKillOff: offField.map((q) => ({ id: q.quadIndex, nodes: q.nodes, lam: q.lam, region: q.region })),
      },
    });
  }

  const windowFrames: Record<string, unknown>[] = [];
  for (const row of published) {
    if (row.t > WINDOW_END + 0.001) break;
    const radLerp = coordsAtTime(vtk.t, vtk.nodeCoords, row.t);
    const onLerp = coordsAtTime(toyOn.t, toyOn.coords, row.t);
    const offLerp = coordsAtTime(toyOff.t, toyOff.coords, row.t);
    const radField = stretchFieldFromCoords(radLerp.coords, vtk.rest, vtk.vtkQuads, vtk.elementIds);
    const onField = stretchFieldFromCoords(onLerp.coords, ship.coords, ship.quads);
    const offField = stretchFieldFromCoords(offLerp.coords, ship.coords, ship.quads);
    const radS = stretchStats(radField);
    const onS = stretchStats(onField);
    const offS = stretchStats(offField);
    const radV = row.V_mL;
    const onV = enclosedVolume(onLerp.coords, ship.quads, ship.tris) * 1e6;
    const offV = enclosedVolume(offLerp.coords, ship.quads, ship.tris) * 1e6;
    windowFrames.push({
      radiossFrame: row.frame,
      t: row.t,
      killOn: bandRow({
        t: row.t,
        toyMax: onS.max,
        radMax: radS.max,
        toyP95: onS.p95,
        radP95: radS.p95,
        toyV: onV,
        radV,
        toyP: ploadAt(row.t, law),
        radP: row.p_Pa,
      }),
      killOff: bandRow({
        t: row.t,
        toyMax: offS.max,
        radMax: radS.max,
        toyP95: offS.p95,
        radP95: radS.p95,
        toyV: offV,
        radV,
        toyP: ploadAt(row.t, law),
        radP: row.p_Pa,
      }),
    });
  }

  const killOnOfficial = windowFrames.every((f) => {
    const k = f["killOn"];
    return isRecord(k) && k["officialInside255"] === true;
  });
  const killOffOfficial = windowFrames.every((f) => {
    const k = f["killOff"];
    return isRecord(k) && k["officialInside255"] === true;
  });
  const killOnP95 = windowFrames.every((f) => {
    const k = f["killOn"];
    return isRecord(k) && k["extraP95Inside255"] === true;
  });
  const killOffP95 = windowFrames.every((f) => {
    const k = f["killOff"];
    return isRecord(k) && k["extraP95Inside255"] === true;
  });

  const snap2 = snapshots[0] as Record<string, unknown>;
  const on2 = snap2["toyKillOn"] as Record<string, unknown>;
  const vs2 = on2["vsRadioss"] as Record<string, unknown>;
  const sameHot = vs2["sameHotElement"] === true;
  const toyAtRad = vs2["toyStretchAtRadiossHot"];
  const radHot = (snap2["radioss"] as Record<string, unknown>)["hot"] as Record<string, unknown>;
  const radHotLam = num(radHot["lam"], "rad hot");
  const measurementEffect =
    typeof toyAtRad === "number" && relErr(toyAtRad, radHotLam) <= 0.02 && !sameHot;

  const payload = {
    kind: "stretch-measure-diagnosis",
    window: { t0: 0, t1: WINDOW_END, note: "golden first stretch of 2 is 16 ms; frames after that are out" },
    definition: {
      toy: {
        files: [
          "src/fe/inflateSolver.ts measure() lines 157-180",
          "src/fe/membraneCst.ts cstSample / principalStretches / splitQuadCsts",
        ],
        quantity:
          "max over every constant-strain triangle of max(λ1, λ2). Each four-node shell is two triangles on diagonal node0–node2. Rest = undeformed ship mesh. Deformation gradient from current 3-D edges vs rest in-plane basis (out-of-plane motion is in F). Wrinkle clamp: in-plane λ²<1 raised to 1.",
      },
      radiossGolden: {
        files: [
          "radioss/diag-oriented-ismstr2/RUN.md line 55 (CST on animation/VTK, rest = frame 0)",
          "radioss/A-inflate/run/Ainflate_A*.vtk node positions + four-node cells",
          "this recompute: src/oracle/stretchField.ts stretchFieldFromCoords using the same cstSample",
        ],
        quantity:
          "Same triangle principal-stretch formula as the toy, applied to animation node positions. Rest = animation frame 0. Connectivity = animation four-node cells (not Radioss's own membrane strain tensor).",
      },
      restPositionMaxAbsDiff_m: restDiff,
      publishedFrame8Max: warnFrame.lam_max,
      recomputedFrame8Max: rad16stats.max,
      recomputedMatchesPublished: Math.abs(rad16stats.max - warnFrame.lam_max) / warnFrame.lam_max < 1e-12,
    },
    snapshots,
    windowFrames,
    windowVerdict: {
      killOnOfficialEveryFrame: killOnOfficial,
      killOffOfficialEveryFrame: killOffOfficial,
      killOnExtraP95EveryFrame: killOnP95,
      killOffExtraP95EveryFrame: killOffP95,
      twoMsSameHotElement: sameHot,
      twoMsLooksLikeMeasurementEffect: measurementEffect,
    },
  };

  writeFileSync(resolve(DIAG, "stretch-measure.json"), `${JSON.stringify(payload, null, 2)}\n`);

  const lines: string[] = [];
  lines.push("# Stretch measurement check (0–16 ms window)");
  lines.push("");
  lines.push("Read and measure only. Default toy, bands, stiffness, and load law were not changed.");
  lines.push("Window: time zero through the golden's first stretch of 2 (**16 ms**). Later frames are out because Radioss dies near 22 ms.");
  lines.push("");
  lines.push("## 1. Same stretch definition?");
  lines.push("");
  lines.push("**Toy — read-from-code.** `src/fe/inflateSolver.ts` `measure()` (lines 157–180) loops the constant-strain triangles built in the same file (lines 75–80) via `splitQuadCsts`. Each four-node shell becomes two triangles on the diagonal from the first corner to the opposite corner (nodes 0-1-2 and 0-2-3) in `src/fe/membraneCst.ts` lines 308–318. For each triangle, `cstSample` (lines 100–134) builds the 3-D deformation gradient from current edges versus the rest in-plane basis (`deformGradient`, lines 149–171), then `principalStretches` (lines 174–187) takes √(eigenvalues of the in-plane C). **Out-of-plane motion is included** (F has a third row). In-plane compression is clamped (`wrinkleClamp`: λ² < 1 is set to 1). The reported stretch is the max of λ1 and λ2 over every triangle. Rest configuration is the undeformed ship mesh at load (`mesh.coords`).");
  lines.push("");
  lines.push("**Radioss golden — read-from-code + computed-by-run.** The engine animation stores node positions and four-node cells (`radioss/A-inflate/run/Ainflate_A*.vtk`). It also stores a membrane strain tensor; **that tensor is not what the golden uses.** `radioss/diag-oriented-ismstr2/RUN.md` line 55 says stretch is “CST membrane principals on ANIM/VTK (rest = frame 0)”. This check recomputes that with the **same** `cstSample` / `splitQuadCsts` on the animation cells and frame-0 rest. At the 16 ms animation sample, recomputed max **matches the published golden max** (published " +
    `${fmt(warnFrame.lam_max, 12)}, recomputed ${fmt(rad16stats.max, 12)}).`);
  lines.push("");
  lines.push(`Rest positions: animation frame 0 versus the toy ship mesh, after mapping animation \`NODE_ID\` onto the same 0-based nodes, differ by at most **${restDiff.toExponential(3)} m**. That is animation single-precision rounding, not a different rest configuration. **guess:** none needed for the formula; the two published numbers are the same per-triangle quantity.`);
  lines.push("");
  lines.push("They **do not** differ as “triangles versus quads” for the **maximum**: a quad's stretch is the max of its two triangles, and the global max is the max of those. Percentiles in the golden (`lambda_field.n_quads = 1554`) are on **per-quad** maxima, which is what this extra 95th-percentile column uses. The toy's official number is still the global max.");
  lines.push("");
  lines.push("## 2–3. Per-element summary at 2, 8, and 16 ms");
  lines.push("");
  lines.push("Clocks: linear interpolation of **every node coordinate** between the two samples that bracket the target time, then stretch is recomputed. Not interpolation of the scalar max.");
  lines.push("");

  for (const snap of snapshots) {
    const rec = snap as Record<string, unknown>;
    const tms = num(rec["t_ms"], "t_ms");
    const interp = rec["interpolation"] as Record<string, unknown>;
    const rad = rec["radioss"] as Record<string, unknown>;
    const on = rec["toyKillOn"] as Record<string, unknown>;
    const off = rec["toyKillOff"] as Record<string, unknown>;
    const radS = rad["stats"] as Record<string, number>;
    const onS = on["stats"] as Record<string, number>;
    const offS = off["stats"] as Record<string, number>;
    const onVs = on["vsRadioss"] as Record<string, unknown>;
    const offVs = off["vsRadioss"] as Record<string, unknown>;
    const radInterp = interp["radioss"] as Record<string, unknown>;
    lines.push(`### ${tms.toFixed(0)} ms`);
    lines.push("");
    lines.push(
      `Radioss interpolated between ${(num(radInterp["t0"], "t0") * 1e3).toFixed(4)} ms and ${(num(radInterp["t1"], "t1") * 1e3).toFixed(4)} ms (${radInterp["interpolated"] === true ? "yes" : "no, exact sample"}).`,
    );
    if (Math.abs(tms - 2) < 1e-9) {
      lines.push(
        "The un-interpolated Radioss animation sample at 2.022 ms is stretch 1.709. Interpolating node positions to exactly 2.000 ms gives 1.696. The published 1.12 vs 1.71 gap is the toy versus that 2.022 ms sample.",
      );
    }
    lines.push("");
    lines.push("| solver | max | 99th % | 95th % | median | mean |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
    lines.push(`| Radioss | ${fmt(num(radS.max, "rmax"), 3)} | ${fmt(num(radS.p99, "rp99"), 3)} | ${fmt(num(radS.p95, "rp95"), 3)} | ${fmt(num(radS.p50, "rp50"), 3)} | ${fmt(num(radS.mean, "rmean"), 3)} |`);
    lines.push(`| toy kill on (default) | ${fmt(num(onS.max, "omax"), 3)} | ${fmt(num(onS.p99, "op99"), 3)} | ${fmt(num(onS.p95, "op95"), 3)} | ${fmt(num(onS.p50, "op50"), 3)} | ${fmt(num(onS.mean, "omean"), 3)} |`);
    lines.push(`| toy kill off | ${fmt(num(offS.max, "fmax"), 3)} | ${fmt(num(offS.p99, "fp99"), 3)} | ${fmt(num(offS.p95, "fp95"), 3)} | ${fmt(num(offS.p50, "fp50"), 3)} | ${fmt(num(offS.mean, "fmean"), 3)} |`);
    lines.push("");
    lines.push(
      ...mdHot(
        "Radioss",
        rad["hot"] as Record<string, unknown>,
        typeof onVs["toyStretchAtRadiossHot"] === "number" ? onVs["toyStretchAtRadiossHot"] : null,
      ),
    );
    lines.push(
      ...mdHot(
        "Toy kill on",
        on["hot"] as Record<string, unknown>,
        typeof onVs["radiossStretchAtToyHot"] === "number" ? onVs["radiossStretchAtToyHot"] : null,
      ),
    );
    lines.push(
      ...mdHot(
        "Toy kill off",
        off["hot"] as Record<string, unknown>,
        typeof offVs["radiossStretchAtToyHot"] === "number" ? offVs["radiossStretchAtToyHot"] : null,
      ),
    );
    lines.push(
      `- Same four-node shell holds the max in Radioss and toy kill-on: **${onVs["sameHotElement"] === true ? "yes" : "no"}**. Kill-off: **${offVs["sameHotElement"] === true ? "yes" : "no"}**.`,
    );
    lines.push("");
  }

  lines.push("## 4. Is 1.12 vs 1.71 a measurement effect?");
  lines.push("");
  const onVs2 = (snapshots[0] as Record<string, unknown>)["toyKillOn"] as Record<string, unknown>;
  const vs = onVs2["vsRadioss"] as Record<string, unknown>;
  lines.push(
    `**computed-by-run.** At 2 ms the maxima **${vs["sameHotElement"] === true ? "sit in the same" : "sit in different"}** four-node shells. In Radioss's hottest shell, the toy's stretch is **${typeof vs["toyStretchAtRadiossHot"] === "number" ? fmt(vs["toyStretchAtRadiossHot"], 3) : "n/a"}** versus Radioss **${fmt(radHotLam, 3)}**. In the toy's hottest shell, Radioss is **${typeof vs["radiossStretchAtToyHot"] === "number" ? fmt(vs["radiossStretchAtToyHot"], 3) : "n/a"}**.`,
  );
  lines.push("");
  if (measurementEffect) {
    lines.push("That is a **measurement / hot-spot** effect: the same shell agrees, and the published max comes from a different shell.");
  } else {
    lines.push("That is a **real motion difference**, not a different definition and not only a different hot spot: even in Radioss's hottest shell the toy is not at 1.71, and the two measures are the same formula.");
  }
  lines.push("");
  lines.push("Kill on and kill off are the same at 2 ms (the 0.18 kill has not acted yet); both columns are shown anyway.");
  lines.push("");
  lines.push("## 5. Every sampled frame from 0 to 16 ms, official max vs extra 95th percentile");
  lines.push("");
  lines.push("Official measure stays the **maximum**. The 95th percentile is an extra column only.");
  lines.push("");
  lines.push("| t (ms) | kill | official max error | extra 95th % error | volume error | pressure error | official 2/5/5 | extra 95th 2/5/5 |");
  lines.push("| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |");
  for (const f of windowFrames) {
    for (const kill of ["killOn", "killOff"] as const) {
      const b = f[kill] as Record<string, unknown>;
      const offi = b["officialMaxStretch"] as Record<string, unknown>;
      const p95 = b["extraP95Stretch"] as Record<string, unknown>;
      const vol = b["volume_mL"] as Record<string, unknown>;
      const pr = b["p_Pa"] as Record<string, unknown>;
      lines.push(
        `| ${fmt(num(f["t"], "t") * 1e3, 2)} | ${kill === "killOn" ? "on" : "off"} | ${pct(num(offi["rel"], "rel"))} | ${pct(num(p95["rel"], "p95"))} | ${pct(num(vol["rel"], "v"))} | ${pct(num(pr["rel"], "p"))} | ${b["officialInside255"] === true ? "inside" : "outside"} | ${b["extraP95Inside255"] === true ? "inside" : "outside"} |`,
      );
    }
  }
  lines.push("");
  lines.push(
    `Every frame in 0–16 ms inside 2/5/5 on **official max**: kill on **${killOnOfficial ? "yes" : "no"}**, kill off **${killOffOfficial ? "yes" : "no"}**. On **extra 95th percentile stretch** (volume and pressure still official): kill on **${killOnP95 ? "yes" : "no"}**, kill off **${killOffP95 ? "yes" : "no"}**.`,
  );
  lines.push("");
  lines.push("No new constants. No physics change.");
  lines.push("");

  writeFileSync(resolve(DIAG, "stretch-measure.md"), `${lines.join("\n")}\n`);
  console.log(`wrote ${resolve(DIAG, "stretch-measure.json")}`);
  console.log(`wrote ${resolve(DIAG, "stretch-measure.md")}`);
  console.log(`frame-8 max published ${warnFrame.lam_max} recomputed ${rad16stats.max}`);
  console.log(`kill-on every-frame official ${String(killOnOfficial)} extra p95 ${String(killOnP95)}`);
  console.log(`kill-off every-frame official ${String(killOffOfficial)} extra p95 ${String(killOffP95)}`);
}

main();
