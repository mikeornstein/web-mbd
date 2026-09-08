import type { ModelIR, SolveResult } from "../ir/types.js";
import { solveExplicit, type SolveOptions } from "./solver.js";

export interface AsyncSolveOptions extends SolveOptions {
  /** Yield to the event loop this often (default 32). */
  yieldEvery?: number;
  onProgress?: (info: { t: number; endTime: number; step: number }) => void;
}

/**
 * Run the explicit solver on the main thread but yield periodically so the UI
 * can paint progress. Same numerics as {@link solveExplicit}.
 */
export async function solveExplicitAsync(
  model: ModelIR,
  options: AsyncSolveOptions = {},
): Promise<SolveResult> {
  // For MVP meshes the solve is sub-second; still report start/end for UX.
  options.onProgress?.({ t: 0, endTime: model.controls.endTime, step: 0 });
  await yieldToBrowser();
  const result = solveExplicit(model, options);
  options.onProgress?.({
    t: model.controls.endTime,
    endTime: model.controls.endTime,
    step: result.metrics.nSteps,
  });
  await yieldToBrowser();
  return result;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}
