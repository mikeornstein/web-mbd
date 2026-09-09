/**
 * Probe mass accumulation variants vs live; optionally inject live MS.
 */
import { readFileSync } from "node:fs";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import { hexLumpedNodalMass, gatherHex } from "../src/fe/hex.js";
import { solveExplicit } from "../src/fe/solver.js";
import {
  assembleInternalForcesOrMesh,
  loadOrForceKernel,
  resetOrElementState,
} from "../src/cli/forceNative.js";
import { runOpenRadiossTaylorOracle } from "../src/cli/openRadiossRunner.js";
import { alignedCoordGap, compareToOracle } from "../src/oracle/compare.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";

function parseMs(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 4;
  const numnod = view.getInt32(o, true);
  o += 4 + 24;
  const ms = new Float64Array(numnod);
  const ids = new Int32Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4 + 72;
    ms[i] = view.getFloat64(o, true);
    o += 8;
  }
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  return Float64Array.from(order, (i) => ms[i]!);
}

const liveMs = parseMs(readFileSync("/tmp/or-mesh-adapt-6x16-0.00008/wmbd_postforint_0.f64bin"));
const model0 = createTaylorBarModel({ nSide: 6, nZ: 16 });
const nHex = model0.mesh.hexes.length / 8;
const nNodes = model0.mesh.coords.length / 3;
const x0all = Float64Array.from(model0.mesh.coords);
const shares: number[] = [];
const conns: number[][] = [];
for (let e = 0; e < nHex; e++) {
  const conn = [...model0.mesh.hexes.slice(e * 8, e * 8 + 8)];
  const x0 = new Float64Array(24);
  gatherHex(x0all, conn, x0);
  shares.push(hexLumpedNodalMass(x0, model0.material.density)[0]!);
  conns.push(conn);
}

function assemble(label: string, fn: (masses: Float64Array) => void) {
  const masses = new Float64Array(nNodes);
  fn(masses);
  let n = 0;
  let maxAbs = 0;
  for (let i = 0; i < nNodes; i++) {
    if (!Object.is(masses[i], liveMs[i])) {
      n++;
      maxAbs = Math.max(maxAbs, Math.abs(masses[i]! - liveMs[i]!));
    }
  }
  console.log(label, JSON.stringify({ n, maxAbs, objectIs: n === 0 }));
  return masses;
}

assemble("elem-then-corner", (masses) => {
  for (let e = 0; e < nHex; e++) {
    const s = shares[e]!,
      conn = conns[e]!;
    for (let a = 0; a < 8; a++) masses[conn[a]!]! += s;
  }
});

assemble("corner-then-elem", (masses) => {
  for (let a = 0; a < 8; a++) {
    for (let e = 0; e < nHex; e++) masses[conns[e]![a]!]! += shares[e]!;
  }
});

assemble("pkt128-elem-corner", (masses) => {
  for (let ie0 = 0; ie0 < nHex; ie0 += 128) {
    const pnel = Math.min(128, nHex - ie0);
    for (let i = 0; i < pnel; i++) {
      const e = ie0 + i;
      const s = shares[e]!,
        conn = conns[e]!;
      for (let a = 0; a < 8; a++) masses[conn[a]!]! += s;
    }
  }
});

assemble("pkt128-corner-inner", (masses) => {
  // SCUMU3-like: for each corner, I=1..pnel
  for (let ie0 = 0; ie0 < nHex; ie0 += 128) {
    const pnel = Math.min(128, nHex - ie0);
    for (let a = 0; a < 8; a++) {
      for (let i = 0; i < pnel; i++) {
        const e = ie0 + i;
        masses[conns[e]![a]!]! += shares[e]!;
      }
    }
  }
});

// Per-node: add contributions in increasing element id order (explicit)
assemble("per-node-sorted-elem", (masses) => {
  const contrib: number[][] = Array.from({ length: nNodes }, () => []);
  for (let e = 0; e < nHex; e++) {
    for (let a = 0; a < 8; a++) contrib[conns[e]![a]!]!.push(shares[e]!);
  }
  for (let n = 0; n < nNodes; n++) {
    let s = 0;
    for (const c of contrib[n]!) s += c;
    masses[n] = s;
  }
});

const mode = process.argv[2] ?? "mass-only";
if (mode === "inject-live-ms") {
  process.env["WMBD_OR_CALL_S8E"] = "1";
  if (!loadOrForceKernel()) process.exit(2);
  const make = () => {
    const m = createTaylorBarModel({ nSide: 6, nZ: 16 });
    m.controls.endTime = 80e-6;
    m.controls.runToEnd = true;
    m.controls.adaptiveDt = true;
    m.controls.fixedDt = undefined;
    return m;
  };
  const live = runOpenRadiossTaylorOracle(make(), "/tmp/or-mesh-adapt-6x16-0.00008");
  resetOrElementState();
  // Monkey-patch: solve with live MS by wrapping assemble and replacing masses via hook
  // Use dtSchedule from live if available — for now just OR mesh with default mass,
  // after manually verifying inject path via env in solver — skip if not wired.
  console.log("inject path requires solver hook; see next patch");
  void live;
}
