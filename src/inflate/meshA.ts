import meshARaw from "../fixtures/meshes/A.json" with { type: "json" };
import meshBRaw from "../fixtures/meshes/B.json" with { type: "json" };
import meshCRaw from "../fixtures/meshes/C.json" with { type: "json" };
import {
  SHIP_B_NODES,
  SHIP_B_ORPHAN_TRIS,
  SHIP_B_SOURCE_QUADS,
  SHIP_C_NODES,
  SHIP_C_ORPHAN_TRIS,
  SHIP_C_SOURCE_QUADS,
  SHIP_MESH_NODES,
  SHIP_ORPHAN_TRIS,
  SHIP_SHELL_QUADS,
  SHIP_SOURCE_QUADS,
} from "./constants.js";
import type { InflateLetter, QuadShellMesh } from "./types.js";

interface AbcBake {
  pos0: number[];
  quads: [number, number, number, number][];
  faceTris: [number, number, number][];
  meta: {
    letter: InflateLetter;
    N: number;
    nMidTris: number;
    nOrphanCapTris: number;
  };
}

interface ShipSpec {
  letter: InflateLetter;
  N: number;
  sourceQuads: number;
  orphanTris: number;
  nMidTris: number;
  allowLeftoverTris: boolean;
  expectedShellQuads?: number;
}

const SHIP: Record<InflateLetter, ShipSpec> = {
  A: {
    letter: "A",
    N: SHIP_MESH_NODES,
    sourceQuads: SHIP_SOURCE_QUADS,
    orphanTris: SHIP_ORPHAN_TRIS,
    nMidTris: 0,
    allowLeftoverTris: false,
    expectedShellQuads: SHIP_SHELL_QUADS,
  },
  B: {
    letter: "B",
    N: SHIP_B_NODES,
    sourceQuads: SHIP_B_SOURCE_QUADS,
    orphanTris: SHIP_B_ORPHAN_TRIS,
    nMidTris: 47,
    allowLeftoverTris: true,
  },
  C: {
    letter: "C",
    N: SHIP_C_NODES,
    sourceQuads: SHIP_C_SOURCE_QUADS,
    orphanTris: SHIP_C_ORPHAN_TRIS,
    nMidTris: 0,
    allowLeftoverTris: true,
  },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isIndexTriple(v: unknown): v is [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3) return false;
  return v.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0);
}

function isIndexQuad(v: unknown): v is [number, number, number, number] {
  if (!Array.isArray(v) || v.length !== 4) return false;
  return v.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0);
}

function isLetter(v: unknown): v is InflateLetter {
  return v === "A" || v === "B" || v === "C";
}

/** Parse inflation-abc Design-PASS bake JSON. Unknown at the boundary. */
export function parseAbcBake(raw: unknown, expected: InflateLetter): AbcBake {
  const spec = SHIP[expected];
  if (!isRecord(raw)) throw new Error(`${expected}.json: not an object`);
  const pos0 = raw["pos0"];
  const quads = raw["quads"];
  const faceTris = raw["faceTris"];
  const metaRaw = raw["meta"];
  if (!Array.isArray(pos0) || !pos0.every(isFiniteNumber)) throw new Error(`${expected}.json: bad pos0`);
  if (pos0.length % 3 !== 0) throw new Error(`${expected}.json: pos0 length not multiple of 3`);
  if (!Array.isArray(quads) || !quads.every(isIndexQuad)) throw new Error(`${expected}.json: bad quads`);
  if (!Array.isArray(faceTris) || !faceTris.every(isIndexTriple)) {
    throw new Error(`${expected}.json: bad faceTris`);
  }
  if (!isRecord(metaRaw)) throw new Error(`${expected}.json: bad meta`);
  const letter = metaRaw["letter"];
  const N = metaRaw["N"];
  const nMidTris = metaRaw["nMidTris"];
  const nOrphanCapTris = metaRaw["nOrphanCapTris"];
  if (!isLetter(letter) || letter !== expected) {
    throw new Error(`${expected}.json: expected letter ${expected}, got ${String(letter)}`);
  }
  if (N !== spec.N) throw new Error(`${expected}.json: expected N=${spec.N}, got ${String(N)}`);
  if (nMidTris !== spec.nMidTris) {
    throw new Error(`${expected}.json: expected nMidTris=${spec.nMidTris}, got ${String(nMidTris)}`);
  }
  if (nOrphanCapTris !== spec.orphanTris) {
    throw new Error(`${expected}.json: expected ${spec.orphanTris} orphan cap tris`);
  }
  if (quads.length !== spec.sourceQuads) {
    throw new Error(`${expected}.json: expected ${spec.sourceQuads} source quads`);
  }
  if (faceTris.length !== spec.orphanTris) {
    throw new Error(`${expected}.json: expected ${spec.orphanTris} faceTris`);
  }
  return {
    pos0: pos0.slice(),
    quads: quads.map((q): [number, number, number, number] => [q[0], q[1], q[2], q[3]]),
    faceTris: faceTris.map((t): [number, number, number] => [t[0], t[1], t[2]]),
    meta: { letter: expected, N: spec.N, nMidTris: spec.nMidTris, nOrphanCapTris: spec.orphanTris },
  };
}

