import { productName, statusLabel, tagline } from "../app.js";
import { solveInflate } from "../fe/inflateSolver.js";
import { solveExplicitAsync } from "../fe/solveAsync.js";
import type { InflateModelIR, InflateSolveResult } from "../inflate/types.js";
import type { EnergySample, ModelIR, SolveResult } from "../ir/types.js";
import { compareInflateToGolden, toySamplesFromSolve } from "../oracle/compareInflate.js";
import { stretchDiagnosticsPageText } from "../oracle/stretchDiagnosticResults.js";
import { loadInflateGolden } from "../oracle/inflateGolden.js";
import {
  getResearchStockModel,
  metricsPassAcceptance,
  pageCatalogModels,
  type InflateStockModel,
  type ResearchStockModel,
  type TaylorStockModel,
} from "../research/catalog.js";
import { EnergyChart } from "../viz/energyChart.js";
import { MeshCanvas, type MeshDrawMode } from "../viz/meshCanvas.js";

export type StageId = "research" | "pre" | "solve" | "post";

type LoadedSession =
  | { kind: "none" }
  | {
      kind: "taylor";
      stock: TaylorStockModel;
      model: ModelIR;
      result: SolveResult | null;
    }
  | {
      kind: "inflate";
      stock: InflateStockModel;
      model: InflateModelIR;
      result: InflateSolveResult | null;
    };

interface AppState {
  loaded: LoadedSession;
  stage: StageId;
  solving: boolean;
  statusMessage: string;
  drawMode: MeshDrawMode;
  postFrame: number;
}

interface HistoryBundle {
  history: EnergySample[];
  meshHistory: Float64Array[];
}

