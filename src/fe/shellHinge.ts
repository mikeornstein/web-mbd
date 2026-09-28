import { NU } from "../inflate/constants.js";
import type { CstRest } from "./membraneCst.js";

/**
 * Kirchhoff hinge bending for QS-ish shells (Radioss `/PROP` Ithick=1).
 * Same locked μ, H0, ν as the membrane — not a μ retune. Dynamic path
 * stays membrane-only so PR#8 bands stay put.
 *
 * Hinges live on original mesh edges only (not CST split diagonals).
 * Radioss Q4 Belytschko has no crease on the toy's triangulation diagonal.
 */

export interface ShellHinge {
  i: number;
  j: number;
  k: number;
  l: number;
  theta0: number;
  kb: number;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

interface EdgeInc {
  a: number;
  b: number;
  opp: number;
  A0: number;
}

export function youngFromMu(mu: number, nu: number = NU): number {
  return 2 * mu * (1 + nu);
}

/** Flexural rigidity D = E H0³ / 12(1−ν²). */
export function flexuralRigidity(mu: number, h0: number, nu: number = NU): number {
  const E = youngFromMu(mu, nu);
  return (E * h0 * h0 * h0) / (12 * (1 - nu * nu));
}

/** Undirected mesh edges from `/SHELL` quads + leftover tris (no CST diagonals). */
export function meshEdgeKeys(quads: ArrayLike<number>, tris: ArrayLike<number> = []): Set<string> {
  const keys = new Set<string>();
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    const i0 = quads[e * 4]!,
      i1 = quads[e * 4 + 1]!,
      i2 = quads[e * 4 + 2]!,
      i3 = quads[e * 4 + 3]!;
    keys.add(edgeKey(i0, i1));
    keys.add(edgeKey(i1, i2));
    keys.add(edgeKey(i2, i3));
    keys.add(edgeKey(i3, i0));
  }
  const nt = tris.length / 3;
  for (let e = 0; e < nt; e++) {
    const a = tris[e * 3]!,
      b = tris[e * 3 + 1]!,
      c = tris[e * 3 + 2]!;
    keys.add(edgeKey(a, b));
    keys.add(edgeKey(b, c));
    keys.add(edgeKey(c, a));
  }
  return keys;
}

function dihedral(
  coords: ArrayLike<number>,
  i: number,
  j: number,
  k: number,
  l: number,
): number {
  const i3 = i * 3,
    j3 = j * 3,
    k3 = k * 3,
    l3 = l * 3;
  const ix = coords[i3]!,
    iy = coords[i3 + 1]!,
    iz = coords[i3 + 2]!;
  const e1x = coords[j3]! - ix,
    e1y = coords[j3 + 1]! - iy,
    e1z = coords[j3 + 2]! - iz;
  const e2x = coords[k3]! - ix,
    e2y = coords[k3 + 1]! - iy,
    e2z = coords[k3 + 2]! - iz;
  const e3x = coords[l3]! - ix,
    e3y = coords[l3 + 1]! - iy,
    e3z = coords[l3 + 2]! - iz;
  const n1x = e1y * e2z - e1z * e2y;
  const n1y = e1z * e2x - e1x * e2z;
  const n1z = e1x * e2y - e1y * e2x;
  const n2x = e3y * e1z - e3z * e1y;
  const n2y = e3z * e1x - e3x * e1z;
  const n2z = e3x * e1y - e3y * e1x;
  const l1 = Math.hypot(n1x, n1y, n1z);
  const l2 = Math.hypot(n2x, n2y, n2z);
  if (l1 < 1e-18 || l2 < 1e-18) return 0;
  const inv1 = 1 / l1,
    inv2 = 1 / l2;
  const u1x = n1x * inv1,
    u1y = n1y * inv1,
    u1z = n1z * inv1;
  const u2x = n2x * inv2,
    u2y = n2y * inv2,
    u2z = n2z * inv2;
  const el = Math.hypot(e1x, e1y, e1z);
  if (el < 1e-18) return 0;
  const invE = 1 / el;
  const ex = e1x * invE,
    ey = e1y * invE,
    ez = e1z * invE;
  const cx = u1y * u2z - u1z * u2y;
  const cy = u1z * u2x - u1x * u2z;
  const cz = u1x * u2y - u1y * u2x;
  const sin = ex * cx + ey * cy + ez * cz;
  const cos = Math.min(1, Math.max(-1, u1x * u2x + u1y * u2y + u1z * u2z));
  return Math.atan2(sin, cos);
}