function mergeTriPair(
  t1: readonly [number, number, number],
  t2: readonly [number, number, number],
  shared: readonly [number, number],
): [number, number, number, number] {
  const sh = new Set(shared);
  const u1 = t1.find((v) => !sh.has(v));
  const u2 = t2.find((v) => !sh.has(v));
  if (u1 === undefined || u2 === undefined) throw new Error("orphan pair: missing unique vertices");
  const i = t1.indexOf(u1);
  const n1 = t1[(i + 1) % 3]!;
  const n2 = t1[(i + 2) % 3]!;
  return [u1, n1, u2, n2];
}

export interface QuadifyResult {
  quads: [number, number, number, number][];
  leftover: [number, number, number][];
}

/**
 * Pair orphan faceTris that share an edge into quads (PR#8 convert-time map).
 * Does not remesh existing midplane quads. Leftover CST triangles are returned
 * (letter A must be empty; B/C may keep unpaired caps).
 */
export function quadifyOrphans(
  quads: readonly (readonly [number, number, number, number])[],
  orphans: readonly (readonly [number, number, number])[],
): QuadifyResult {
  const all: [number, number, number, number][] = quads.map((q) => [q[0], q[1], q[2], q[3]]);
  if (orphans.length === 0) return { quads: all, leftover: [] };
  const edges = new Map<string, number[]>();
  const tris: [number, number, number][] = orphans.map((t) => [t[0], t[1], t[2]]);
  for (let ti = 0; ti < tris.length; ti++) {
    const t = tris[ti]!;
    for (let j = 0; j < 3; j++) {
      const a = t[j]!;
      const b = t[(j + 1) % 3]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const list = edges.get(key);
      if (list) list.push(ti);
      else edges.set(key, [ti]);
    }
  }
  const used = new Set<number>();
  for (const [key, ids] of edges) {
    if (ids.length !== 2) continue;
    const a = ids[0]!;
    const b = ids[1]!;
    if (used.has(a) || used.has(b)) continue;
    used.add(a);
    used.add(b);
    const [s0, s1] = key.split(",").map(Number);
    if (s0 === undefined || s1 === undefined) throw new Error("bad edge key");
    all.push(mergeTriPair(tris[a]!, tris[b]!, [s0, s1]));
  }
  const leftover = tris.filter((_, i) => !used.has(i));
  return { quads: all, leftover };
}

export function enclosedVolume(
  coords: ArrayLike<number>,
  quads: ArrayLike<number>,
  tris: ArrayLike<number> = [],
): number {
  let v = 0;
  const nq = quads.length / 4;
  for (let e = 0; e < nq; e++) {
    const i0 = quads[e * 4]!;
    const i1 = quads[e * 4 + 1]!;
    const i2 = quads[e * 4 + 2]!;
    const i3 = quads[e * 4 + 3]!;
    v += tetVol(coords, i0, i1, i2);
    v += tetVol(coords, i0, i2, i3);
  }
  const nt = tris.length / 3;
  for (let e = 0; e < nt; e++) {
    v += tetVol(coords, tris[e * 3]!, tris[e * 3 + 1]!, tris[e * 3 + 2]!);
  }
  return v;
}

