/**
 * Coarse 2×2×4 adaptive 80μs: OR mesh SCUMU3 assembleForces Object.is vs live `.f64bin`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { openRadiossAvailable, runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

const soHex = join(process.cwd(), "native/force-kernel/or-extract/build/libwmbd_or_hex.so");

function makeAdaptive() {
  const m = createTaylorBarModel({ nSide: 2, nZ: 4 });
  m.controls.endTime = 80e-6;
  m.controls.runToEnd = true;
  m.controls.adaptiveDt = true;
  m.controls.fixedDt = undefined;
  return m;
}

describe("OR mesh adaptive Object.is (coarse 2×2×4)", () => {
  it.skipIf(!openRadiossAvailable() || !existsSync(soHex))(
    "80μs adaptive: assembleInternalForcesOrMesh metrics+coords Object.is vs live",
    () => {
      expect(loadOrForceKernel()).toBe(true);
      process.env["WMBD_OR_CALL_S8E"] = "1";
      const live = runOpenRadiossTaylorOracle(makeAdaptive(), "/tmp/or-mesh-adapt-vitest-2x4");
      expect(live.metrics.coordSource).toBe("f64bin");
      const liveCoords = scrubNearZeros(live.coords);

      resetOrElementState();
      const orMesh = solveExplicit(makeAdaptive(), {
        maxWallMs: 180_000,
        assembleForces: (a) => assembleInternalForcesOrMesh(a),
      });

      const cmp = compareToOracle(orMesh.metrics, live.metrics);
      const al = alignedCoordGap(scrubNearZeros(orMesh.coords), liveCoords);
      expect(cmp.bitwiseEqual, "metrics").toBe(true);
      expect(al.bitwiseEqual, "coords").toBe(true);
      expect(Object.is(orMesh.metrics.lengthRatio, live.metrics.lengthRatio)).toBe(true);
      expect(Object.is(orMesh.metrics.radiusRatio, live.metrics.radiusRatio)).toBe(true);
    },
    300_000,
  );
});
