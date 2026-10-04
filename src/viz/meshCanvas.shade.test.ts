import { expect, test } from "vitest";
import { loadShipMesh, loadShipMeshAsWound } from "../inflate/meshA.js";
import {
  cstTrianglesFromQuads,
  leftoverTriangles,
  triangleNormal,
  type ShellTriangle,
} from "../inflate/orientShell.js";
import { shadedFacesDrawn } from "./meshCanvas.js";

function sameTri(a: ShellTriangle, b: ShellTriangle): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

test("canvas shaded faces and normals follow the outward orienter, not the raw as-wound mesh", () => {
  const asWound = loadShipMeshAsWound("A");
  const drawn = shadedFacesDrawn(asWound.coords, asWound.quads, asWound.tris);
  expect(drawn.triangles).toHaveLength(3108);
  expect(drawn.normals).toHaveLength(3108);
  const raw = cstTrianglesFromQuads(asWound.quads);
  let differ = 0;
  for (let i = 0; i < raw.length; i++) {
    if (!sameTri(drawn.triangles[i]!, raw[i]!)) differ += 1;
  }
  expect(differ).toBe(376);
  const n0 = triangleNormal(asWound.coords, drawn.triangles[0]!);
  expect(Math.hypot(n0[0], n0[1], n0[2])).toBeGreaterThan(0.5);
});

test("canvas draw path fails when the orienter is stubbed to return the raw triangles", () => {
  const asWound = loadShipMeshAsWound("A");
  const stub = (
    _coords: ArrayLike<number>,
    quads: ArrayLike<number>,
    leftover: ArrayLike<number> = [],
  ): ShellTriangle[] => [...cstTrianglesFromQuads(quads), ...leftoverTriangles(leftover)];
  const good = shadedFacesDrawn(asWound.coords, asWound.quads, asWound.tris);
  const stubbed = shadedFacesDrawn(asWound.coords, asWound.quads, asWound.tris, stub);
  const raw = cstTrianglesFromQuads(asWound.quads);
  expect(stubbed.triangles).toEqual(raw);
  let differFromOutward = 0;
  for (let i = 0; i < good.triangles.length; i++) {
    if (!sameTri(good.triangles[i]!, stubbed.triangles[i]!)) differFromOutward += 1;
  }
  expect(differFromOutward).toBe(376);
  expect(stubbed.triangles).not.toEqual(good.triangles);
});

test("loaded Letter A canvas triangles match the solver mesh and still have outward normals", () => {
  const mesh = loadShipMesh("A");
  const drawn = shadedFacesDrawn(mesh.coords, mesh.quads, mesh.tris);
  expect(drawn.triangles).toEqual(cstTrianglesFromQuads(mesh.quads));
  const n0 = triangleNormal(mesh.coords, drawn.triangles[0]!);
  expect(Math.hypot(n0[0], n0[1], n0[2])).toBeGreaterThan(0.5);
});