function tetVol(coords: ArrayLike<number>, ia: number, ib: number, ic: number): number {
  const ax = coords[ia * 3]!,
    ay = coords[ia * 3 + 1]!,
    az = coords[ia * 3 + 2]!;
  const bx = coords[ib * 3]!,
    by = coords[ib * 3 + 1]!,
    bz = coords[ib * 3 + 2]!;
  const cx = coords[ic * 3]!,
    cy = coords[ic * 3 + 1]!,
    cz = coords[ic * 3 + 2]!;
  return (
    (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
  );
}

/** FNV-1a 32-bit over IEEE coords + connectivity (stable mesh id). */
export function meshFingerprint(
  coords: ArrayLike<number>,
  quads: ArrayLike<number>,
  tris: ArrayLike<number> = [],
): string {
  const n = coords.length;
  const bytes = new Uint8Array(n * 8 + quads.length * 4 + tris.length * 4);
  const f64 = new Float64Array(bytes.buffer, 0, n);
  for (let i = 0; i < n; i++) f64[i] = coords[i]!;
  const view = new DataView(bytes.buffer);
  const base = n * 8;
  for (let i = 0; i < quads.length; i++) {
    view.setInt32(base + i * 4, quads[i]!, true);
  }
  const tbase = base + quads.length * 4;
  for (let i = 0; i < tris.length; i++) {
    view.setInt32(tbase + i * 4, tris[i]!, true);
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function rawFor(letter: InflateLetter): unknown {
  switch (letter) {
    case "A":
      return meshARaw;
    case "B":
      return meshBRaw;
    case "C":
      return meshCRaw;
    default: {
      const _exhaustive: never = letter;
      throw new Error(`unhandled letter ${String(_exhaustive)}`);
    }
  }
}

export function loadShipMesh(letter: InflateLetter): QuadShellMesh {
  const spec = SHIP[letter];
  const bake = parseAbcBake(rawFor(letter), letter);
  const nNodes = bake.pos0.length / 3;
  const { quads, leftover } = quadifyOrphans(bake.quads, bake.faceTris);
  if (!spec.allowLeftoverTris && leftover.length !== 0) {
    throw new Error(`quadify left ${leftover.length} unpaired tris — refuse SH3N`);
  }
  if (spec.expectedShellQuads !== undefined && quads.length !== spec.expectedShellQuads) {
    throw new Error(`expected ${spec.expectedShellQuads} shells after quadify, got ${quads.length}`);
  }
  const packed: number[] = [];
  for (const q of quads) packed.push(q[0], q[1], q[2], q[3]);
  const packedTris: number[] = [];
  for (const t of leftover) packedTris.push(t[0], t[1], t[2]);
  const v0 = enclosedVolume(bake.pos0, packed, packedTris);
  let vOrphans = 0;
  for (const t of bake.faceTris) vOrphans += tetVol(bake.pos0, t[0], t[1], t[2]);
  const srcPacked: number[] = [];
  for (const q of bake.quads) srcPacked.push(q[0], q[1], q[2], q[3]);
  const vSrc = enclosedVolume(bake.pos0, srcPacked) + vOrphans;
  if (Math.abs(v0 - vSrc) > 1e-12 * Math.max(Math.abs(vSrc), 1e-12)) {
    throw new Error(`quadify changed V0: ${vSrc} → ${v0}`);
  }
  for (const id of packed) {
    if (id < 0 || id >= nNodes) throw new Error(`bad shell node ${id}`);
  }
  for (const id of packedTris) {
    if (id < 0 || id >= nNodes) throw new Error(`bad leftover tri node ${id}`);
  }
  return {
    coords: bake.pos0.slice(),
    quads: packed,
    tris: packedTris,
    nNodes,
    nQuads: quads.length,
    nTris: leftover.length,
    fingerprint: meshFingerprint(bake.pos0, packed, packedTris),
    letter,
  };
}

export function loadShipMeshA(): QuadShellMesh {
  return loadShipMesh("A");
}