export function mountWorkbench(root: HTMLElement): void {
  const state: AppState = {
    loaded: { kind: "none" },
    stage: "research",
    solving: false,
    statusMessage: "Letter A inflate is the only validated letter and is loaded by default.",
    drawMode: "both",
    postFrame: 0,
  };

  let boundPreKey: object | null = null;
  let boundPostKey: object | null = null;

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
      if (stage.id === "pre" && state.loaded.kind === "none") return;
      if (stage.id === "solve" && state.loaded.kind === "none") return;
      if (stage.id === "post" && !hasResult(state.loaded)) return;
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
    "Letter A inflate is the only validated inflate letter (open Radioss fast-load reference on a consistently outward-oriented mesh, at first stretch ≥ 2). Stretch is validated at the 16 ms freeze and lags the decks earlier in the run. Letter B is an unvalidated demo, unstable past stretch 2 (first stretch ≥ 2 at 4.4, past the warn line; no Radioss tape). Its source mesh has 404 of 2178 triangles wound against their neighbors. Letter C is hidden: degenerate / unstable. Its source mesh has 412 of 1972 triangles wound against their neighbors. The Inflation ABC refine ladder (coarse, fine, finer) inherits the old winding unless fixed. Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.";

  const catalog = document.createElement("ul");
  catalog.className = "catalog";

  const loadStock = (stock: ResearchStockModel): void => {
    switch (stock.kind) {
      case "taylor-j2-hex":
        state.loaded = { kind: "taylor", stock, model: stock.create(), result: null };
        break;
      case "inflate-nh-membrane":
        state.loaded = { kind: "inflate", stock, model: stock.create(), result: null };
        break;
      default: {
        const _exhaustive: never = stock;
        throw new Error(`unhandled stock ${String(_exhaustive)}`);
      }
    }
    state.postFrame = 0;
    boundPreKey = null;
    boundPostKey = null;
    state.drawMode = "both";
    state.stage = "pre";
    state.statusMessage = `Loaded ${stock.title} from research. Inspect the model in Pre.`;
  };

  for (const entry of pageCatalogModels()) {
    const li = document.createElement("li");
    if (entry.id === "inflate-a-desmopan") {
      li.classList.add("featured");
      li.setAttribute("aria-current", "true");
    }
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const badge = document.createElement("p");
    badge.className = "catalog-badge";
    if (entry.kind === "inflate-nh-membrane") {
      switch (entry.validation) {
        case "radioss-dynamic-golden":
          badge.textContent = "Validated letter · selected by default";
          break;
        case "unvalidated-demo":
          badge.classList.add("warn");
          badge.textContent = "Unvalidated demo, unstable past stretch 2";
          break;
        case "unvalidated-demo-unstable":
          badge.classList.add("warn");
          badge.textContent = "Unvalidated demo, unstable";
          break;
        default: {
          const _exhaustive: never = entry.validation;
          throw new Error(`unhandled validation ${String(_exhaustive)}`);
        }
      }
    } else {
      badge.textContent = "Layer-1 Taylor gate";
    }
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
      loadStock(getResearchStockModel(entry.id));
      render();
    });
    li.append(title, badge, summary, meta, loadBtn);
    catalog.append(li);
  }
  researchPanel.append(researchHeading, researchHelp, catalog, createStretchDiagSection());

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
    fill: "#4cc2ff",
    drawMode: "both",
  });

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
  const warnEl = document.createElement("p");
  warnEl.className = "warn-mark";
  warnEl.setAttribute("role", "status");
  warnEl.hidden = true;
  const postVizHost = document.createElement("div");
  postVizHost.className = "viz-host";
  const postMesh = new MeshCanvas(postVizHost, {
    title: "Deformed mesh",
    stroke: "#7ee787",
    fill: "#7ee787",
    drawMode: "both",
  });
  const chartHost = document.createElement("div");
  chartHost.className = "viz-host";
  const energyChart = new EnergyChart(chartHost);

  const applyDrawMode = (mode: MeshDrawMode): void => {
    state.drawMode = mode;
    preMesh.setDrawMode(mode);
    postMesh.setDrawMode(mode);
    preShading.sync(mode);
    postShading.sync(mode);
  };
  const preShading = createDrawModeControl("mesh-shading-pre", applyDrawMode);
  const postShading = createDrawModeControl("mesh-shading-post", applyDrawMode);
  preShading.sync(state.drawMode);
  postShading.sync(state.drawMode);

  const toSolve = document.createElement("button");
  toSolve.type = "button";
  toSolve.textContent = "Continue to solve";
  toSolve.addEventListener("click", () => {
    if (state.loaded.kind === "none") return;
    state.stage = "solve";
    state.statusMessage = "Ready to run the explicit solver.";
    render();
  });
  prePanel.append(preHeading, preTree, preShading.root, preVizHost, toSolve, createStretchDiagSection());

  const solvePanel = document.createElement("section");
  solvePanel.className = "panel";
  solvePanel.setAttribute("aria-label", "Solver");
  const solveHeading = document.createElement("h2");
  solveHeading.textContent = "Solve — explicit dynamics";
  const solveHelp = document.createElement("p");
  solveHelp.className = "muted";
  solveHelp.textContent =
    "Central-difference explicit integration. Taylor: J2 hex + rigid wall. Inflate: neo-Hookean membrane + labeled pressure load (open Radioss offline golden on letter A, fast-load only, consistently outward-oriented mesh).";
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

  const scrubber = createTimeScrubber((index) => {
    state.postFrame = index;
    applyPostFrame();
  });
  postPanel.append(
    postHeading,
    gateEl,
    warnEl,
    metricsEl,
    postShading.root,
    postVizHost,
    scrubber.root,
    chartHost,
    createStretchDiagSection(),
  );

  panels.append(researchPanel, prePanel, solvePanel, postPanel);
  root.append(header, stageNav, banner, panels);

  async function runSolve(): Promise<void> {
    if (state.loaded.kind === "none" || state.solving) return;
    state.solving = true;
    state.stage = "solve";
    state.statusMessage = "Solving…";
    render();
    try {
      const loaded = state.loaded;
      switch (loaded.kind) {
        case "taylor": {
          const result = await solveExplicitAsync(loaded.model, {
            onProgress: ({ t, endTime, step }) => {
              progress.textContent =
                step === 0
                  ? "Starting explicit integrate…"
                  : `t = ${(t * 1e6).toFixed(1)} / ${(endTime * 1e6).toFixed(1)} µs · ${String(step)} steps`;
            },
          });
          state.loaded = { ...loaded, result };
          state.postFrame = Math.max(0, result.meshHistory.length - 1);
          break;
        }
        case "inflate": {
          await yieldToBrowser();
          progress.textContent = "Starting neo-Hookean inflate…";
          const result = solveInflate(loaded.model, {
            maxWallMs: 600_000,
            onProgress: ({ t, endTime, step, lambdaMax }) => {
              progress.textContent = `t = ${(t * 1e3).toFixed(1)} / ${(endTime * 1e3).toFixed(1)} ms · λ_max=${lambdaMax.toFixed(3)} · ${String(step)} steps`;
            },
          });
          state.loaded = { ...loaded, result };
          const warnIdx = result.metrics.warn?.frame;
          state.postFrame =
            warnIdx !== undefined ? warnIdx : Math.max(0, result.meshHistory.length - 1);
          break;
        }
        default: {
          const _exhaustive: never = loaded;
          throw new Error(`unhandled session ${String(_exhaustive)}`);
        }
      }
      boundPostKey = null;
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

  function applyPostFrame(): void {
    const loaded = state.loaded;
    if (loaded.kind === "none" || loaded.result === null) return;
    const result = loaded.result;
    const last = result.meshHistory.length - 1;
    const idx = Math.min(Math.max(0, state.postFrame), Math.max(0, last));
    const coords = result.meshHistory[idx] ?? result.coords;
    if (boundPostKey !== result) {
      bindPostMesh(loaded, coords);
      boundPostKey = result;
      energyChart.setSamples(result.history);
    } else {
      postMesh.setCoords(coords);
    }
    postMesh.setDrawMode(state.drawMode);
    if (loaded.kind === "inflate") {
      const lam = loaded.result.lambdaHistory[idx] ?? 1;
      postMesh.setWarnLabel(lam >= loaded.model.law.warnLam ? "WARN  first stretch ≥ 2" : null);
    } else {
      postMesh.setWarnLabel(null);
    }
    energyChart.setCursorIndex(idx);
    scrubber.sync(idx, result);
  }

  function bindPostMesh(loaded: Exclude<LoadedSession, { kind: "none" }>, coords: ArrayLike<number>): void {
    switch (loaded.kind) {
      case "taylor":
        postMesh.setMesh(loaded.model.mesh, coords, loaded.model.wall.point[2]);
        break;
      case "inflate":
        postMesh.setQuadMesh(loaded.model.mesh.quads, coords, loaded.model.mesh.coords, loaded.model.mesh.tris);
        break;
      default: {
        const _exhaustive: never = loaded;
        throw new Error(`unhandled session ${String(_exhaustive)}`);
      }
    }
  }

  function render(): void {
    banner.textContent = state.statusMessage;

    for (const [id, btn] of stageButtons) {
      const enabled =
        id === "research" ||
        (id === "pre" && state.loaded.kind !== "none") ||
        (id === "solve" && state.loaded.kind !== "none") ||
        (id === "post" && hasResult(state.loaded));
      btn.disabled = !enabled;
      btn.setAttribute("aria-current", id === state.stage ? "step" : "false");
      btn.classList.toggle("active", id === state.stage);
    }

    researchPanel.hidden = state.stage !== "research";
    prePanel.hidden = state.stage !== "pre";
    solvePanel.hidden = state.stage !== "solve";
    postPanel.hidden = state.stage !== "post";

    runBtn.disabled = state.solving || state.loaded.kind === "none";
    runBtn.textContent = state.solving ? "Solving…" : "Run solve";

    if (state.loaded.kind !== "none") {
      fillModelTree(preTree, state.loaded, state.drawMode);
      if (boundPreKey !== state.loaded.model) {
        switch (state.loaded.kind) {
          case "taylor":
            preMesh.setMesh(state.loaded.model.mesh, state.loaded.model.mesh.coords, state.loaded.model.wall.point[2]);
            break;
          case "inflate":
            preMesh.setQuadMesh(
              state.loaded.model.mesh.quads,
              state.loaded.model.mesh.coords,
              state.loaded.model.mesh.coords,
              state.loaded.model.mesh.tris,
            );
            break;
          default: {
            const _exhaustive: never = state.loaded;
            throw new Error(`unhandled session ${String(_exhaustive)}`);
          }
        }
        boundPreKey = state.loaded.model;
      }
      preMesh.setDrawMode(state.drawMode);
      preMesh.setWarnLabel(null);
    } else {
      preTree.replaceChildren();
      preMesh.clear();
      boundPreKey = null;
    }

    if (state.loaded.kind !== "none" && state.loaded.result) {
      fillMetrics(metricsEl, state.loaded);
      fillGate(gateEl, state.loaded);
      fillWarnMark(warnEl, state.loaded);
      applyPostFrame();
      if (!state.solving) {
        const nSteps =
          state.loaded.kind === "taylor"
            ? state.loaded.result.metrics.nSteps
            : state.loaded.result.metrics.nSteps;
        const elapsed =
          state.loaded.kind === "taylor"
            ? state.loaded.result.metrics.elapsedMs
            : state.loaded.result.metrics.elapsedMs;
        progress.textContent = `Finished in ${elapsed.toFixed(0)} ms · ${String(nSteps)} steps`;
      }
    } else {
      metricsEl.replaceChildren();
      gateEl.textContent = "";
      warnEl.hidden = true;
      warnEl.textContent = "";
      postMesh.clear();
      energyChart.clear();
      boundPostKey = null;
      scrubber.clear();
      if (!state.solving) progress.textContent = state.loaded.kind !== "none" ? "Idle — press Run solve." : "";
    }
  }

  const defaultStock = getResearchStockModel("inflate-a-desmopan");
  loadStock(defaultStock);
  state.statusMessage =
    "Letter A inflate is the only validated letter and is loaded by default. Inspect the model in Pre.";
  render();
}

function hasResult(loaded: LoadedSession): boolean {
  return loaded.kind !== "none" && loaded.result !== null;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

const DRAW_MODES: { id: MeshDrawMode; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "wire", label: "Wire" },
  { id: "both", label: "Both" },
];

function createDrawModeControl(
  groupName: string,
  onChange: (mode: MeshDrawMode) => void,
): { root: HTMLFieldSetElement; sync: (mode: MeshDrawMode) => void } {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "mesh-shading";
  const legend = document.createElement("legend");
  legend.textContent = "Mesh shading";
  const options = document.createElement("div");
  options.className = "mesh-shading-options";
  const inputs: HTMLInputElement[] = [];
  for (const mode of DRAW_MODES) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = groupName;
    input.value = mode.id;
    input.addEventListener("change", () => {
      if (input.checked) onChange(mode.id);
    });
    inputs.push(input);
    label.append(input, document.createTextNode(mode.label));
    options.append(label);
  }
  fieldset.append(legend, options);
  return {
    root: fieldset,
    sync(mode) {
      for (const input of inputs) input.checked = input.value === mode;
    },
  };
}

