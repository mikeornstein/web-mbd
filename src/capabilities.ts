/** Runtime feature detection for the two solver back-end paths. */

export interface Capability {
  label: string;
  available: boolean;
  detail: string;
}

export async function detectCapabilities(): Promise<Capability[]> {
  return [await detectWebGPU(), detectWasm(), detectSharedArrayBuffer()];
}

async function detectWebGPU(): Promise<Capability> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) {
    return {
      label: "WebGPU (GPU solver path)",
      available: false,
      detail: "navigator.gpu is unavailable in this browser context",
    };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        label: "WebGPU (GPU solver path)",
        available: false,
        detail: "no GPU adapter could be acquired",
      };
    }
    return {
      label: "WebGPU (GPU solver path)",
      available: true,
      detail: "adapter acquired — explicit + contact kernels can run on device",
    };
  } catch (err) {
    return {
      label: "WebGPU (GPU solver path)",
      available: false,
      detail: `adapter request failed: ${(err as Error).message}`,
    };
  }
}

function detectWasm(): Capability {
  const available = typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
  return {
    label: "WebAssembly (CPU solver path)",
    available,
    detail: available
      ? "implicit solves and sparse factorization can run in WASM"
      : "WebAssembly is not supported",
  };
}

function detectSharedArrayBuffer(): Capability {
  const available = typeof SharedArrayBuffer === "function";
  return {
    label: "SharedArrayBuffer (threaded WASM)",
    available,
    detail: available
      ? "cross-origin isolation is active — threaded kernels are possible"
      : "not cross-origin isolated — WASM threads unavailable",
  };
}
