import { percentile } from "./stretchField.js";

export interface PairDistance {
  n: number;
  rms: number;
  p95: number;
}

export function nodePairDistance(a: ArrayLike<number>, b: ArrayLike<number>, nNodes: number): PairDistance {
  if (a.length < nNodes * 3 || b.length < nNodes * 3) {
    throw new Error("nodePairDistance: short coordinate buffer");
  }
  const ds: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < nNodes; i++) {
    const dx = a[i * 3]! - b[i * 3]!;
    const dy = a[i * 3 + 1]! - b[i * 3 + 1]!;
    const dz = a[i * 3 + 2]! - b[i * 3 + 2]!;
    const d = Math.hypot(dx, dy, dz);
    ds.push(d);
    sumSq += d * d;
  }
  return { n: nNodes, rms: Math.sqrt(sumSq / nNodes), p95: percentile(ds, 0.95) };
}

export function ratio(numer: number, denom: number): number | null {
  if (Math.abs(denom) < 1e-18) return Math.abs(numer) < 1e-18 ? 0 : null;
  return numer / denom;
}
