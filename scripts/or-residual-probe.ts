import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { createHexGpStates, hexInternalForces } from "../src/fe/hex.js";
import {
  hexInternalForcesOr,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { solveExplicit } from "../src/fe/solver.js";
import type { J2State } from "../src/fe/materialJ2.js";

function maxAbsDiff(a: Float64Array, b: Float64Array): { max: number; i: number } {
  let max = 0;
  let i = 0;
  for (let k = 0; k < a.length; k++) {
    const d = Math.abs(a[k]! - b[k]!);
    if (d > max) {
      max = d;
      i = k;
    }
  }
  return { max, i };
}

function nObjectIs(a: Float64Array, b: Float64Array): number {
  let n = 0;
  for (let k = 0; k < a.length; k++) if (Object.is(a[k], b[k])) n++;
  return n;
}

function cloneStates(states: J2State[]): J2State[] {
  return states.map((s) => ({
    stress: s.stress.slice(),
    eqPlasticStrain: s.eqPlasticStrain,
    vol0: s.vol0,
  }));
}

loadOrForceKernel();
const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
console.log("nHex", m.mesh.hexes.length / 8, "nCoord", m.mesh.coords.length / 3);

// Unit-cube accumulated steps
{
  const xHex = new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
  const vHex = new Float64Array(24);
  vHex[14] = vHex[17] = vHex[20] = vHex[23] = -1;
  const statesTs = createHexGpStates(xHex);
  const statesOr = cloneStates(statesTs);
  const fTs = new Float64Array(24);
  const fOr = new Float64Array(24);
  const dt = 7.815479988515705e-8;
  resetOrElementState();
  for (let step = 0; step < 5; step++) {
    fTs.fill(0);
    fOr.fill(0);
    hexInternalForces({
      x: xHex,
      v: vHex,
      states: statesTs,
      mat: m.material,
      dt,
      fOut: fTs,
      options: { jcvt: 0 },
    });
    hexInternalForcesOr({
      x: xHex,
      v: vHex,
      states: statesOr,
      mat: m.material,
      dt,
      fOut: fOr,
      elementIndex: 0,
    });
    const dd = maxAbsDiff(fOr, fTs);
    console.log(
      `unit step ${step + 1} max|dF|=${dd.max.toExponential(3)} Object.is=${nObjectIs(fOr, fTs)}/24 ` +
        `eqps0 or/ts=${statesOr[0]!.eqPlasticStrain.toExponential(3)}/${statesTs[0]!.eqPlasticStrain.toExponential(3)} ` +
        `sig0 or/ts=${statesOr[0]!.stress[2]!.toExponential(3)}/${statesTs[0]!.stress[2]!.toExponential(3)}`,
    );
  }
}

for (const endTime of [1e-6, 5e-6, 20e-6, 80e-6]) {
  resetOrElementState();
  const make = () => {
    const mm = createTaylorBarModel({ nSide: 2, nZ: 4 });
    mm.controls.endTime = endTime;
    mm.controls.runToEnd = true;
    return mm;
  };
  const or = solveExplicit(make(), {
    maxWallMs: 120_000,
    hexForce: (a) => hexInternalForcesOr(a),
  });
  const ts = solveExplicit(make(), {
    maxWallMs: 120_000,
    hexForce: (a) => hexInternalForces({ ...a, options: { jcvt: 0 } }),
  });
  const relLf =
    Math.abs(or.metrics.lengthRatio - ts.metrics.lengthRatio) / ts.metrics.lengthRatio;
  const relRf =
    Math.abs(or.metrics.radiusRatio - ts.metrics.radiusRatio) / ts.metrics.radiusRatio;
  const cd = maxAbsDiff(or.coords, ts.coords);
  console.log(
    `t=${endTime} steps=${or.metrics.nSteps}/${ts.metrics.nSteps} ` +
      `relLf=${relLf.toExponential(2)} relRf=${relRf.toExponential(2)} max|dx|=${cd.max.toExponential(2)} ` +
      `coordsObjectIs=${cd.max === 0}`,
  );
}
