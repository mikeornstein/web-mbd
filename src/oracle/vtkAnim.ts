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
  /** Point velocities in VTK point order, or null if the file has none. */
  velocities: Float64Array | null;
}

export interface VtkShellFrame {
  t: number;
  coords: Float64Array;
  nodeIdByPoint: Uint32Array;
  elementIdByCell: Uint32Array;
  /** VTK point indices per cell: 3 for a triangle shell, 4 for a quad. */
  cellPoints: number[][];
  /** Point velocities in VTK point order, or null if the file has none. */
  velocities: Float64Array | null;
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

function isVelocityVectorName(name: string): boolean {
  switch (name) {
    case "VEL":
    case "Velocity":
    case "VELOCITY":
    case "V":
      return true;
    default:
      return false;
  }
}

function parsePointVectors(vtk: string, expected: number): Float64Array | null {
  const lines = vtk.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("VECTORS ")) {
      const name = line.trim().split(/\s+/)[1];
      if (name !== undefined && isVelocityVectorName(name)) {
        i += 1;
        const out = new Float64Array(expected * 3);
        let n = 0;
        while (i < lines.length && n < expected * 3) {
          const raw = lines[i]!.trim();
          i += 1;
          if (!raw) continue;
          if (/^(SCALARS|TENSORS|VECTORS|CELL_DATA|POINT_DATA|LOOKUP_TABLE)/.test(raw)) break;
          for (const tok of raw.split(/\s+/)) {
            if (tok.length === 0) continue;
            const v = Number(tok);
            if (!Number.isFinite(v)) throw new Error(`VTK ${name}: bad token ${tok}`);
            out[n] = v;
            n += 1;
            if (n === expected * 3) break;
          }
        }
        if (n !== expected * 3) throw new Error(`VTK ${name}: got ${n / 3} vectors, expected ${expected}`);
        return out;
      }
    }
    i += 1;
  }
  return null;
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

function parseCellHeader(vtk: string): { i: number; nCells: number } {
  const lines = vtk.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i]!.startsWith("CELLS")) i += 1;
  if (i >= lines.length) throw new Error("VTK missing CELLS");
  const head = lines[i]!.trim().split(/\s+/);
  const nCells = Number(head[1]);
  if (!Number.isFinite(nCells) || nCells < 1) throw new Error(`VTK CELLS bad count ${head[1]}`);
  return { i: i + 1, nCells };
}

function parseShellCells(vtk: string): number[][] {
  const lines = vtk.split(/\r?\n/);
  const { i: start, nCells } = parseCellHeader(vtk);
  let i = start;
  const cells: number[][] = [];
  while (i < lines.length && cells.length < nCells) {
    const line = lines[i]!.trim();
    i += 1;
    if (!line) continue;
    if (line.startsWith("CELL_TYPES")) break;
    const tok = line.split(/\s+/);
    const n = Number(tok[0]);
    if (n !== 3 && n !== 4) throw new Error(`VTK cell ${cells.length} has ${String(n)} nodes`);
    if (tok.length < n + 1) throw new Error(`VTK cell ${cells.length} short`);
    const pts: number[] = [];
    for (let k = 1; k <= n; k++) pts.push(Number(tok[k]));
    if (n === 4 && pts[2] === pts[3]) pts.pop();
    cells.push(pts);
  }
  if (cells.length !== nCells) throw new Error(`VTK CELLS: parsed ${cells.length}, expected ${nCells}`);
  return cells;
}

function parseQuadCells(vtk: string, nCells: number): Uint32Array {
  const shells = parseShellCells(vtk);
  if (shells.length !== nCells) throw new Error(`VTK CELLS ${shells.length} ≠ ${nCells}`);
  const cells = new Uint32Array(nCells * 4);
  for (let e = 0; e < nCells; e++) {
    const s = shells[e]!;
    if (s.length !== 4) throw new Error(`VTK cell ${e} is not a four-node shell`);
    cells[e * 4] = s[0]!;
    cells[e * 4 + 1] = s[1]!;
    cells[e * 4 + 2] = s[2]!;
    cells[e * 4 + 3] = s[3]!;
  }
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
  const velocities = parsePointVectors(vtk, expectedNodes);
  return { t, coords, nodeIdByPoint, elementIdByCell, cells, velocities };
}

/** Animation frame with three- or four-node shells (triangle-deck diagnosis). */
export function parseVtkAnimShells(vtk: string, expectedNodes: number): VtkShellFrame {
  const t = parseHeaderTime(vtk);
  const coords = parseVtkPoints(vtk, { expectedNodes });
  if (coords.length !== expectedNodes * 3) {
    throw new Error(`VTK points ${coords.length / 3} ≠ ${expectedNodes}`);
  }
  const cellPoints = parseShellCells(vtk);
  const nodeIdByPoint = parseIntScalars(vtk, "NODE_ID", expectedNodes);
  const elementIdByCell = parseIntScalars(vtk, "ELEMENT_ID", cellPoints.length);
  const velocities = parsePointVectors(vtk, expectedNodes);
  return { t, coords, nodeIdByPoint, elementIdByCell, cellPoints, velocities };
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

export function scatterShellToNodeOrder(frame: VtkShellFrame, nNodes: number): Float64Array {
  const fake: VtkAnimFrame = {
    t: frame.t,
    coords: frame.coords,
    nodeIdByPoint: frame.nodeIdByPoint,
    elementIdByCell: frame.elementIdByCell,
    cells: new Uint32Array(0),
    velocities: frame.velocities,
  };
  return scatterToNodeOrder(fake, nNodes);
}

export function scatterVelocitiesToNodeOrder(
  nodeIdByPoint: Uint32Array,
  velocities: Float64Array,
  nNodes: number,
): Float64Array {
  const fake: VtkAnimFrame = {
    t: 0,
    coords: velocities,
    nodeIdByPoint,
    elementIdByCell: new Uint32Array(0),
    cells: new Uint32Array(0),
    velocities,
  };
  return scatterToNodeOrder(fake, nNodes);
}

/** Each cell as 0-based Radioss node ids (3 or 4). */
export function cellsAsNodeShells(frame: VtkShellFrame): number[][] {
  return frame.cellPoints.map((pts, e) =>
    pts.map((p) => {
      const id = frame.nodeIdByPoint[p];
      if (id === undefined) throw new Error(`cell ${e} point ${p} has no NODE_ID`);
      return id - 1;
    }),
  );
}
