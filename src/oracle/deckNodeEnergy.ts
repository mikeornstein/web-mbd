/**
 * Quad-split mapping and toy-function energy for the four-deck node-output
 * re-run. Split is locked before the engine run. Do not change it after
 * seeing numbers.
 */
import { buildCstRest, cstSample, splitQuadCsts, type CstRest } from "../fe/membraneCst.js";
import { H0, MU, RHO } from "../inflate/constants.js";
import { reverseQuad } from "../inflate/orientShell.js";
import { stretchFieldFromShells, stretchStats } from "./stretchField.js";

export type NodeQuad = readonly [number, number, number, number];
export type NodeTri = readonly [number, number, number];

export interface RadiossShell {
  id: number;
  nodes: number[];
}

export interface PairKey {
  lo: number;
  hi: number;
}

export interface ToyQuadDiag {
  quadIndex: number;
  nodes: NodeQuad;
  primary: PairKey;
  sensitivity: PairKey;
}

export interface SplitPlan {
  kind: "mapped-1554" | "fine-local" | "triangle-committed";
  primaryTris: NodeTri[];
  sensitivityTris: NodeTri[];
  mappedCount: number;
  unmappedCount: number;
  primaryMatchesWrittenI0I2: number;
  toyQuadCount: number;
  note: string;
}

