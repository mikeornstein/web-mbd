import { writeFileSync } from "node:fs";
import { createInflateAModel } from "../src/fixtures/inflateA.ts";
import { solveInflate } from "../src/fe/inflateSolver.ts";

const r = solveInflate(createInflateAModel(), { maxWallMs: 600_000 });
const frames = [];
for (let i = 0; i < r.lambdaHistory.length; i++) {
  const sample = r.history[i];
  const lam = r.lambdaHistory[i];
  const p = r.pressureHistory[i];
  const vol = r.volumeHistory[i];
  const psi = r.psiHistory[i];
  if (sample === undefined || lam === undefined || p === undefined || vol === undefined || psi === undefined) {
    continue;
  }
  frames.push({
    frame: i,
    t: sample.t,
    lambdaMax: lam,
    p_Pa: p,
    V_mL: vol * 1e6,
    psi_J: psi,
  });
}
const out = {
  solver: "toy",
  meshFingerprint: r.metrics.meshFingerprint,
  nSteps: r.metrics.nSteps,
  warn: r.metrics.warn,
  frames,
};
writeFileSync("docs/diag-pr18-openradioss-control/toy-history.json", `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${frames.length} toy frames, warn=${JSON.stringify(r.metrics.warn)}`);
