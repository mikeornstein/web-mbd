import { parseVtkPoints } from "./shapeFromVtk.js";

export interface VtkAnimFrame {
  t: number;
  coords: Float64Array;
  /** VTK point index → Radioss node id (1-based). */
  nodeIdByPoint: Uint32Array;
  /** VTK cell index → Radioss element id (1-based). */
  elementIdByCell: Uint32Array;
  /** Four VTK point indices per cell. */
  cells: Uint32Array;
}

function isIntTok(v: string): boolean {
  return /^-?\d+$/.test(v);
}

function parseHeaderTime(vtk: string): number {
  const lines = vtk.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith("TIME")) {
      const next = lines[i + 1];
      if (next === undefined) break;
      const t = Number(next.trim());
      if (!Number.isFinite(t)) throw new Error("VTK TIME is not a number");
      return t;
    }
  }
  throw new Error("VTK missing TIME");
}

function parseIntScalars(vtk: string, name: string, expected: number): Uint32Array {
  const lines = vtk.split(/\r?\n/);
  const needle = `SCALARS ${name}`;
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith(needle)) i += 1;
  if (i >= lines.length) throw new Error(`VTK missing SCALARS ${name}`);
  i += 1;
  if (lines[i]?.startsWith("LOOKUP_TABLE")) i += 1;
  const out = new Uint32Array(expected);
  let n = 0;
  while (i < lines.length && n < expected) {
    const line = lines[i]!.trim();
    i += 1;
    if (!line) continue;
    if (/^(SCALARS|TENSORS|VECTORS|CELL_DATA|POINT_DATA|LOOKUP_TABLE)/.test(line)) break;
    for (const tok of line.split(/\s+/)) {
      if (tok.length === 0) continue;
      if (!isIntTok(tok)) throw new Error(`VTK ${name}: bad token ${tok}`);
      out[n] = Number(tok);
      n += 1;
      if (n === expected) break;
    }
  }
  if (n !== expected) throw new Error(`VTK ${name}: got ${n}, expected ${expected}`);
  return out;
}

function parseQuadCells(vtk: string, nCells: number): Uint32Array {
  const lines = vtk.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("CELLS")) i += 1;
  if (i >= lines.length) throw new Error("VTK missing CELLS");
  const head = lines[i]!.trim().split(/\s+/);
  const declared = Number(head[1]);
  if (declared !== nCells) throw new Error(`VTK CELLS ${declared} ≠ ${nCells}`);
  i += 1;
  const cells = new Uint32Array(nCells * 4);
  let e = 0;
  while (i < lines.length && e < nCells) {
    const line = lines[i]!.trim();
    i += 1;
    if (!line) continue;
    if (line.startsWith("CELL_TYPES")) break;
    const tok = line.split(/\s+/);
    if (tok[0] !== "4" || tok.length < 5) throw new Error(`VTK cell ${e} is not a four-node shell`);
    cells[e * 4] = Number(tok[1]);
    cells[e * 4 + 1] = Number(tok[2]);
    cells[e * 4 + 2] = Number(tok[3]);
    cells[e * 4 + 3] = Number(tok[4]);
    e += 1;
  }
  if (e !== nCells) throw new Error(`VTK CELLS: parsed ${e}, expected ${nCells}`);
  return cells;
}

export function parseVtkAnimFrame(vtk: string, expectedNodes: number, expectedCells: number): VtkAnimFrame {
  const t = parseHeaderTime(vtk);
  const coords = parseVtkPoints(vtk, { expectedNodes });
  if (coords.length !== expectedNodes * 3) {
    throw new Error(`VTK points ${coords.length / 3} ≠ ${expectedNodes}`);
  }
  const nodeIdByPoint = parseIntScalars(vtk, "NODE_ID", expectedNodes);
  const elementIdByCell = parseIntScalars(vtk, "ELEMENT_ID", expectedCells);
  const cells = parseQuadCells(vtk, expectedCells);
  return { t, coords, nodeIdByPoint, elementIdByCell, cells };
}

/** Scatter VTK point coordinates into 0-based Radioss/toy node order. */
export function scatterToNodeOrder(frame: VtkAnimFrame, nNodes: number): Float64Array {
  const out = new Float64Array(nNodes * 3);
  const seen = new Uint8Array(nNodes);
  for (let p = 0; p < frame.nodeIdByPoint.length; p++) {
    const id = frame.nodeIdByPoint[p]!;
    if (id < 1 || id > nNodes) throw new Error(`NODE_ID ${id} out of range`);
    const i = id - 1;
    out[i * 3] = frame.coords[p * 3]!;
    out[i * 3 + 1] = frame.coords[p * 3 + 1]!;
    out[i * 3 + 2] = frame.coords[p * 3 + 2]!;
    seen[i] = 1;
  }
  for (let i = 0; i < nNodes; i++) {
    if (seen[i] !== 1) throw new Error(`missing NODE_ID ${i + 1} in VTK`);
  }
  return out;
}

/** VTK cell connectivity as 0-based Radioss/toy node ids. */
export function cellsAsNodeQuads(frame: VtkAnimFrame): number[] {
  const quads: number[] = [];
  const n = frame.cells.length / 4;
  for (let e = 0; e < n; e++) {
    for (let k = 0; k < 4; k++) {
      const p = frame.cells[e * 4 + k]!;
      const id = frame.nodeIdByPoint[p];
      if (id === undefined) throw new Error(`cell ${e} point ${p} has no NODE_ID`);
      quads.push(id - 1);
    }
  }
  return quads;
}
