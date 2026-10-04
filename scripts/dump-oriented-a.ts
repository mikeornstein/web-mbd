import { writeFileSync } from "node:fs";
import { enclosedVolume, loadShipMesh, loadShipMeshAsWound, trueEnclosedVolume } from "../src/inflate/meshA.ts";
import { shellWindingReport } from "../src/inflate/orientShell.ts";

const asWound = loadShipMeshAsWound("A");
const mesh = loadShipMesh("A");
const report = shellWindingReport(asWound.coords, asWound.quads, asWound.tris);
const v = trueEnclosedVolume(mesh.coords, mesh.quads, mesh.tris);
const payload: Record<string, unknown> = {
  fingerprintAsWound: asWound.fingerprint,
  fingerprintOriented: mesh.fingerprint,
  nNodes: mesh.nNodes,
  nQuads: mesh.nQuads,
  nTris: mesh.nTris,
  asWoundVolume_mL: enclosedVolume(asWound.coords, asWound.quads) * 1e6,
  orientedVolume_mL: v * 1e6,
  quadsNeedingFlip: report.quadsNeedingFlip,
  trianglesNeedingFlip: report.trianglesNeedingFlip,
};
const withCoords = process.argv.includes("--coords");
if (withCoords) {
  payload.coords = mesh.coords;
  payload.quads = mesh.quads;
}
const out =
  process.argv.find((a) => a.endsWith(".json")) ?? "radioss/A-inflate/oriented-meta.json";
writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(
  JSON.stringify(
    {
      fingerprintAsWound: payload.fingerprintAsWound,
      fingerprintOriented: payload.fingerprintOriented,
      asWoundVolume_mL: payload.asWoundVolume_mL,
      orientedVolume_mL: payload.orientedVolume_mL,
      quadsNeedingFlip: payload.quadsNeedingFlip,
      trianglesNeedingFlip: payload.trianglesNeedingFlip,
      withCoords,
      wrote: out,
    },
    null,
    2,
  ),
);
