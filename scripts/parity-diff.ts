import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import { runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";

function parseVtkPoints(vtk: string): Float64Array {
  const points: number[] = [];
  const lines = vtk.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("POINTS")) i += 1;
  i += 1;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line || /^(CELLS|CELL_TYPES|POINT_DATA|CELL_DATA|VECTORS|SCALARS)/.test(line)) break;
    for (const tok of line.split(/\s+/)) {
      if (tok.length === 0) continue;
      points.push(Number(tok));
    }
    i += 1;
  }
  return Float64Array.from(points);
}

const model = createTaylorBarModel();
if (process.env["CFL"]) {
  model.controls.cfl = Number(process.env["CFL"]);
}
const ours = solveExplicit(model);
const workDir = mkdtempSync(join(tmpdir(), "parity-"));
const or = runOpenRadiossTaylorOracle(model, workDir);
const anim = readdirSync(workDir)
  .filter((f) => /A\d{3}$/.test(f) && !f.includes("."))
  .sort()
  .at(-1)!;
const vtk = readFileSync(join(workDir, `${anim}.vtk`), "utf8");
const orPts = parseVtkPoints(vtk);
const n = model.mesh.coords.length / 3;
let maxAbs = 0;
let sumAbs = 0;
let maxNode = 0;
const diffs: { a: number; d: number; ox: number; oy: number; oz: number; wx: number; wy: number; wz: number }[] =
  [];
for (let a = 0; a < n; a++) {
  const wx = ours.coords[a * 3]!;
  const wy = ours.coords[a * 3 + 1]!;
  const wz = ours.coords[a * 3 + 2]!;
  const ox = orPts[a * 3]!;
  const oy = orPts[a * 3 + 1]!;
  const oz = orPts[a * 3 + 2]!;
  const d = Math.hypot(wx - ox, wy - oy, wz - oz);
  sumAbs += d;
  if (d > maxAbs) {
    maxAbs = d;
    maxNode = a;
  }
  if (d > 1e-6) diffs.push({ a, d, ox, oy, oz, wx, wy, wz });
}
diffs.sort((a, b) => b.d - a.d);

const starterSnippet = or.starterLog
  .split("\n")
  .filter((l) => /ISOLID|ICPRE|IFRAME|ISMSTR|SOLID|LAW|DT |CFL|TIME STEP/i.test(l))
  .slice(0, 60);

console.log(
  JSON.stringify(
    {
      cfl: model.controls.cfl,
      ours: {
        lengthRatio: ours.metrics.lengthRatio,
        radiusRatio: ours.metrics.radiusRatio,
        nSteps: ours.metrics.nSteps,
      },
      oracle: {
        lengthRatio: or.metrics.lengthRatio,
        radiusRatio: or.metrics.radiusRatio,
      },
      lengthRel:
        Math.abs(ours.metrics.lengthRatio - or.metrics.lengthRatio) /
        or.metrics.lengthRatio,
      radiusRel:
        Math.abs(ours.metrics.radiusRatio - or.metrics.radiusRatio) / or.metrics.radiusRatio,
      maxAbsNodal_m: maxAbs,
      maxAbsNodal_mm: maxAbs * 1e3,
      meanAbsNodal_mm: (sumAbs / n) * 1e3,
      maxNode,
      top5: diffs.slice(0, 5),
      nDiffGt1um: diffs.filter((d) => d.d > 1e-6).length,
      nDiffGt1nm: diffs.filter((d) => d.d > 1e-9).length,
      bitwiseAll: diffs.every((d) => d.d === 0),
      starterHints: starterSnippet,
      workDir,
    },
    null,
    2,
  ),
);
writeFileSync(join(workDir, "parity-summary.json"), JSON.stringify({ maxAbs, maxNode }, null, 2));
