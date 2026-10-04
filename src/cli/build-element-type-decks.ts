/**
 * Diagnosis decks only. Does not replace radioss/A-inflate (the golden)
 * and does not change the toy.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatRadiossF20 } from "../oracle/exportRadioss.js";
import { enclosedVolume, trueEnclosedVolume } from "../inflate/meshA.js";
import { orientQuadShellOutward } from "../inflate/orientShell.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const GOLDEN0 = resolve(ROOT, "radioss/A-inflate/Ainflate_0000.rad");
const GOLDEN1 = resolve(ROOT, "radioss/A-inflate/Ainflate_0001.rad");
const FINE_SRC = "/tmp/inflation-abc/radioss/A-refine/meshes/A-fine.json";
const OUT = resolve(ROOT, "radioss/diag-element-type");

function i10(v: number): string {
  return String(v).padStart(10, " ");
}

function parseShells(starter: string): { id: number; nodes: [number, number, number, number] }[] {
  const mark = "\n/SHELL/1\n";
  const start = starter.indexOf(mark);
  if (start < 0) throw new Error("golden missing /SHELL/1 element block");
  const rest = starter.slice(start + 1);
  const endRel = rest.search(/\n\/[A-Z]/);
  const block = endRel < 0 ? rest : rest.slice(0, endRel);
  const out: { id: number; nodes: [number, number, number, number] }[] = [];
  for (const line of block.split("\n")) {
    if (!/^\s*\d+\s+\d+\s+\d+\s+\d+\s+\d+\s*$/.test(line)) continue;
    const tok = line.trim().split(/\s+/).map(Number);
    const id = tok[0]!;
    const n0 = tok[1]!;
    const n1 = tok[2]!;
    const n2 = tok[3]!;
    const n3 = tok[4]!;
    out.push({ id, nodes: [n0, n1, n2, n3] });
  }
  if (out.length !== 1554) throw new Error(`expected 1554 golden shells, got ${out.length}`);
  return out;
}

function replaceBetween(src: string, begin: string, nextSlashAfter: RegExp, insert: string): string {
  const i = src.indexOf(begin);
  if (i < 0) throw new Error(`missing ${begin}`);
  const from = i;
  const after = src.slice(from + begin.length);
  const j = after.search(nextSlashAfter);
  if (j < 0) throw new Error(`missing ${nextSlashAfter} after ${begin}`);
  return src.slice(0, from) + insert + after.slice(j);
}

function writeDeck(dir: string, starter: string, engine: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "Ainflate_0000.rad"), starter);
  writeFileSync(resolve(dir, "Ainflate_0001.rad"), engine);
}

function triangleStarter(golden: string, shells: { id: number; nodes: [number, number, number, number] }[]): string {
  const lines: string[] = ["# Diagnosis: triangle shells. Same nodes, material, load, relaxation as golden.", "/SH3N/1"];
  let tid = 1;
  for (const s of shells) {
    const [a, b, c, d] = s.nodes;
    lines.push(`${i10(tid)}${i10(a)}${i10(b)}${i10(c)}`);
    tid += 1;
    lines.push(`${i10(tid)}${i10(a)}${i10(c)}${i10(d)}`);
    tid += 1;
  }
  let out = golden.replace(
    "letter A all-quad film (1554 shells; SH3N=0)",
    "letter A triangle film (3108 /SH3N; split 0-1-2 and 0-2-3 of each golden quad)",
  );
  out = out.replace("Mesh 1554 nodes, 1554 /SHELL quads", "Mesh 1554 nodes, 3108 /SH3N triangles");
  out = out.replace("no /SH3N", "/SH3N diagnosis (does not replace golden)");
  out = replaceBetween(out, "\n/SHELL/1", /\n\/[A-Z]/, `\n${lines.join("\n")}`);
  return out;
}

function qephStarter(golden: string, ismstr: 10 | 2): string {
  const oldProp = "         1        10         2         1         0                           0.0";
  const newProp = `${i10(24)}${i10(ismstr)}${i10(2)}${i10(1)}${i10(0)}                          0.0`;
  if (!golden.includes(oldProp)) throw new Error("golden property card line not found");
  let out = golden.replace(oldProp, newProp);
  out = out.replace(
    "film membrane N=1 Ismstr=10 QEPH Ithick=1",
    `film membrane N=1 Ismstr=${ismstr} Ishell=24 QEPH Ithick=1 (diagnosis; golden stays Ishell=1 Ismstr=10)`,
  );
  out = out.replace(
    "#RADIOSS STARTER\n",
    `#RADIOSS STARTER\n# Diagnosis: QEPH four-node shells (Ishell=24, Ismstr=${ismstr}). Same mesh, material, load, relaxation as golden.\n`,
  );
  return out;
}

function parseFineBake(raw: unknown): { coords: Float64Array; quads: number[] } {
  if (typeof raw !== "object" || raw === null) throw new Error("A-fine.json not an object");
  const rec = raw as Record<string, unknown>;
  const pos0 = rec["pos0"];
  const quadsRaw = rec["quads"];
  if (!Array.isArray(pos0) || !pos0.every((n) => typeof n === "number")) throw new Error("A-fine pos0");
  if (!Array.isArray(quadsRaw)) throw new Error("A-fine quads");
  const coords = Float64Array.from(pos0);
  const quads: number[] = [];
  for (const q of quadsRaw) {
    if (!Array.isArray(q) || q.length !== 4 || !q.every((n) => typeof n === "number")) {
      throw new Error("A-fine quad");
    }
    quads.push(q[0]!, q[1]!, q[2]!, q[3]!);
  }
  return { coords, quads };
}

function fineStarter(golden: string): { starter: string; report: Record<string, unknown> } {
  const bake = parseFineBake(JSON.parse(readFileSync(FINE_SRC, "utf8")));
  const asWoundV = enclosedVolume(bake.coords, bake.quads);
  const oriented = orientQuadShellOutward(bake.coords, bake.quads);
  const v = trueEnclosedVolume(bake.coords, oriented.quads, oriented.tris);
  const nNodes = bake.coords.length / 3;
  const nQuads = oriented.quads.length / 4;
  const nodeLines: string[] = [];
  for (let i = 0; i < nNodes; i++) {
    nodeLines.push(
      `${i10(i + 1)}${formatRadiossF20(bake.coords[i * 3]!)}${formatRadiossF20(bake.coords[i * 3 + 1]!)}${formatRadiossF20(bake.coords[i * 3 + 2]!)}`,
    );
  }
  const shellLines: string[] = [];
  for (let e = 0; e < nQuads; e++) {
    shellLines.push(
      `${i10(e + 1)}${i10(oriented.quads[e * 4]! + 1)}${i10(oriented.quads[e * 4 + 1]! + 1)}${i10(oriented.quads[e * 4 + 2]! + 1)}${i10(oriented.quads[e * 4 + 3]! + 1)}`,
    );
  }
  let out = golden;
  out = out.replace(
    "letter A all-quad film (1554 shells; SH3N=0)",
    `letter A fine oriented film (${nQuads} /SHELL; 1-to-4 of ship, re-oriented)`,
  );
  out = out.replace(
    "Mesh 1554 nodes, 1554 /SHELL quads (source 1554 quads + 0 orphan faceTris paired; SH3N=0)",
    `Mesh ${nNodes} nodes, ${nQuads} /SHELL quads (inflation-abc A-fine 1-to-4, re-oriented outward)`,
  );
  out = replaceBetween(out, "\n/NODE\n", /\n\/[A-Z]/, `\n/NODE\n${nodeLines.join("\n")}`);
  out = replaceBetween(out, "\n/SHELL/1\n", /\n\/[A-Z]/, `\n/SHELL/1\n${shellLines.join("\n")}`);
  out = out.replace(
    "#RADIOSS STARTER\n",
    `#RADIOSS STARTER\n# Diagnosis: finer quad mesh. Inflation-abc A-fine (6216) re-oriented. Same material, load, relaxation as golden.\n`,
  );
  return {
    starter: out,
    report: {
      source: FINE_SRC,
      nNodes,
      nQuads,
      asWoundSignedVolume_mL: asWoundV * 1e6,
      orientedVolume_mL: v * 1e6,
      flippedQuadCount: oriented.flippedQuadCount,
      mixedQuadCount: oriented.mixedQuadCount,
      orientable: oriented.orientable,
    },
  };
}

function main(): void {
  const golden0 = readFileSync(GOLDEN0, "utf8");
  const golden1 = readFileSync(GOLDEN1, "utf8");
  const shells = parseShells(golden0);
  mkdirSync(OUT, { recursive: true });

  writeDeck(resolve(OUT, "sh3n"), triangleStarter(golden0, shells), golden1);
  writeDeck(resolve(OUT, "qeph"), qephStarter(golden0, 10), golden1);
  writeDeck(resolve(OUT, "qeph-ismstr2"), qephStarter(golden0, 2), golden1);
  const fine = fineStarter(golden0);
  writeDeck(resolve(OUT, "fine"), fine.starter, golden1);
  writeFileSync(resolve(OUT, "fine-orient.json"), `${JSON.stringify(fine.report, null, 2)}\n`);
  writeFileSync(
    resolve(OUT, "README.md"),
    [
      "# Element-type diagnosis decks",
      "",
      "Do not replace `radioss/A-inflate` (the golden). Same material, density, 0→65 kPa / 40 ms pressure, `/ADYREL` + Rayleigh 80.",
      "",
      "- `sh3n/` — each golden four-node shell split into two `/SH3N` on diagonal 0–2.",
      "- `qeph/` — same golden mesh, property `Ishell=24` (QEPH), Ismstr=10 as written on golden.",
      "- `qeph-ismstr2/` — same QEPH, Ismstr=2 (the strain flag this package actually runs on the golden).",
      "- `fine/` — inflation-abc A-fine 1-to-4, re-oriented outward, `Ishell=1`.",
      "",
    ].join("\n"),
  );
  console.log(JSON.stringify({ out: OUT, fine: fine.report, nGoldenShells: shells.length }, null, 2));
}

main();