export function pairKey(a: number, b: number): PairKey {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

export function pairEqual(a: PairKey, b: PairKey): boolean {
  return a.lo === b.lo && a.hi === b.hi;
}

export function pairLabel(p: PairKey): string {
  return `${String(p.lo)}-${String(p.hi)}`;
}

export function fourNodeKey(nodes: readonly number[]): string {
  return nodes
    .slice()
    .sort((a, b) => a - b)
    .join(",");
}

/** reverseQuad is (i0,i3,i2,i1); unordered {i0,i2} is invariant. */
export function reversePreservesPrimaryPair(q: NodeQuad): boolean {
  const r = reverseQuad(q);
  return pairEqual(pairKey(q[0], q[2]), pairKey(r[0], r[2]));
}

export function toyDiagonalsFromOrientedQuads(quads: ArrayLike<number>): ToyQuadDiag[] {
  const nq = quads.length / 4;
  const out: ToyQuadDiag[] = [];
  for (let e = 0; e < nq; e++) {
    const nodes: NodeQuad = [quads[e * 4]!, quads[e * 4 + 1]!, quads[e * 4 + 2]!, quads[e * 4 + 3]!];
    out.push({
      quadIndex: e,
      nodes,
      primary: pairKey(nodes[0], nodes[2]),
      sensitivity: pairKey(nodes[1], nodes[3]),
    });
  }
  return out;
}

/**
 * Rotate or reverse a four-node shell so the first and third nodes are the
 * requested diagonal. Then splitQuadCsts on that order is the requested pair.
 */
export function orderQuadOnDiagonal(nodes: NodeQuad, diag: PairKey): NodeQuad | null {
  const seq: NodeQuad[] = [
    [nodes[0], nodes[1], nodes[2], nodes[3]],
    [nodes[1], nodes[2], nodes[3], nodes[0]],
    [nodes[2], nodes[3], nodes[0], nodes[1]],
    [nodes[3], nodes[0], nodes[1], nodes[2]],
    [nodes[0], nodes[3], nodes[2], nodes[1]],
    [nodes[3], nodes[2], nodes[1], nodes[0]],
    [nodes[2], nodes[1], nodes[0], nodes[3]],
    [nodes[1], nodes[0], nodes[3], nodes[2]],
  ];
  for (const o of seq) {
    if (pairEqual(pairKey(o[0], o[2]), diag)) return o;
  }
  return null;
}

export function otherDiagonalOf(nodes: NodeQuad, primary: PairKey): PairKey {
  const rest: number[] = [];
  for (const n of nodes) {
    if (n !== primary.lo && n !== primary.hi) rest.push(n);
  }
  if (rest.length !== 2) return pairKey(nodes[1], nodes[3]);
  return pairKey(rest[0]!, rest[1]!);
}

function trisFromOrderedQuad(q: NodeQuad): [NodeTri, NodeTri] {
  return [
    [q[0], q[1], q[2]],
    [q[0], q[2], q[3]],
  ];
}

export function parseRadiossShellBlock(starter: string, card: "/SHELL/1" | "/SH3N/1"): RadiossShell[] {
  const mark = `\n${card}\n`;
  const start = starter.indexOf(mark);
  if (start < 0) throw new Error(`starter missing ${card}`);
  const rest = starter.slice(start + 1);
  const endRel = rest.search(/\n\/[A-Z]/);
  const block = endRel < 0 ? rest : rest.slice(0, endRel);
  const expect = card === "/SHELL/1" ? 5 : 4;
  const out: RadiossShell[] = [];
  for (const line of block.split("\n")) {
    if (!/^\s*\d+(\s+\d+){3,4}\s*$/.test(line)) continue;
    const tok = line.trim().split(/\s+/);
    if (tok.length !== expect) continue;
    const id = Number(tok[0]);
    const nodes: number[] = [];
    for (let i = 1; i < tok.length; i++) nodes.push(Number(tok[i]));
    if (!Number.isInteger(id) || nodes.some((n) => !Number.isInteger(n) || n < 1)) continue;
    out.push({ id, nodes });
  }
  if (out.length === 0) throw new Error(`no elements under ${card}`);
  return out;
}

/** Radioss ids are 1-based; toy / VTK scatter uses 0-based. */
export function toZeroBased(nodes: readonly number[]): number[] {
  return nodes.map((n) => n - 1);
}

export function splitPlanFor1554Quads(
  toy: readonly ToyQuadDiag[],
  deckQuadsRadioss: readonly RadiossShell[],
): SplitPlan {
  const byFour = new Map<string, ToyQuadDiag>();
  for (const t of toy) byFour.set(fourNodeKey(t.nodes), t);
  const primaryTris: NodeTri[] = [];
  const sensitivityTris: NodeTri[] = [];
  let mapped = 0;
  let unmapped = 0;
  let matchesWritten = 0;
  for (const shell of deckQuadsRadioss) {
    const zb = toZeroBased(shell.nodes);
    if (zb.length !== 4) {
      unmapped += 1;
      continue;
    }
    const q: NodeQuad = [zb[0]!, zb[1]!, zb[2]!, zb[3]!];
    const toyQ = byFour.get(fourNodeKey(q));
    if (toyQ === undefined) {
      unmapped += 1;
      continue;
    }
    mapped += 1;
    const writtenPrimary = pairKey(q[0], q[2]);
    if (pairEqual(writtenPrimary, toyQ.primary)) matchesWritten += 1;
    const ordered = orderQuadOnDiagonal(q, toyQ.primary);
    if (ordered === null) {
      unmapped += 1;
      mapped -= 1;
      continue;
    }
    const [a, b] = trisFromOrderedQuad(ordered);
    primaryTris.push(a, b);
    const sensOrder = orderQuadOnDiagonal(q, toyQ.sensitivity);
    if (sensOrder !== null) {
      const [s0, s1] = trisFromOrderedQuad(sensOrder);
      sensitivityTris.push(s0, s1);
    }
  }
  return {
    kind: "mapped-1554",
    primaryTris,
    sensitivityTris,
    mappedCount: mapped,
    unmappedCount: unmapped,
    primaryMatchesWrittenI0I2: matchesWritten,
    toyQuadCount: toy.length,
    note:
      unmapped === 0 && mapped === toy.length
        ? "every deck quad mapped to a toy quad by four-node set; primary diagonal is the toy i0–i2 pair"
        : `mapped ${String(mapped)} of ${String(toy.length)} toy quads; unmapped ${String(unmapped)}`,
  };
}

export function splitPlanForFineLocal(deckQuadsRadioss: readonly RadiossShell[]): SplitPlan {
  const primaryTris: NodeTri[] = [];
  const sensitivityTris: NodeTri[] = [];
  for (const shell of deckQuadsRadioss) {
    const zb = toZeroBased(shell.nodes);
    if (zb.length !== 4) continue;
    const q: NodeQuad = [zb[0]!, zb[1]!, zb[2]!, zb[3]!];
    const [a, b] = trisFromOrderedQuad(q);
    primaryTris.push(a, b);
    const other = otherDiagonalOf(q, pairKey(q[0], q[2]));
    const sens = orderQuadOnDiagonal(q, other);
    if (sens !== null) {
      const [s0, s1] = trisFromOrderedQuad(sens);
      sensitivityTris.push(s0, s1);
    }
  }
  return {
    kind: "fine-local",
    primaryTris,
    sensitivityTris,
    mappedCount: deckQuadsRadioss.length,
    unmappedCount: 0,
    primaryMatchesWrittenI0I2: deckQuadsRadioss.length,
    toyQuadCount: 1554,
    note: "fine 1-to-4 cannot share the 1554-quad node-pair map; primary is each fine shell’s written i0–i2",
  };
}

export function splitPlanForCommittedTriangles(
  toy: readonly ToyQuadDiag[],
  sh3nRadioss: readonly RadiossShell[],
): SplitPlan {
  const primaryTris: NodeTri[] = [];
  for (const shell of sh3nRadioss) {
    const zb = toZeroBased(shell.nodes);
    if (zb.length !== 3) continue;
    primaryTris.push([zb[0]!, zb[1]!, zb[2]!]);
  }
  const sensitivityTris: NodeTri[] = [];
  const byFour = new Map<string, ToyQuadDiag>();
  for (const t of toy) byFour.set(fourNodeKey(t.nodes), t);
  let matches = 0;
  let parentCount = 0;
  for (let i = 0; i + 1 < sh3nRadioss.length; i += 2) {
    const a = toZeroBased(sh3nRadioss[i]!.nodes);
    const b = toZeroBased(sh3nRadioss[i + 1]!.nodes);
    if (a.length !== 3 || b.length !== 3) continue;
    const nodes = [...new Set([...a, ...b])];
    if (nodes.length !== 4) continue;
    parentCount += 1;
    const qGuess: NodeQuad = [a[0]!, a[1]!, a[2]!, b[2]!];
    const toyQ = byFour.get(fourNodeKey(nodes));
    if (toyQ === undefined) continue;
    const committedDiag = pairKey(a[0]!, a[2]!);
    if (pairEqual(committedDiag, toyQ.primary)) matches += 1;
    const sens = orderQuadOnDiagonal(qGuess, toyQ.sensitivity);
    if (sens !== null) {
      const [s0, s1] = trisFromOrderedQuad(sens);
      sensitivityTris.push(s0, s1);
    }
  }
  return {
    kind: "triangle-committed",
    primaryTris,
    sensitivityTris,
    mappedCount: matches,
    unmappedCount: parentCount - matches,
    primaryMatchesWrittenI0I2: matches,
    toyQuadCount: toy.length,
    note:
      matches === toy.length
        ? "committed /SH3N triangles already use the toy i0–i2 pair on every parent quad"
        : `committed /SH3N matches toy i0–i2 on ${String(matches)} of ${String(toy.length)} parent quads`,
  };
}

export function restsFromTris(restCoords: ArrayLike<number>, tris: readonly NodeTri[]): CstRest[] {
  const out: CstRest[] = [];
  for (const t of tris) {
    const rest = buildCstRest(restCoords, t[0], t[1], t[2]);
    if (rest) out.push(rest);
  }
  return out;
}

export function strainEnergyFromRests(
  coords: ArrayLike<number>,
  rests: readonly CstRest[],
  mu: number = MU,
  h0: number = H0,
): number {
  let psi = 0;
  for (const rest of rests) psi += cstSample(coords, rest, mu, h0).W;
  return psi;
}

export function lumpedMassesFromRests(
  nNodes: number,
  rests: readonly CstRest[],
  rho: number = RHO,
  h0: number = H0,
): Float64Array {
  const masses = new Float64Array(nNodes);
  for (const rest of rests) {
    const m = (rho * h0 * rest.A0) / 3;
    masses[rest.i]! += m;
    masses[rest.j]! += m;
    masses[rest.k]! += m;
  }
  return masses;
}

export function kineticEnergyFromVelocities(vel: ArrayLike<number>, masses: ArrayLike<number>): number {
  let ke = 0;
  const n = masses.length;
  for (let i = 0; i < n; i++) {
    const vx = vel[i * 3]!;
    const vy = vel[i * 3 + 1]!;
    const vz = vel[i * 3 + 2]!;
    ke += 0.5 * masses[i]! * (vx * vx + vy * vy + vz * vz);
  }
  return ke;
}

export function stretchFromTris(
  coords: ArrayLike<number>,
  restCoords: ArrayLike<number>,
  tris: readonly NodeTri[],
): { max: number; median: number; n: number } {
  const shells = tris.map((t) => [t[0], t[1], t[2]]);
  const field = stretchFieldFromShells(coords, restCoords, shells);
  const stats = stretchStats(field);
  return { max: stats.max, median: stats.p50, n: stats.n };
}

/** Confirm splitQuadCsts on an ordered quad equals the two primary triangles. */
export function splitQuadCstsIsI0I2(restCoords: ArrayLike<number>, q: NodeQuad): boolean {
  const pair = splitQuadCsts(restCoords, q[0], q[1], q[2], q[3]);
  if (!pair) return false;
  return (
    pair.a.i === q[0] &&
    pair.a.j === q[1] &&
    pair.a.k === q[2] &&
    pair.b.i === q[0] &&
    pair.b.j === q[2] &&
    pair.b.k === q[3]
  );
}
