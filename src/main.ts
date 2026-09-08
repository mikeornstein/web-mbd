import "./style.css";
import { detectCapabilities, type Capability } from "./capabilities";
import { createChain, step, type ChainParams } from "./solver/chain";

function renderCapabilities(caps: Capability[]): void {
  const list = document.querySelector<HTMLUListElement>("#capabilities");
  if (!list) return;
  list.innerHTML = "";
  for (const cap of caps) {
    const li = document.createElement("li");
    li.className = "cap";
    li.innerHTML = `
      <div class="cap-row">
        <span class="dot ${cap.available ? "ok" : "bad"}"></span>
        <span class="cap-label">${cap.label}</span>
      </div>
      <p class="cap-detail">${cap.detail}</p>
    `;
    list.appendChild(li);
  }
}

function startSimulation(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene");
  const status = document.querySelector<HTMLSpanElement>("#sim-status");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const params: ChainParams = {
    nodeCount: 14,
    mass: 1,
    stiffness: 900,
    restLength: 0.5,
    gravity: 9.81,
    damping: 0.02,
  };
  const state = createChain(params, 0, 0);

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  const dt = 1 / 600; // sub-step for stiff springs
  const subSteps = 6;
  let swing = 0;
  let frames = 0;

  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // Gently drive the pinned node so the chain visibly swings.
    swing += 0.02;
    state.positions[0] = Math.sin(swing) * 0.8;
    state.positions[1] = 0;
    for (let s = 0; s < subSteps; s++) step(state, params, dt);

    ctx.clearRect(0, 0, w, h);

    const scale = 42;
    const ox = w / 2;
    const oy = 60;
    const px = (i: number) => ox + state.positions[i * 2] * scale;
    const py = (i: number) => oy + state.positions[i * 2 + 1] * scale;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#4cc2ff";
    ctx.beginPath();
    for (let i = 0; i < params.nodeCount; i++) {
      const x = px(i);
      const y = py(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (let i = 0; i < params.nodeCount; i++) {
      const x = px(i);
      const y = py(i);
      ctx.beginPath();
      ctx.arc(x, y, i === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#a389ff" : "#e6edf3";
      ctx.fill();
    }

    frames++;
    if (status && frames === 1) status.textContent = "running";
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

async function main(): Promise<void> {
  startSimulation();
  const caps = await detectCapabilities();
  renderCapabilities(caps);
}

void main();
