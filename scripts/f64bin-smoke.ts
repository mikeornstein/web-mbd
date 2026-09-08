/**
 * Smoke: run short Taylor with patched engine; expect .f64bin beside .sta.
 */
import { readdirSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";

const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
m.controls.endTime = 1e-6;
m.controls.runToEnd = true;
const wd = "/tmp/or-f64bin-smoke";
const r = runOpenRadiossTaylorOracle(m, wd);
console.log(
  JSON.stringify(
    {
      coordSource: r.metrics.coordSource,
      Lf: r.metrics.lengthRatio,
      Rf: r.metrics.radiusRatio,
      f64: r.f64binFile ?? null,
      sta: r.staFile ?? null,
      files: readdirSync(wd).filter(
        (f) => f.includes("sta") || f.includes("f64") || f.endsWith(".out"),
      ),
    },
    null,
    2,
  ),
);