function createTimeScrubber(onIndex: (index: number) => void): {
  root: HTMLElement;
  sync: (index: number, result: HistoryBundle) => void;
  clear: () => void;
} {
  const root = document.createElement("div");
  root.className = "time-scrubber";
  const label = document.createElement("label");
  label.textContent = "Time step";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "0";
  slider.value = "0";
  slider.step = "1";
  slider.setAttribute("aria-label", "Time step");
  slider.disabled = true;
  label.htmlFor = "time-step-slider";
  slider.id = "time-step-slider";
  const readout = document.createElement("output");
  readout.setAttribute("for", "time-step-slider");
  readout.setAttribute("aria-live", "polite");
  readout.textContent = "No history yet";
  slider.addEventListener("input", () => {
    onIndex(Number(slider.value));
  });
  root.append(label, slider, readout);
  return {
    root,
    sync(index, result) {
      const max = Math.max(0, result.meshHistory.length - 1);
      slider.disabled = result.meshHistory.length < 2;
      slider.max = String(max);
      slider.value = String(index);
      const sample = result.history[index];
      const tUs = sample === undefined ? 0 : sample.t * 1e6;
      const text = `index ${String(index)} / ${String(max)} · t = ${tUs.toFixed(1)} µs`;
      readout.textContent = text;
      slider.setAttribute("aria-valuetext", text);
    },
    clear() {
      slider.disabled = true;
      slider.max = "0";
      slider.value = "0";
      readout.textContent = "No history yet";
      slider.removeAttribute("aria-valuetext");
    },
  };
}

