/**
 * Write src/oracle/inflate-a-radioss-golden.json from a real engine tape.
 * Reads radioss/A-inflate/{warn,metrics}.json produced by the
 * inflation-abc post on the oriented deck. Does not invent numbers.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { lockedLawCard } from "../src/inflate/lawCard.ts";
import { loadShipMeshA } from "../src/inflate/meshA.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`bad ${label}`);
  return v;
}

function roundTo(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

const warnRaw: unknown = JSON.parse(
  readFileSync("radioss/A-inflate/warn.json", "utf8"),
);
const metricsRaw: unknown = JSON.parse(
  readFileSync("radioss/A-inflate/metrics.json", "utf8"),
);
if (!isRecord(warnRaw)) throw new Error("warn.json is not an object");
if (!Array.isArray(metricsRaw) || metricsRaw.length === 0) throw new Error("metrics.json empty");
const restRaw = metricsRaw[0];
if (!isRecord(restRaw)) throw new Error("metrics[0] is not an object");

const law = lockedLawCard();
const mesh = loadShipMeshA();
const warn = {
  frame: num(warnRaw["frame"], "warn.frame"),
  t: roundTo(num(warnRaw["t"], "warn.t"), 6),
  lambdaMax: roundTo(num(warnRaw["lam_max"], "warn.lam_max"), 4),
  p: Math.round(num(warnRaw["p_Pa"], "warn.p_Pa")),
  volume_mL: roundTo(num(warnRaw["V_mL"], "warn.V_mL"), 1),
  psi_J: roundTo(num(warnRaw["Psi_J"], "warn.Psi_J"), 3),
};
const rest = {
  frame: 0,
  t: 0,
  lambdaMax: 1,
  p: 0,
  volume_mL: roundTo(num(restRaw["V_mL"], "rest.V_mL"), 1),
  psi_J: 0,
};

const golden = {
  provenance: {
    source: "openradioss",
    desk: "OpenCourant linux64_gf latest-20261003 (commit 6ac7e7d39847cc1c8abfed73d34651a50d2fc3ba). Official OpenRadioss GitHub zip latest-20260728 404s from this environment.",
    branch: "cursor/inflate-a-nh-oracle-a8a8",
    note: "Offline OpenCourant linux64_gf latest-20261003. Consistently outward-oriented closed shell (fingerprint f9635c7f; 188 of 1554 four-sided shells reversed from as-wound d9c56487). True enclosed volume. Starter warned Ismstr=10 changed to 2 on this package. AGPL solver is not shipped in the Pages bundle. Dynamic PLOAD 0→65 kPa / 40 ms — not ABC QS (~54 kPa). Do not retune μ or ρ.",
  },
  loadFamily: law.loadFamily,
  law,
  mesh: {
    nNodes: mesh.nNodes,
    nShellQuads: mesh.nQuads,
    NUMELC: mesh.nQuads,
    NUMELTG: mesh.nTris,
    fingerprint: mesh.fingerprint,
    source:
      "mikeornstein/inflation-abc meshes/A.json Design-PASS quad, then whole-quad outward rewind (188 of 1554 shells reversed; mixed-winding quads = 0). Same node order as radioss/A-inflate/Ainflate_0000.rad.",
  },
  warn,
  rest,
  bands: {
    lambdaRel: 0.02,
    volumeRel: 0.05,
    pressureRel: 0.05,
  },
};

const out = "src/oracle/inflate-a-radioss-golden.json";
writeFileSync(out, `${JSON.stringify(golden, null, 2)}\n`);
console.log(JSON.stringify({ wrote: out, fingerprint: mesh.fingerprint, warn, rest }, null, 2));
