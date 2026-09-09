import type { EnergySample } from "../ir/types.js";

export class EnergyChart {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private samples: EnergySample[] = [];
  private cursorIndex = -1;
  private readonly titleEl: HTMLElement;

  constructor(host: HTMLElement) {
    this.titleEl = document.createElement("h3");
    this.titleEl.textContent = "Energy history";

    this.canvas = document.createElement("canvas");
    this.canvas.width = 640;
    this.canvas.height = 220;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Energy history");

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas unavailable");
    this.ctx = ctx;

    host.append(this.titleEl, this.canvas);
    this.draw();
  }

  setSamples(samples: EnergySample[]): void {
    this.samples = samples;
    if (this.cursorIndex >= samples.length) this.cursorIndex = samples.length - 1;
    this.draw();
  }

  setCursorIndex(index: number): void {
    this.cursorIndex = index;
    this.draw();
  }

  clear(): void {
    this.samples = [];
    this.cursorIndex = -1;
    this.draw();
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const pad = { l: 48, r: 16, t: 16, b: 28 };
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);

    if (this.samples.length < 2) {
      ctx.fillStyle = "#9aa7b5";
      ctx.font = "14px IBM Plex Sans, sans-serif";
      ctx.fillText("Solve to plot kinetic / internal / contact energy", 24, h / 2);
      return;
    }

    let tMax = 0;
    let eMax = 0;
    for (const s of this.samples) {
      tMax = Math.max(tMax, s.t);
      eMax = Math.max(eMax, s.kinetic, s.internal, s.contact, Math.abs(s.total));
    }
    tMax = Math.max(tMax, 1e-12);
    eMax = Math.max(eMax, 1e-12);

    const xOf = (t: number) => pad.l + ((w - pad.l - pad.r) * t) / tMax;
    const yOf = (e: number) => pad.t + (h - pad.t - pad.b) * (1 - e / eMax);

    ctx.strokeStyle = "#243041";
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();

    const series: { key: keyof EnergySample; color: string; label: string }[] = [
      { key: "kinetic", color: "#4cc2ff", label: "KE" },
      { key: "internal", color: "#7ee787", label: "IE" },
      { key: "contact", color: "#ff7850", label: "Contact" },
      { key: "total", color: "#e6edf3", label: "Total" },
    ];

    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      this.samples.forEach((sample, i) => {
        const value = sample[s.key];
        if (typeof value !== "number") return;
        const x = xOf(sample.t);
        const y = yOf(Math.max(0, value));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    const cursor = this.samples[this.cursorIndex];
    if (cursor) {
      const cx = xOf(cursor.t);
      ctx.strokeStyle = "#e6edf3";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, pad.t);
      ctx.lineTo(cx, h - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e6edf3";
      ctx.beginPath();
      ctx.moveTo(cx, pad.t);
      ctx.lineTo(cx - 4, pad.t - 6);
      ctx.lineTo(cx + 4, pad.t - 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#9aa7b5";
    ctx.font = "12px IBM Plex Sans, sans-serif";
    ctx.fillText("t (s)", w / 2, h - 8);
    ctx.fillText("E (J)", 8, pad.t + 8);

    let legendX = pad.l;
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(legendX, 6, 10, 10);
      ctx.fillStyle = "#9aa7b5";
      ctx.fillText(s.label, legendX + 14, 15);
      legendX += 70;
    }
  }
}