function createStretchDiagSection(): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = "diag-block";
  wrap.setAttribute("aria-label", "Letter A stretch diagnostics");
  const heading = document.createElement("h3");
  heading.textContent = "Letter A stretch diagnostics (measurement, not a gate)";
  const copy = stretchDiagnosticsPageText();
  const rules = document.createElement("pre");
  rules.textContent = copy.rules;
  const results = document.createElement("pre");
  results.textContent = copy.results;
  wrap.append(heading, rules, results);
  return wrap;
}

function validationLabel(status: InflateStockModel["validation"]): string {
  switch (status) {
    case "radioss-dynamic-golden":
      return "fast-load (dynamic) open Radioss reference on a consistently outward-oriented mesh only · stretch is validated at the 16 ms freeze and lags the decks earlier in the run · volume ≤5% · pressure ≤5%. Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.";
    case "unvalidated-demo":
      return "unvalidated demo, unstable past stretch 2 · source mesh 404 of 2178 triangles wound against neighbors · open Radioss golden NOT-YET. The Inflation ABC refine ladder inherits the old winding unless fixed. Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.";
    case "unvalidated-demo-unstable":
      return "unvalidated demo, unstable · not listed on the page · source mesh 412 of 1972 triangles wound against neighbors. The Inflation ABC refine ladder inherits the old winding unless fixed. Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.";
    default: {
      const _exhaustive: never = status;
      throw new Error(`unhandled validation ${String(_exhaustive)}`);
    }
  }
}

