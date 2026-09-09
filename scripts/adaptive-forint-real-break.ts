/**
 * Refine adaptive FORINT bisect: RHO-derived VOLN/AMU (dump writes VOLO + cleared AMU),
 * and separate denormal noise from real ulp breaks in D/SIG/A.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTaylorBarModel } from "../src/fixtures/taylorBar.js";
import {
  createHexGpStates,
  gatherHex,
  hexInternalForces,
  hexLumpedNodalMass,
  hierarchicalGpGeometry,
  s8edefo3Rates,
} from "../src/fe/hex.js";
import { applyRigidWallKinematic } from "../src/fe/contactWall.js";
import { scrubNearZeros } from "../src/oracle/shapeFromF64bin.js";
import type { J2State } from "../src/fe/materialJ2.js";

const LIVE = process.env["ADAPTIVE_DUMP_DIR"] ?? "/tmp/or-adaptive-dt-2x4";
const RHO0 = 8930;
const DT_REC = 4 + 8 + 8;
const MAX = 4;

function parseDt(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rows: { dt2: number }[] = [];
  for (let i = 0; i < buf.byteLength / DT_REC; i++) {
    const off = i * DT_REC;
    rows.push({ dt2: view.getFloat64(off + 12, true) });
  }
  return rows;
}

function parseAv(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const ncycle = view.getInt32(o, true);
  o += 4;
  const numnod = view.getInt32(o, true);
  o += 4;
  const dt1 = view.getFloat64(o, true);
  o += 8;
  const dt2 = view.getFloat64(o, true);
  o += 8;
  const dt12 = view.getFloat64(o, true);
  o += 8;
  const a = new Float64Array(numnod * 3);
  const v = new Float64Array(numnod * 3);
  const x = new Float64Array(numnod * 3);
  const ms = new Float64Array(numnod);
  const ids = new Int32Array(numnod);
  for (let i = 0; i < numnod; i++) {
    ids[i] = view.getInt32(o, true);
    o += 4;
    for (let k = 0; k < 3; k++) {
      a[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    for (let k = 0; k < 3; k++) {
      v[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    for (let k = 0; k < 3; k++) {
      x[i * 3 + k] = view.getFloat64(o, true);
      o += 8;
    }
    ms[i] = view.getFloat64(o, true);
    o += 8;
  }
  const order = Array.from(ids.keys()).sort((i, j) => ids[i]! - ids[j]!);
  const as = new Float64Array(numnod * 3);
  const vs = new Float64Array(numnod * 3);
  const xs = new Float64Array(numnod * 3);
  const mss = new Float64Array(numnod);
  for (let ni = 0; ni < numnod; ni++) {
    const i = order[ni]!;
    as.set(a.subarray(i * 3, i * 3 + 3), ni * 3);
    vs.set(v.subarray(i * 3, i * 3 + 3), ni * 3);
    xs.set(x.subarray(i * 3, i * 3 + 3), ni * 3);
    mss[ni] = ms[i]!;
  }
  return { ncycle, numnod, dt1, dt2, dt12, a: as, v: vs, x: xs, ms: mss };
}

function parseGp(buf: Buffer) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 4 + 4 + 12;
  const rec = 5 * 4 + 19 * 8;
  const nRec = (buf.byteLength - o) / rec;
  const byKey = new Map<
    string,
    {
      d: Float64Array;
      sig: Float64Array;
      pla: number;
      vol: number;
      amu: number;
      rho: number;
      vol0: number;
    }
  >();
  for (let r = 0; r < nRec; r++) {
    const eid = view.getInt32(o, true);
    o += 4;
    o += 12; // ir,is,it
    const ip = view.getInt32(o, true);
    o += 4;
    const d = new Float64Array(6);
    for (let k = 0; k < 6; k++) {
      d[k] = view.getFloat64(o, true);
      o += 8;
    }
    const sig = new Float64Array(6);
    for (let k = 0; k < 6; k++) {
      sig[k] = view.getFloat64(o, true);
      o += 8;
    }
    const pla = view.getFloat64(o, true);
    o += 8;
    o += 16; // qvis epsd
    const vol0 = view.getFloat64(o, true);
    o += 8;
    const rho = view.getFloat64(o, true);
    o += 8;
    o += 16; // amu dump (cleared) + eint
    // Dump writes LBUF%VOL (=VOLO) and AMU after clear; recover VOLN/AMU from RHO.
    const amu = rho / RHO0 - 1;
    const vol = vol0 * (RHO0 / rho);
    byKey.set(`${eid}|${ip}`, { d, sig, pla, vol, amu, rho, vol0 });
  }
  return byKey;
}

function isSubnormal(x: number): boolean {
  return x !== 0 && Math.abs(x) < 2.2250738585072014e-308;
}

function ulpDiff(a: number, b: number): bigint {
  if (Object.is(a, b)) return 0n;
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setFloat64(0, a, true);
  const u1 = dv.getBigUint64(0, true);
  dv.setFloat64(0, b, true);
  const u2 = dv.getBigUint64(0, true);
  const sign = 0x8000000000000000n;
  if ((u1 ^ u2) & sign) return -1n;
  return u1 > u2 ? u1 - u2 : u2 - u1;
}

function stats(ours: ArrayLike<number>, live: ArrayLike<number>, label: string) {
  let n = 0;
  let nDenorm = 0;
  let nReal = 0;
  let maxAbs = 0;
  let maxUlp = 0n;
  let firstReal: { i: number; ours: number; live: number; abs: number; ulp: string } | null =
    null;
  const len = Math.min(ours.length, live.length);
  for (let i = 0; i < len; i++) {
    const o = Number(ours[i]);
    const l = Number(live[i]);
    if (Object.is(o, l)) continue;
    n++;
    const abs = Math.abs(o - l);
    if (abs > maxAbs) maxAbs = abs;
    const u = ulpDiff(o, l);
    if (u >= 0n && u > maxUlp) maxUlp = u;
    const den =
      (o === 0 && isSubnormal(l)) ||
      (l === 0 && isSubnormal(o)) ||
      (isSubnormal(o) && isSubnormal(l));
    if (den) nDenorm++;
    else {
      nReal++;
      if (!firstReal) firstReal = { i, ours: o, live: l, abs, ulp: u.toString() };
    }
  }
  return {
    label,
    n,
    nDenorm,
    nReal,
    bitwise: n === 0,
    realBitwise: nReal === 0,
    maxAbs,
    maxUlp: maxUlp.toString(),
    firstReal,
  };
}

const sched = parseDt(readFileSync(join(LIVE, "TAYLOR_dt.f64bin"))).map((r) => r.dt2);
const model = createTaylorBarModel({ nSide: 2, nZ: 4 });
const nNodes = model.mesh.coords.length / 3;
const nHex = model.mesh.hexes.length / 8;
const x = Float64Array.from(model.mesh.coords);
const v = new Float64Array(nNodes * 3);
for (let a = 0; a < nNodes; a++) {
  v[a * 3] = model.initialVelocity[0];
  v[a * 3 + 1] = model.initialVelocity[1];
  v[a * 3 + 2] = model.initialVelocity[2];
}
const masses = new Float64Array(nNodes);
const xScratch = new Float64Array(24);
const vScratch = new Float64Array(24);
const fHex = new Float64Array(24);
const hexConn: number[][] = [];
const hexStates: J2State[][] = [];
for (let e = 0; e < nHex; e++) {
  const conn = Array.from(model.mesh.hexes.slice(e * 8, e * 8 + 8));
  hexConn.push(conn);
  gatherHex(x, conn, xScratch);
  const m = hexLumpedNodalMass(xScratch, model.material.density);
  for (let ai = 0; ai < 8; ai++) masses[conn[ai]!]! += m[ai]!;
  hexStates.push(createHexGpStates(Float64Array.from(xScratch)));
}
const f = new Float64Array(nNodes * 3);
const acc = new Float64Array(nNodes * 3);
let dt1 = 0;

const cycles: unknown[] = [];
let firstRealBreak: { cycle: number; field: string; detail: unknown } | null = null;
const order = ["D", "VOL", "AMU", "SIG", "PLA", "MS", "A", "V", "X"] as const;

for (let step = 0; step <= MAX; step++) {
  const dt = sched[step]!;
  f.fill(0);
  const gpMap = new Map<
    string,
    { d: Float64Array; sig: Float64Array; pla: number; vol: number; amu: number }
  >();
  for (let e = 0; e < nHex; e++) {
    const conn = hexConn[e]!;
    gatherHex(x, conn, xScratch);
    gatherHex(v, conn, vScratch);
    const states = hexStates[e]!;
    const hier = hierarchicalGpGeometry(xScratch);
    const dBefore: Float64Array[] = [];
    const volBefore: number[] = [];
    for (let gp = 0; gp < 8; gp++) {
      const { gN, vol } = hier[gp]!;
      dBefore.push(s8edefo3Rates(gN, vScratch).d);
      volBefore.push(vol);
    }
    hexInternalForces({
      x: xScratch,
      v: vScratch,
      states,
      mat: model.material,
      dt: dt1,
      fOut: fHex,
      options: { jcvt: 0 },
      elementIndex: e,
    });
    for (let gp = 0; gp < 8; gp++) {
      const vol0 = states[gp]!.vol0;
      const vol = volBefore[gp]!;
      const amu =
        (model.material.density * (vol0 / Math.max(vol, 1e-30))) / model.material.density - 1;
      gpMap.set(`${e + 1}|${gp + 1}`, {
        d: dBefore[gp]!,
        sig: states[gp]!.stress.slice(),
        pla: states[gp]!.eqPlasticStrain,
        vol,
        amu,
      });
    }
    for (let ai = 0; ai < 8; ai++) {
      const n = conn[ai]!;
      f[n * 3]! -= fHex[ai * 3]!;
      f[n * 3 + 1]! -= fHex[ai * 3 + 1]!;
      f[n * 3 + 2]! -= fHex[ai * 3 + 2]!;
    }
  }
  for (let i = 0; i < nNodes; i++) {
    acc[i * 3] = f[i * 3]! / masses[i]!;
    acc[i * 3 + 1] = f[i * 3 + 1]! / masses[i]!;
    acc[i * 3 + 2] = f[i * 3 + 2]! / masses[i]!;
  }

  const liveA = parseAv(readFileSync(join(LIVE, `wmbd_postaccele_${step}.f64bin`)));
  const liveGp = parseGp(readFileSync(join(LIVE, `wmbd_gpsig_${step}.f64bin`)));
  const keys = [...gpMap.keys()].sort((a, b) => {
    const [ae, ai] = a.split("|").map(Number);
    const [be, bi] = b.split("|").map(Number);
    return ae! - be! || ai! - bi!;
  });
  const flat = (field: "d" | "sig" | "pla" | "vol" | "amu") => {
    if (field === "d" || field === "sig") {
      const ours = new Float64Array(keys.length * 6);
      const live = new Float64Array(keys.length * 6);
      for (let i = 0; i < keys.length; i++) {
        ours.set(gpMap.get(keys[i]!)![field], i * 6);
        live.set(liveGp.get(keys[i]!)![field], i * 6);
      }
      return { ours, live };
    }
    const ours = new Float64Array(keys.length);
    const live = new Float64Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      ours[i] = gpMap.get(keys[i]!)![field] as number;
      live[i] = liveGp.get(keys[i]!)![field] as number;
    }
    return { ours, live };
  };

  const fields: Record<string, ReturnType<typeof stats>> = {
    A: stats(acc, liveA.a, "A"),
    V: stats(v, liveA.v, "V"),
    X: stats(scrubNearZeros(x.slice()), scrubNearZeros(liveA.x), "X"),
    MS: stats(masses, liveA.ms, "MS"),
    D: stats(flat("d").ours, flat("d").live, "D"),
    SIG: stats(flat("sig").ours, flat("sig").live, "SIG"),
    PLA: stats(flat("pla").ours, flat("pla").live, "PLA"),
    VOL: stats(flat("vol").ours, flat("vol").live, "VOL"),
    AMU: stats(flat("amu").ours, flat("amu").live, "AMU"),
  };

  for (const name of order) {
    if (!fields[name]!.realBitwise && !firstRealBreak) {
      firstRealBreak = { cycle: step, field: name, detail: fields[name] };
    }
  }

  cycles.push({
    ncycle: step,
    dtMatch: Object.is(dt1, liveA.dt1) && Object.is(dt, liveA.dt2),
    fields,
  });

  const dt12 = 0.5 * (dt1 + dt);
  applyRigidWallKinematic({
    wall: model.wall,
    coords: x,
    velocities: v,
    accelerations: acc,
    dt,
    dt12,
  });
  for (let i = 0; i < v.length; i++) v[i]! += dt12 * acc[i]!;
  for (let i = 0; i < x.length; i++) x[i]! += dt * v[i]!;
  dt1 = dt;
}

const report = {
  note: "RHO-derived VOLN/AMU; denormal-filtered first real Object.is break",
  firstRealBreak,
  summary: cycles.map((c: any) => ({
    ncycle: c.ncycle,
    dtMatch: c.dtMatch,
    bits: Object.fromEntries(
      Object.entries(c.fields).map(([k, v]: any) => [
        k,
        { bitwise: v.bitwise, realBitwise: v.realBitwise, nReal: v.nReal, maxUlp: v.maxUlp },
      ]),
    ),
  })),
};
writeFileSync("docs/research/adaptive-forint-real-break.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
