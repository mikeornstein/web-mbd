import type { HexMesh } from "../ir/types.js";
import { defaultCamera, projectPoint, type Camera3 } from "./project3d.js";

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

export interface MeshCanvasOptions {
  title: string;
  stroke?: string;
  wallZ?: number;
}

export class MeshCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private camera: Camera3 = defaultCamera();
  private coords: ArrayLike<number> = [];
  private hexes: number[] = [];
  private stroke = "#4cc2ff";
  private wallZ: number | undefined;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly titleEl: HTMLElement;

  constructor(host: HTMLElement, options: MeshCanvasOptions) {
    this.titleEl = document.createElement("h3");
    this.titleEl.textContent = options.title;

    this.canvas = document.createElement("canvas");
    this.canvas.width = 640;
    this.canvas.height = 400;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", options.title);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas unavailable");
    this.ctx = ctx;
    this.stroke = options.stroke ?? this.stroke;
    this.wallZ = options.wallZ;

    host.append(this.titleEl, this.canvas);
    this.bindPointer();
    this.draw();
  }

  setTitle(title: string): void {
    this.titleEl.textContent = title;
    this.canvas.setAttribute("aria-label", title);
  }

  setMesh(mesh: HexMesh, coords?: ArrayLike<number>, wallZ?: number): void {
    this.hexes = mesh.hexes;
    this.coords = coords ?? mesh.coords;
    if (wallZ !== undefined) this.wallZ = wallZ;
    this.fitCamera();
    this.draw();
  }

  clear(): void {
    this.hexes = [];
    this.coords = [];
    this.draw();
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

    // Ground grid hint
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
    ctx.lineWidth = 1.25;
    for (const edge of edges) {
      ctx.beginPath();
      ctx.moveTo(edge.x0, edge.y0);
      ctx.lineTo(edge.x1, edge.y1);
      ctx.stroke();
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