function viewCaption(mode: MeshDrawMode): string {
  switch (mode) {
    case "solid":
      return "solid fill only (mesh edges off)";
    case "wire":
      return "mesh edges only";
    case "both":
      return "mesh edges default ON";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function fillModelTree(
  dl: HTMLDListElement,
  loaded: Exclude<LoadedSession, { kind: "none" }>,
  drawMode: MeshDrawMode,
): void {
  const rows: [string, string][] = [];
  switch (loaded.kind) {
    case "taylor": {
      const model = loaded.model;
      const nNodes = model.mesh.coords.length / 3;
      const nHex = model.mesh.hexes.length / 8;
      rows.push(
        ["Name", model.meta.name],
        ["Source", `${loaded.stock.researchPath} (Layer ${String(loaded.stock.layer)})`],
        ["Description", model.meta.description ?? "—"],
        ["Nodes", String(nNodes)],
        ["Hex elements", String(nHex)],
        ["Material", `J2 ρ=${model.material.density} E=${model.material.young} σy=${model.material.yieldStress}`],
        ["Wall", `n=(${model.wall.normal.join(",")}) at z=${String(model.wall.point[2])}`],
        ["Initial velocity", `${String(model.initialVelocity[2])} m/s (z)`],
        ["End time", `${String(model.controls.endTime * 1e6)} µs`],
        ["L₀ / R₀", `${String(model.reference.length0 * 1e3)} / ${String(model.reference.radius0 * 1e3)} mm`],
      );
      break;
    }
    case "inflate": {
      const model = loaded.model;
      rows.push(
        ["Name", model.meta.name],
        ["Source", `${loaded.stock.researchPath} (Layer ${String(loaded.stock.layer)})`],
        ["Description", model.meta.description ?? "—"],
        ["Nodes", String(model.mesh.nNodes)],
        ["Shell quads", String(model.mesh.nQuads)],
        ["Mesh fingerprint", model.mesh.fingerprint],
        ["Ogden one-term neo-Hookean", `μ₁=${model.law.mu1.toExponential(6)} Pa · α₁=${model.law.alpha1} · H0=${(model.law.h0 * 1e3).toFixed(3)} mm · ρ=${model.law.rho} kg/m³`],
        ["Load family", model.law.loadFamily],
        [
          "Pressure load",
          `0 → ${model.law.pMax} Pa in ${model.law.tRamp} s (fast-load / dynamic; not the Inflation ABC ~54 kPa figure). Slow-load (quasi-static) is not validated.`,
        ],
        [
          "Kiss",
          `TYPE19-class Gapmin=${(model.law.gapMin * 1e3).toFixed(3)} mm node-node (not bitwise TYPE19)`,
        ],
        ["Warn", `first λ_max ≥ ${model.law.warnLam}`],
        ["View", viewCaption(drawMode)],
        ["Validation", validationLabel(loaded.stock.validation)],
        ["Letter", model.mesh.letter],
        ["Leftover constant-strain triangles", String(model.mesh.nTris)],
      );
      break;
    }
    default: {
      const _exhaustive: never = loaded;
      throw new Error(`unhandled session ${String(_exhaustive)}`);
    }
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

function fillMetrics(dl: HTMLDListElement, loaded: Exclude<LoadedSession, { kind: "none" }>): void {
  if (loaded.result === null) return;
  const rows: [string, string][] = [];
  switch (loaded.kind) {
    case "taylor": {
      const m = loaded.result.metrics;
      rows.push(
        ["Lf / L₀", m.lengthRatio.toFixed(4)],
        ["Rf / R₀", m.radiusRatio.toFixed(4)],
        ["Axial shortening", `${(m.axialShortening * 1e3).toFixed(2)} mm`],
        ["Max |u|", `${(m.maxDisplacement * 1e3).toFixed(2)} mm`],
        ["Max eq. plastic strain", m.maxEqPlasticStrain.toFixed(4)],
        ["Energy error %", m.energyErrorPct.toFixed(4)],
        ["Steps", String(m.nSteps)],
        ["Wall clock", `${m.elapsedMs.toFixed(1)} ms`],
        ["History samples", String(loaded.result.history.length)],
        ["Band Lf/L₀", `[${String(loaded.stock.acceptance.lengthRatio.min)}, ${String(loaded.stock.acceptance.lengthRatio.max)}]`],
        ["Band Rf/R₀", `[${String(loaded.stock.acceptance.radiusRatio.min)}, ${String(loaded.stock.acceptance.radiusRatio.max)}]`],
      );
      break;
    }
    case "inflate": {
      const m = loaded.result.metrics;
      const w = m.warn;
      rows.push(
        ["Load family", m.loadFamily],
        ["λ_max", m.lambdaMax.toFixed(4)],
        ["p", `${m.p.toFixed(0)} Pa`],
        ["V", `${m.volume_mL.toFixed(1)} mL`],
        ["Ψ", `${m.psi_J.toFixed(3)} J`],
        ["Warn mark", w ? `frame ${w.frame} · t=${(w.t * 1e3).toFixed(1)} ms · λ=${w.lambdaMax.toFixed(3)}` : "λ never ≥ 2"],
        ["Punch-through", m.punchedThrough ? "yes" : "no"],
        ["Min gap", `${(m.minGap * 1e3).toFixed(3)} mm`],
        ["Contact viol", String(m.contactViol)],
        ["Contact class", m.contactClass],
        ["Steps", String(m.nSteps)],
        ["Wall clock", `${m.elapsedMs.toFixed(1)} ms`],
        ["open Radioss reference", validationLabel(loaded.stock.validation)],
      );
      break;
    }
    default: {
      const _exhaustive: never = loaded;
      throw new Error(`unhandled session ${String(_exhaustive)}`);
    }
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

function fillWarnMark(el: HTMLParagraphElement, loaded: Exclude<LoadedSession, { kind: "none" }>): void {
  if (loaded.kind === "inflate" && loaded.result?.metrics.warn) {
    el.hidden = false;
    el.textContent = "WARN  first stretch ≥ 2";
    return;
  }
  el.hidden = true;
  el.textContent = "";
}

function fillGate(gateEl: HTMLParagraphElement, loaded: Exclude<LoadedSession, { kind: "none" }>): void {
  if (loaded.result === null) {
    gateEl.textContent = "";
    return;
  }
  switch (loaded.kind) {
    case "taylor": {
      const pass = metricsPassAcceptance(loaded.result.metrics, loaded.stock.acceptance);
      gateEl.textContent = pass
        ? "Acceptance gate: PASS (within research Layer-1 bands)"
        : "Acceptance gate: outside published bands (inspect metrics)";
      gateEl.classList.toggle("pass", pass);
      gateEl.classList.toggle("fail", !pass);
      break;
    }
    case "inflate": {
      switch (loaded.stock.validation) {
        case "radioss-dynamic-golden": {
          const golden = loadInflateGolden();
          const cmp = compareInflateToGolden(
            {
              ...loaded.result.metrics,
              law: loaded.result.law,
              samples: toySamplesFromSolve(loaded.result),
            },
            golden,
          );
          gateEl.textContent = cmp.ok
            ? "Acceptance gate: PASS (open Radioss fast-load / dynamic reference on a consistently outward-oriented mesh · stretch / volume / pressure bands). Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed."
            : `Acceptance gate: FAIL vs open Radioss fast-load golden (${cmp.reasons[0] ?? "see compare:inflate"}). Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.`;
          gateEl.classList.toggle("pass", cmp.ok);
          gateEl.classList.toggle("fail", !cmp.ok);
          break;
        }
        case "unvalidated-demo":
          gateEl.textContent =
            "Acceptance gate: NOT-YET (unvalidated demo, unstable past stretch 2; no open Radioss tape for this letter; source mesh 404 of 2178 triangles wound against neighbors). Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.";
          gateEl.classList.remove("pass");
          gateEl.classList.add("fail");
          break;
        case "unvalidated-demo-unstable":
          gateEl.textContent =
            "Acceptance gate: NOT-YET (unvalidated demo, unstable; no open Radioss tape for this letter; source mesh 412 of 1972 triangles wound against neighbors). Slow-load (quasi-static) is not validated. The Inflation ABC ~54 kPa figure is not claimed.";
          gateEl.classList.remove("pass");
          gateEl.classList.add("fail");
          break;
        default: {
          const _exhaustive: never = loaded.stock.validation;
          throw new Error(`unhandled validation ${String(_exhaustive)}`);
        }
      }
      break;
    }
    default: {
      const _exhaustive: never = loaded;
      throw new Error(`unhandled session ${String(_exhaustive)}`);
    }
  }
}
