import { productName, statusLabel, tagline } from "../app.js";
import { solveExplicitAsync } from "../fe/solveAsync.js";
import type { ModelIR, SolveResult } from "../ir/types.js";
import {
  getResearchStockModel,
  metricsPassAcceptance,
  RESEARCH_STOCK_MODELS,
  type ResearchStockModel,
} from "../research/catalog.js";
import { EnergyChart } from "../viz/energyChart.js";
import { MeshCanvas } from "../viz/meshCanvas.js";

export type StageId = "research" | "pre" | "solve" | "post";

interface AppState {
  stock: ResearchStockModel | null;
  model: ModelIR | null;
  result: SolveResult | null;
  stage: StageId;
  solving: boolean;
  statusMessage: string;
}

export function mountWorkbench(root: HTMLElement): void {
  const state: AppState = {
    stock: null,
    model: null,
    result: null,
    stage: "research",
    solving: false,
    statusMessage: "Load a stock model from research to begin.",
  };

  root.replaceChildren();
  root.classList.add("workbench");

  const header = document.createElement("header");
  header.className = "wb-header";

  const status = document.createElement("p");
  status.className = "status";
  status.textContent = statusLabel;

  const heading = document.createElement("h1");
  heading.textContent = productName;

  const lead = document.createElement("p");
  lead.className = "tagline";
  lead.textContent = tagline;

  header.append(status, heading, lead);

  const stageNav = document.createElement("nav");
  stageNav.className = "stage-nav";
  stageNav.setAttribute("aria-label", "Workflow stages");
  const stageButtons = new Map<StageId, HTMLButtonElement>();
  for (const stage of [
    { id: "research" as const, label: "Research" },
    { id: "pre" as const, label: "Pre" },
    { id: "solve" as const, label: "Solve" },
    { id: "post" as const, label: "Post" },
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = stage.label;
    btn.dataset.stage = stage.id;
    btn.addEventListener("click", () => {
      if (stage.id === "pre" && !state.model) return;
      if (stage.id === "solve" && !state.model) return;
      if (stage.id === "post" && !state.result) return;
      state.stage = stage.id;
      render();
    });
    stageButtons.set(stage.id, btn);
    stageNav.append(btn);
  }

  const banner = document.createElement("p");
  banner.className = "wb-banner";
  banner.setAttribute("role", "status");

  const panels = document.createElement("div");
  panels.className = "panels";

  const researchPanel = document.createElement("section");
  researchPanel.className = "panel";
  researchPanel.setAttribute("aria-label", "Research catalog");

  const researchHeading = document.createElement("h2");
  researchHeading.textContent = "Stock models from research";
  const researchHelp = document.createElement("p");
  researchHelp.className = "muted";
  researchHelp.textContent =
    "Layer-1 validation cases from the research notes. Load one into the Model IR for pre → solve → post.";

  const catalog = document.createElement("ul");
  catalog.className = "catalog";
  for (const entry of RESEARCH_STOCK_MODELS) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const summary = document.createElement("p");
    summary.textContent = entry.summary;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${entry.researchPath} · Layer ${String(entry.layer)}`;
    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.textContent = "Load into pre";
    loadBtn.setAttribute("aria-label", `Load ${entry.title}`);
    loadBtn.addEventListener("click", () => {
      const stock = getResearchStockModel(entry.id);
      state.stock = stock;
      state.model = stock.create();
      state.result = null;
      state.stage = "pre";
      state.statusMessage = `Loaded ${stock.title} from research. Inspect the model in Pre.`;
      render();
    });
    li.append(title, summary, meta, loadBtn);
    catalog.append(li);
  }
  researchPanel.append(researchHeading, researchHelp, catalog);

  const prePanel = document.createElement("section");
  prePanel.className = "panel";
  prePanel.setAttribute("aria-label", "Pre-processor");
  const preHeading = document.createElement("h2");
  preHeading.textContent = "Pre — model inspection";
  const preTree = document.createElement("dl");
  preTree.className = "model-tree";
  preTree.setAttribute("aria-label", "Model tree");
  const preVizHost = document.createElement("div");
  preVizHost.className = "viz-host";
  const preMesh = new MeshCanvas(preVizHost, {
    title: "Undeformed mesh",
    stroke: "#4cc2ff",
    wallZ: 0,
  });
  const toSolve = document.createElement("button");
  toSolve.type = "button";
  toSolve.textContent = "Continue to solve";
  toSolve.addEventListener("click", () => {
    if (!state.model) return;
    state.stage = "solve";
    state.statusMessage = "Ready to run the explicit solver.";
    render();
  });
  prePanel.append(preHeading, preTree, preVizHost, toSolve);

  const solvePanel = document.createElement("section");
  solvePanel.className = "panel";
  solvePanel.setAttribute("aria-label", "Solver");
  const solveHeading = document.createElement("h2");
  solveHeading.textContent = "Solve — explicit dynamics";
  const solveHelp = document.createElement("p");
  solveHelp.className = "muted";
  solveHelp.textContent =
    "Central-difference explicit integration with J2 plasticity and rigid-wall contact (Taylor MVP path).";
  const progress = document.createElement("p");
  progress.className = "solve-progress";
  progress.setAttribute("aria-live", "polite");
  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.textContent = "Run solve";
  runBtn.addEventListener("click", () => {
    void runSolve();
  });
  solvePanel.append(solveHeading, solveHelp, progress, runBtn);

  const postPanel = document.createElement("section");
  postPanel.className = "panel";
  postPanel.setAttribute("aria-label", "Post-processor");
  const postHeading = document.createElement("h2");
  postHeading.textContent = "Post — results";
  const metricsEl = document.createElement("dl");
  metricsEl.className = "metrics";
  metricsEl.setAttribute("aria-label", "Solve metrics");
  const gateEl = document.createElement("p");
  gateEl.className = "gate";
  gateEl.setAttribute("role", "status");
  const postVizHost = document.createElement("div");
  postVizHost.className = "viz-host";
  const postMesh = new MeshCanvas(postVizHost, {
    title: "Deformed mesh",
    stroke: "#7ee787",
    wallZ: 0,
  });
  const chartHost = document.createElement("div");
  chartHost.className = "viz-host";
  const energyChart = new EnergyChart(chartHost);
  postPanel.append(postHeading, gateEl, metricsEl, postVizHost, chartHost);

  panels.append(researchPanel, prePanel, solvePanel, postPanel);
  root.append(header, stageNav, banner, panels);

  async function runSolve(): Promise<void> {
    if (!state.model || state.solving) return;
    state.solving = true;
    state.stage = "solve";
    state.statusMessage = "Solving…";
    render();
    try {
      const result = await solveExplicitAsync(state.model, {
        onProgress: ({ t, endTime, step }) => {
          progress.textContent =
            step === 0
              ? "Starting explicit integrate…"
              : `t = ${(t * 1e6).toFixed(1)} / ${(endTime * 1e6).toFixed(1)} µs · ${String(step)} steps`;
        },
      });
      state.result = result;
      state.stage = "post";
      state.statusMessage = "Solve complete. Inspect deformed mesh and energy history in Post.";
    } catch (err) {
      const message = err instanceof Error ? err.message : "solve failed";
      state.statusMessage = `Solve failed: ${message}`;
      progress.textContent = state.statusMessage;
    } finally {
      state.solving = false;
      render();
    }
  }

  function render(): void {
    banner.textContent = state.statusMessage;

    for (const [id, btn] of stageButtons) {
      const enabled =
        id === "research" ||
        (id === "pre" && state.model !== null) ||
        (id === "solve" && state.model !== null) ||
        (id === "post" && state.result !== null);
      btn.disabled = !enabled;
      btn.setAttribute("aria-current", id === state.stage ? "step" : "false");
      btn.classList.toggle("active", id === state.stage);
    }

    researchPanel.hidden = state.stage !== "research";
    prePanel.hidden = state.stage !== "pre";
    solvePanel.hidden = state.stage !== "solve";
    postPanel.hidden = state.stage !== "post";

    runBtn.disabled = state.solving || state.model === null;
    runBtn.textContent = state.solving ? "Solving…" : "Run solve";

    if (state.model) {
      fillModelTree(preTree, state.model, state.stock);
      preMesh.setMesh(state.model.mesh, state.model.mesh.coords, state.model.wall.point[2]);
    } else {
      preTree.replaceChildren();
      preMesh.clear();
    }

    if (state.result && state.model) {
      fillMetrics(metricsEl, state.result, state.stock);
      const pass =
        state.stock !== null &&
        metricsPassAcceptance(state.result.metrics, state.stock.acceptance);
      gateEl.textContent = pass
        ? "Acceptance gate: PASS (within research Layer-1 bands)"
        : state.stock
          ? "Acceptance gate: outside published bands (inspect metrics)"
          : "Acceptance gate: n/a";
      gateEl.classList.toggle("pass", pass);
      gateEl.classList.toggle("fail", state.stock !== null && !pass);
      postMesh.setMesh(state.model.mesh, state.result.coords, state.model.wall.point[2]);
      energyChart.setSamples(state.result.history);
      if (!state.solving) {
        progress.textContent = `Finished in ${state.result.metrics.elapsedMs.toFixed(0)} ms · ${String(state.result.metrics.nSteps)} steps`;
      }
    } else {
      metricsEl.replaceChildren();
      gateEl.textContent = "";
      postMesh.clear();
      energyChart.clear();
      if (!state.solving) progress.textContent = state.model ? "Idle — press Run solve." : "";
    }
  }

  render();
}

function fillModelTree(
  dl: HTMLDListElement,
  model: ModelIR,
  stock: ResearchStockModel | null,
): void {
  const nNodes = model.mesh.coords.length / 3;
  const nHex = model.mesh.hexes.length / 8;
  const rows: [string, string][] = [
    ["Name", model.meta.name],
    ["Source", stock ? `${stock.researchPath} (Layer ${String(stock.layer)})` : "local"],
    ["Description", model.meta.description ?? "—"],
    ["Nodes", String(nNodes)],
    ["Hex elements", String(nHex)],
    ["Material", `J2 ρ=${model.material.density} E=${model.material.young} σy=${model.material.yieldStress}`],
    ["Wall", `n=(${model.wall.normal.join(",")}) at z=${String(model.wall.point[2])}`],
    ["Initial velocity", `${String(model.initialVelocity[2])} m/s (z)`],
    ["End time", `${String(model.controls.endTime * 1e6)} µs`],
    ["L₀ / R₀", `${String(model.reference.length0 * 1e3)} / ${String(model.reference.radius0 * 1e3)} mm`],
  ];
  dl.replaceChildren();
  for (const [dt, dd] of rows) {
    const t = document.createElement("dt");
    t.textContent = dt;
    const d = document.createElement("dd");
    d.textContent = dd;
    dl.append(t, d);
  }
}

function fillMetrics(
  dl: HTMLDListElement,
  result: SolveResult,
  stock: ResearchStockModel | null,
): void {
  const m = result.metrics;
  const rows: [string, string][] = [
    ["Lf / L₀", m.lengthRatio.toFixed(4)],
    ["Rf / R₀", m.radiusRatio.toFixed(4)],
    ["Energy error %", m.energyErrorPct.toFixed(4)],
    ["Steps", String(m.nSteps)],
    ["Wall clock", `${m.elapsedMs.toFixed(1)} ms`],
    ["History samples", String(result.history.length)],
  ];
  if (stock) {
    rows.push([
      "Band Lf/L₀",
      `[${String(stock.acceptance.lengthRatio.min)}, ${String(stock.acceptance.lengthRatio.max)}]`,
    ]);
    rows.push([
      "Band Rf/R₀",
      `[${String(stock.acceptance.radiusRatio.min)}, ${String(stock.acceptance.radiusRatio.max)}]`,
    ]);
  }
  dl.replaceChildren();
  for (const [dt, dd] of rows) {
    const t = document.createElement("dt");
    t.textContent = dt;
    const d = document.createElement("dd");
    d.textContent = dd;
    dl.append(t, d);
  }
}