export function buildShellHinges(
  coords0: ArrayLike<number>,
  rests: readonly CstRest[],
  mu: number,
  h0: number,
  nu: number = NU,
  meshEdges?: Set<string>,
): ShellHinge[] {
  const D = flexuralRigidity(mu, h0, nu);
  const inc = new Map<string, EdgeInc[]>();
  const add = (a: number, b: number, opp: number, A0: number): void => {
    const key = edgeKey(a, b);
    if (meshEdges && !meshEdges.has(key)) return;
    const list = inc.get(key);
    const row: EdgeInc = { a, b, opp, A0 };
    if (list) list.push(row);
    else inc.set(key, [row]);
  };
  for (const r of rests) {
    add(r.i, r.j, r.k, r.A0);
    add(r.j, r.k, r.i, r.A0);
    add(r.k, r.i, r.j, r.A0);
  }
  const hinges: ShellHinge[] = [];
  for (const pair of inc.values()) {
    if (pair.length !== 2) continue;
    const p = pair[0]!,
      q = pair[1]!;
    const i = p.a,
      j = p.b,
      k = p.opp,
      l = q.opp;
    if (k === l) continue;
    const ix = coords0[i * 3]!,
      iy = coords0[i * 3 + 1]!,
      iz = coords0[i * 3 + 2]!;
    const jx = coords0[j * 3]!,
      jy = coords0[j * 3 + 1]!,
      jz = coords0[j * 3 + 2]!;
    const L0 = Math.hypot(jx - ix, jy - iy, jz - iz);
    if (!(L0 > 0)) continue;
    const A = p.A0 + q.A0;
    if (!(A > 0)) continue;
    // Discrete Kirchhoff plate hinge: kb = 6 D L0² / (A1+A2). Not a fitted gain.
    const kb = (6 * D * L0 * L0) / A;
    const theta0 = dihedral(coords0, i, j, k, l);
    hinges.push({ i, j, k, l, theta0, kb });
  }
  return hinges;
}

/**
 * W = ½ kb (θ−θ0)². Forces are central-difference −∂W/∂x on the four
 * hinge vertices so the gradient matches the energy (the 50/50 opposite-flap
 * split is not −∇θ). Not a μ/gain knob.
 */
const HINGE_FD = new Float64Array(12);

export function accumulateHingeForces(coords: ArrayLike<number>, hinge: ShellHinge, f: Float64Array): number {
  const { i, j, k, l, theta0, kb } = hinge;
  const nodes = [i, j, k, l];
  const scratch = HINGE_FD;
  for (let n = 0; n < 4; n++) {
    const o = nodes[n]! * 3;
    scratch[n * 3] = coords[o]!;
    scratch[n * 3 + 1] = coords[o + 1]!;
    scratch[n * 3 + 2] = coords[o + 2]!;
  }
  const theta = dihedral(scratch, 0, 1, 2, 3);
  const dtheta = theta - theta0;
  const W = 0.5 * kb * dtheta * dtheta;
  if (!(Math.abs(dtheta) > 0) || !(kb > 0)) return W;
  const s = kb * dtheta;
  const h = 1e-7;
  const twoH = 2 * h;
  for (let n = 0; n < 4; n++) {
    for (let a = 0; a < 3; a++) {
      const dof = n * 3 + a;
      const saved = scratch[dof]!;
      scratch[dof] = saved + h;
      const tp = dihedral(scratch, 0, 1, 2, 3);
      scratch[dof] = saved - h;
      const tm = dihedral(scratch, 0, 1, 2, 3);
      scratch[dof] = saved;
      let dth = tp - tm;
      if (dth > Math.PI) dth -= 2 * Math.PI;
      if (dth < -Math.PI) dth += 2 * Math.PI;
      f[nodes[n]! * 3 + a]! -= (s * dth) / twoH;
    }
  }
  return W;
}
