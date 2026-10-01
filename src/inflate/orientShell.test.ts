import { expect, test } from "vitest";
import { createInflateAModel } from "../fixtures/inflateA.js";
import {
  cstTrianglesFromQuads,
  edgeConsistency,
  orientTrianglesOutward,
  shellWindingReport,
  signedVolumeOfTriangles,
} from "./orientShell.js";

test("Letter A rest mesh is a closed shell with inconsistent winding (case a)", () => {
  const mesh = createInflateAModel().mesh;
  const report = shellWindingReport(mesh.coords, mesh.quads, mesh.tris);
  expect(mesh.fingerprint).toBe("d9c56487");
  expect(report.triangleCount).toBe(3108);
  expect(report.boundaryEdgeCount).toBe(0);
  expect(report.undirectedEdgeCount).toBe(4662);
  expect(report.inconsistentEdgeCount).toBe(456);
  expect(report.trianglesNeedingFlip).toBe(376);
  expect(report.quadsNeedingFlip).toBe(188);
  expect(report.mixedQuadCount).toBe(0);
  expect(report.signedVolume).toBeGreaterThan(0);
  expect(report.orientedSignedVolume).toBeGreaterThan(report.signedVolume);
  expect(report.orientable).toBe(true);
});

test("outward orientation at rest has opposite shared edges, positive volume, zero remaining flips", () => {
  const mesh = createInflateAModel().mesh;
  const source = cstTrianglesFromQuads(mesh.quads);
  const oriented = orientTrianglesOutward(mesh.coords, source);
  expect(oriented.orientable).toBe(true);
  const edges = edgeConsistency(oriented.triangles);
  expect(edges.boundaryEdgeCount).toBe(0);
  expect(edges.inconsistentEdgeCount).toBe(0);
  expect(signedVolumeOfTriangles(mesh.coords, oriented.triangles)).toBeGreaterThan(0);
  const again = orientTrianglesOutward(mesh.coords, oriented.triangles);
  expect(again.flipped.filter(Boolean)).toHaveLength(0);
});
