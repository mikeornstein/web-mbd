import type { HexMesh } from "../ir/types.js";
import { boundaryHexFaces, faceNormal, type HexQuad } from "./hexFaces.js";
import { defaultCamera, projectPoint, toViewSpace, type Camera3 } from "./project3d.js";

const HEX_EDGES: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export type MeshDrawMode = "solid" | "wire" | "both";

export interface MeshCanvasOptions {
  title: string;
  stroke?: string;
  fill?: string;
  wallZ?: number;
  drawMode?: MeshDrawMode;
}

const LIGHT = normalize3(-0.4, 0.75, -0.55);

export class MeshCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private camera: Camera3 = defaultCamera();
  private coords: ArrayLike<number> = [];
  private hexes: number[] = [];
  private faces: HexQuad[] = [];
  private stroke = "#4cc2ff";
  private fill = "#4cc2ff";
  private drawMode: MeshDrawMode = "both";
  private wallZ: number | undefined;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly titleEl: HTMLElement;
  private title = "";

  constructor(host: HTMLElement, options: MeshCanvasOptions) {
    this.title = options.title;
    this.titleEl = document.createElement("h3");
    this.titleEl.textContent = options.title;

    this.canvas = document.createElement("canvas");
    this.canvas.width = 640;
    this.canvas.height = 400;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas unavailable");
    this.ctx = ctx;
    this.stroke = options.stroke ?? this.stroke;
    this.fill = options.fill ?? this.stroke;
    this.wallZ = options.wallZ;
    this.drawMode = options.drawMode ?? this.drawMode;
    this.syncAria();

    host.append(this.titleEl, this.canvas);
    this.bindPointer();
    this.draw();
  }

  setTitle(title: string): void {
    this.title = title;
    this.titleEl.textContent = title;
    this.syncAria();
  }

  setDrawMode(mode: MeshDrawMode): void {
    if (this.drawMode === mode) return;
    this.drawMode = mode;
    this.syncAria();
    this.draw();
  }

  setMesh(mesh: HexMesh, coords?: ArrayLike<number>, wallZ?: number): void {
    this.hexes = mesh.hexes;
    this.coords = coords ?? mesh.coords;
    this.faces = boundaryHexFaces(this.hexes);
    if (wallZ !== undefined) this.wallZ = wallZ;
    this.fitCamera();
    this.draw();
  }

  /** Update nodal positions without refitting the camera (time-step scrub). */
  setCoords(coords: ArrayLike<number>): void {
    this.coords = coords;
    this.draw();
  }

  clear(): void {
    this.hexes = [];
    this.coords = [];
    this.faces = [];
    this.draw();
  }

  private syncAria(): void {
    const shading = drawModeLabel(this.drawMode);
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", `${this.title}, ${shading} shading`);
  }

  private fitCamera(): void {
    let maxR = 0;
    for (let i = 0; i < this.coords.length; i += 3) {
      const x = this.coords[i] ?? 0;
      const y = this.coords[i + 1] ?? 0;
      const z = this.coords[i + 2] ?? 0;
      maxR = Math.max(maxR, Math.hypot(x, y, z));
    }
    this.camera.distance = Math.max(maxR * 2.8, 0.02);
  }

  private bindPointer(): void {
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointerup", () => {
      this.dragging = false;
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.camera.yaw += dx * 0.01;
      this.camera.pitch = clamp(this.camera.pitch + dy * 0.01, -1.2, 1.2);
      this.draw();
    });
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.camera.distance *= e.deltaY > 0 ? 1.08 : 0.92;
        this.camera.distance = clamp(this.camera.distance, 0.01, 1);
        this.draw();
      },
      { passive: false },
    );
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#1a2330";
    ctx.lineWidth = 1;
    for (let g = -4; g <= 4; g++) {
      const a = projectPoint(g * 0.005, 0, -0.01, this.camera, w, h);
      const b = projectPoint(g * 0.005, 0, 0.05, this.camera, w, h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    if (this.wallZ !== undefined) {
      const z = this.wallZ;
      const corners: [number, number][] = [
        [-0.01, -0.01],
        [0.01, -0.01],
        [0.01, 0.01],
        [-0.01, 0.01],
      ];
      ctx.fillStyle = "rgba(255, 120, 80, 0.25)";
      ctx.strokeStyle = "#ff7850";
      ctx.beginPath();
      for (let i = 0; i < corners.length; i++) {
        const [cx, cy] = corners[i]!;
        const p = projectPoint(cx, cy, z, this.camera, w, h);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (this.hexes.length === 0) {
      ctx.fillStyle = "#9aa7b5";
      ctx.font = "14px IBM Plex Sans, sans-serif";
      ctx.fillText("No mesh loaded", 24, h / 2);
      return;
    }

    if (wantsFill(this.drawMode)) this.drawFaces(w, h);
    if (wantsWire(this.drawMode)) this.drawEdges(w, h);
  }

  private drawFaces(w: number, h: number): void {
    const { ctx } = this;
    const rgb = parseHexRgb(this.fill);
    const projected: { pts: { x: number; y: number }[]; depth: number; shade: number }[] = [];

    for (const face of this.faces) {
      const pts: { x: number; y: number }[] = [];
      let depth = 0;
      for (const node of face) {
        const p = projectPoint(
          this.coords[node * 3]!,
          this.coords[node * 3 + 1]!,
          this.coords[node * 3 + 2]!,
          this.camera,
          w,
          h,
        );
        pts.push({ x: p.x, y: p.y });
        depth += p.depth;
      }
      const n = faceNormal(this.coords, face);
      const nv = toViewSpace(n[0], n[1], n[2], this.camera);
      const ndotl = nv.x * LIGHT[0] + nv.y * LIGHT[1] + nv.z * LIGHT[2];
      const shade = 0.18 + 0.82 * Math.max(0, ndotl);
      projected.push({ pts, depth: depth / 4, shade });
    }
    projected.sort((a, b) => b.depth - a.depth);

    for (const face of projected) {
      ctx.fillStyle = rgbCss(rgb, face.shade);
      ctx.beginPath();
      ctx.moveTo(face.pts[0]!.x, face.pts[0]!.y);
      for (let i = 1; i < face.pts.length; i++) {
        ctx.lineTo(face.pts[i]!.x, face.pts[i]!.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawEdges(w: number, h: number): void {
    const { ctx } = this;
    const edges: { x0: number; y0: number; x1: number; y1: number; depth: number }[] = [];
    for (let e = 0; e < this.hexes.length; e += 8) {
      for (const [a, b] of HEX_EDGES) {
        const ia = this.hexes[e + a]!;
        const ib = this.hexes[e + b]!;
        const pa = projectPoint(
          this.coords[ia * 3]!,
          this.coords[ia * 3 + 1]!,
          this.coords[ia * 3 + 2]!,
          this.camera,
          w,
          h,
        );
        const pb = projectPoint(
          this.coords[ib * 3]!,
          this.coords[ib * 3 + 1]!,
          this.coords[ib * 3 + 2]!,
          this.camera,
          w,
          h,
        );
        edges.push({
          x0: pa.x,
          y0: pa.y,
          x1: pb.x,
          y1: pb.y,
          depth: (pa.depth + pb.depth) * 0.5,
        });
      }
    }
    edges.sort((u, v) => v.depth - u.depth);

    ctx.strokeStyle = this.stroke;
    ctx.lineWidth = this.drawMode === "both" ? 0.9 : 1.25;
    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(edge.x0, edge.y0);
      ctx.lineTo(edge.x1, edge.y1);
      ctx.stroke();
    }
  }
}

function wantsFill(mode: MeshDrawMode): boolean {
  switch (mode) {
    case "solid":
    case "both":
      return true;
    case "wire":
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function wantsWire(mode: MeshDrawMode): boolean {
  switch (mode) {
    case "wire":
    case "both":
      return true;
    case "solid":
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function drawModeLabel(mode: MeshDrawMode): string {
  switch (mode) {
    case "solid":
      return "solid";
    case "wire":
      return "wire";
    case "both":
      return "solid and wire";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function parseHexRgb(hex: string): [number, number, number] {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length !== 6) return [76, 194, 255];
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function rgbCss(rgb: [number, number, number], shade: number): string {
  const r = Math.round(rgb[0] * shade);
  const g = Math.round(rgb[1] * shade);
  const b = Math.round(rgb[2] * shade);
  return `rgb(${r}, ${g}, ${b})`;
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
