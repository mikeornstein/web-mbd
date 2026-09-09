import { expect, test } from "vitest";
import { createCylinderHexMesh } from "../mesh/cylinderHex.ts";
import { boundaryHexFaces, faceNormal, HEX_FACES } from "./hexFaces.ts";

function unitCube(): { coords: number[]; hexes: number[] } {
  return {
    coords: [
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
    ],
    hexes: [0, 1, 2, 3, 4, 5, 6, 7],
  };
}

test("a single hex has six boundary faces", () => {
  const { hexes } = unitCube();
  expect(HEX_FACES.length).toBe(6);
  expect(boundaryHexFaces(hexes)).toHaveLength(6);
});

test("shared interior faces are not drawn", () => {
  // Second hex translated +X, sharing nodes 1,2,5,6.
  const hexes = [0, 1, 2, 3, 4, 5, 6, 7, 1, 8, 9, 2, 5, 10, 11, 6];
  expect(boundaryHexFaces(hexes)).toHaveLength(10);
});

test("unit-cube +Z face has an outward +Z normal", () => {
  const { coords } = unitCube();
  const n = faceNormal(coords, [4, 5, 6, 7]);
  expect(n[0]).toBeCloseTo(0, 12);
  expect(n[1]).toBeCloseTo(0, 12);
  expect(n[2]).toBeCloseTo(1, 12);
});

test("cylinder skin has fewer faces than 6 × hex count", () => {
  const mesh = createCylinderHexMesh({ radius: 1, length: 2, nSide: 2, nZ: 2 });
  const nHex = mesh.hexes.length / 8;
  const faces = boundaryHexFaces(mesh.hexes);
  expect(nHex).toBe(8);
  expect(faces.length).toBeGreaterThan(0);
  expect(faces.length).toBeLessThan(6 * nHex);
});
