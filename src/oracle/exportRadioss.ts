import type { ModelIR } from "../ir/types.js";

/** Format a Radioss 20-column float field. */
function f20(v: number): string {
  const s = v.toExponential(10);
  return s.padStart(20, " ");
}

/** Format a Radioss 10-column integer field. */
function i10(v: number): string {
  return String(v).padStart(10, " ");
}

/**
 * Emit OpenRadioss block-format starter + engine decks for the Taylor IR.
 * Same nodes/hexes as web-mbd; LAW2 / PLAS_JOHNS with n=1 ≈ linear hardening.
 */
export function exportTaylorRadiossDecks(model: ModelIR): {
  root: string;
  starter: string;
  engine: string;
} {
  const root = "TAYLOR";
  const nNodes = model.mesh.coords.length / 3;
  const nHex = model.mesh.hexes.length / 8;
  const { material: mat, wall, initialVelocity, controls } = model;

  const nodes: string[] = [];
  for (let a = 0; a < nNodes; a++) {
    const id = a + 1;
    nodes.push(
      `${i10(id)}${f20(model.mesh.coords[a * 3]!)}${f20(model.mesh.coords[a * 3 + 1]!)}${f20(model.mesh.coords[a * 3 + 2]!)}`,
    );
  }

  const bricks: string[] = [];
  for (let e = 0; e < nHex; e++) {
    const base = e * 8;
    const ids = model.mesh.hexes.slice(base, base + 8).map((n) => i10(n + 1));
    bricks.push(`${i10(e + 1)}${ids.join("")}`);
  }

  const allNodes = Array.from({ length: nNodes }, (_, i) => i + 1);
  const grnodLines: string[] = [];
  for (let i = 0; i < allNodes.length; i += 10) {
    grnodLines.push(allNodes.slice(i, i + 10).map(i10).join(""));
  }

  // PLAS_JOHNS: sigma = a + b * ep^n ; n=1 → linear hardening matching IR.
  const starter = `#RADIOSS STARTER
# web-mbd Taylor oracle deck (same mesh / SI units as ModelIR)
/BEGIN
${root.padEnd(100, " ")}
      2023         0
                  kg                   m                   s
                  kg                   m                   s
/TITLE
Taylor bar OFHC-like J2 linear hardening
/IOFLAG
         0                   0         0         0         0         0
/ANALY
         0                   0         0
/SPMD
         0         1                   0                   1
/DEF_SOLID
        17         4         1                   0         0         0         1         0
/MAT/PLAS_JOHNS/1
taylor_copper
${f20(mat.density)}${f20(0)}
${f20(mat.young)}${f20(mat.poisson)}${i10(0)}
${f20(mat.yieldStress)}${f20(mat.hardeningModulus)}${f20(1)}${f20(0)}${f20(0)}
${f20(0)}${f20(1)}${i10(0)}${i10(0)}${f20(0)}${f20(0)}
${f20(0)}${f20(0)}${f20(0)}${f20(0)}
/NODE
${nodes.join("\n")}
/PROP/SOLID/1
taylor_hex_full
${i10(17)}${i10(4)}${i10(0)}${i10(1)}${i10(0)}${i10(0)}${i10(0)}${i10(1)}${i10(0)}
${f20(1e-20)}${f20(1e-21)}
${f20(0)}
/PART/1
taylor_bar
         1         1         0
/BRICK/1
${bricks.join("\n")}
/GRNOD/NODE/1
all_nodes
${grnodLines.join("\n")}
/INIVEL/TRA/1
impact_velocity
${f20(initialVelocity[0])}${f20(initialVelocity[1])}${f20(initialVelocity[2])}${i10(1)}${i10(0)}
/RWALL/PLANE/1
impact_wall
${i10(0)}${i10(0)}${i10(1)}${i10(0)}
${f20(0)}${f20(0)}${f20(0)}${f20(0)}${i10(0)}
${f20(wall.point[0])}${f20(wall.point[1])}${f20(wall.point[2])}
${f20(wall.point[0] + wall.normal[0])}${f20(wall.point[1] + wall.normal[1])}${f20(wall.point[2] + wall.normal[2])}
/ANIM/VERS
        44
/END
`;

  const tEnd = controls.endTime * 1.01;
  const dtScale = controls.cfl > 0 ? controls.cfl : 0.9;
  // Float64 nodal dump for Object.is gates (stat_node.F E20.13). Anim VTK is float32.
  // /STATE/DT/ALL tags every node (NSTATALL); dump once at fixture endTime.
  const engine = `#RADIOSS ENGINE
/RUN/${root}/1
${f20(tEnd)}
/DT
${f20(dtScale)}${f20(0)}
/ANIM/DT
${f20(0)}${f20(controls.endTime)}
/ANIM/NODA/DT
/ANIM/ELEM/EPSP
/STATE/DT/ALL
${f20(controls.endTime)}${f20(controls.endTime)}
/TFILE/4
${f20(model.output.historyInterval)}
/PRINT/-1/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;

  return { root, starter, engine };
}
