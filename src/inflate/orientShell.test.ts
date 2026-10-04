import { expect, test } from "vitest";
import { createInflateAModel } from "../fixtures/inflateA.js";
import { enclosedVolume, loadShipMesh, loadShipMeshAsWound, trueEnclosedVolume } from "./meshA.js";
import {
  cstTrianglesFromQuads,
  edgeConsistency,
  facePointsOutward,
  orientQuadShellOutward,
  orientTrianglesOutward,
  otherDiagonalVolume,
  pointInsideClosedShell,
  reverseQuad,
  reverseTriangle,
  shellWindingReport,
  signedVolumeOfTriangles,
  triangleCentroid,
  triangleNormal,
} from "./orientShell.js";

test("source Letter A rest mesh is a closed shell with inconsistent winding (case a)", () => {
  const asWound = loadShipMeshAsWound("A");
  const report = shellWindingReport(asWound.coords, asWound.quads, asWound.tris);
  expect(asWound.fingerprint).toBe("d9c56487");
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

test("loaded Letter A is consistently outward: closed, positive true enclosed volume, zero remaining flips", () => {
  const mesh = loadShipMesh("A");
  const report = shellWindingReport(mesh.coords, mesh.quads, mesh.tris);
  expect(mesh.fingerprint).toBe("f9635c7f");
  expect(mesh.fingerprint).not.toBe("d9c56487");
  expect(report.boundaryEdgeCount).toBe(0);
  expect(report.inconsistentEdgeCount).toBe(0);
  expect(report.trianglesNeedingFlip).toBe(0);
  expect(report.quadsNeedingFlip).toBe(0);
  expect(report.mixedQuadCount).toBe(0);
  expect(report.orientable).toBe(true);
  const v = trueEnclosedVolume(mesh.coords, mesh.quads, mesh.tris);
  expect(v * 1e6).toBeCloseTo(420.5, 0);
  expect(createInflateAModel().mesh.fingerprint).toBe(mesh.fingerprint);
});

test("outward orientation at rest has opposite shared edges, positive volume, zero remaining flips", () => {
  const mesh = loadShipMesh("A");
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

test("every face of the oriented Letter A shell points outward", () => {
  const mesh = loadShipMesh("A");
  const tris = cstTrianglesFromQuads(mesh.quads);
  expect(tris).toHaveLength(3108);
  let outward = 0;
  for (const tri of tris) {
    if (facePointsOutward(mesh.coords, tris, tri)) outward += 1;
  }
  expect(outward).toBe(3108);
});

test("reported Letter A volume equals a true enclosed volume (other-diagonal + ray parity)", () => {
  const mesh = loadShipMesh("A");
  const reported = enclosedVolume(mesh.coords, mesh.quads, mesh.tris);
  const other = otherDiagonalVolume(mesh.coords, mesh.quads);
  expect(Math.abs(reported - other) / Math.max(Math.abs(reported), 1e-18)).toBeLessThan(1e-8);
  expect(trueEnclosedVolume(mesh.coords, mesh.quads, mesh.tris)).toBe(reported);
  const tris = cstTrianglesFromQuads(mesh.quads);
  const far: [number, number, number] = [2, 2, 2];
  expect(pointInsideClosedShell(mesh.coords, tris, far)).toBe(false);
  const first = tris[0]!;
  const n = triangleNormal(mesh.coords, first);
  const c = triangleCentroid(mesh.coords, first);
  const inside: [number, number, number] = [c[0] - 2e-4 * n[0], c[1] - 2e-4 * n[1], c[2] - 2e-4 * n[2]];
  expect(pointInsideClosedShell(mesh.coords, tris, inside)).toBe(true);
});

test("inverting one oriented Letter A quad breaks outward consistency and changes volume", () => {
  const mesh = loadShipMesh("A");
  const v0 = enclosedVolume(mesh.coords, mesh.quads);
  const flipped = mesh.quads.slice();
  const q0: [number, number, number, number] = [flipped[0]!, flipped[1]!, flipped[2]!, flipped[3]!];
  const rev = reverseQuad(q0);
  flipped[0] = rev[0];
  flipped[1] = rev[1];
  flipped[2] = rev[2];
  flipped[3] = rev[3];
  const report = shellWindingReport(mesh.coords, flipped, mesh.tris);
  expect(report.inconsistentEdgeCount).toBeGreaterThan(0);
  expect(report.quadsNeedingFlip).toBeGreaterThan(0);
  expect(enclosedVolume(mesh.coords, flipped)).not.toBeCloseTo(v0, 12);
  expect(() => trueEnclosedVolume(mesh.coords, flipped, mesh.tris)).toThrow(/not consistent|not closed|not positive/);
});

test("source Letters B and C still have the published inconsistent-winding counts", () => {
  const b = loadShipMeshAsWound("B");
  const c = loadShipMeshAsWound("C");
  const bRep = shellWindingReport(b.coords, b.quads, b.tris);
  const cRep = shellWindingReport(c.coords, c.quads, c.tris);
  expect(bRep.triangleCount).toBe(2178);
  expect(bRep.trianglesNeedingFlip).toBe(404);
  expect(cRep.triangleCount).toBe(1972);
  expect(cRep.trianglesNeedingFlip).toBe(412);
});

test("whole-quad reverse matches the triangle orienter on Letter A", () => {
  const asWound = loadShipMeshAsWound("A");
  const q = orientQuadShellOutward(asWound.coords, asWound.quads, asWound.tris);
  expect(q.mixedQuadCount).toBe(0);
  expect(q.flippedQuadCount).toBe(188);
  const loaded = loadShipMesh("A");
  expect(loaded.quads).toEqual(q.quads);
  const t = reverseTriangle([0, 1, 2]);
  expect(t).toEqual([0, 2, 1]);
});
