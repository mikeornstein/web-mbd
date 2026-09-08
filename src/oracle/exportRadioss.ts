import type { ModelIR } from "../ir/types.js";

/**
 * Radioss 20-column float field.
 * Fit max digits with ≥1 leading space so free-format engine cards (`/DT`,
 * `/DTIX`, `/STATE/DT`) do not abut into one token, while round-tripping
 * cylinder corners far closer than E20.10 (~3e-15 m residual).
 */
export function formatRadiossF20(v: number): string {
  for (let digits = 15; digits >= 1; digits--) {
    const s = v.toExponential(digits);
    if (s.length <= 19) return s.padStart(20, " ");
  }
  return v.toExponential(6).padStart(20, " ");
}

/** Value OR will recover after writing `formatRadiossF20(v)` into a deck. */
export function snapToRadiossF20(v: number): number {
  return Number(formatRadiossF20(v).trim());
}

/** Snap packed XYZ so web-mbd and the Radioss starter share identical X0. */
export function snapCoordsToRadiossF20(coords: ArrayLike<number>): Float64Array {
  const out = new Float64Array(coords.length);
  for (let i = 0; i < coords.length; i++) out[i] = snapToRadiossF20(coords[i]!);
  return out;
}

/** Format a Radioss 10-column integer field. */
function i10(v: number): string {
  return String(v).padStart(10, " ");
}

/**
 * Emit OpenRadioss block-format starter + engine decks for the Taylor IR.
 * Same nodes/hexes as web-mbd; LAW2 / PLAS_JOHNS with n=1 ≈ linear hardening.
 * Node coords are snapped through `formatRadiossF20` before emit.
 */
export function exportTaylorRadiossDecks(model: ModelIR): {
  root: string;
  starter: string;
  engine: string;
} {
  const root = "TAYLOR";
  const snapped = snapCoordsToRadiossF20(model.mesh.coords);
  const nNodes = snapped.length / 3;
  const nHex = model.mesh.hexes.length / 8;
  const { material: mat, wall, initialVelocity, controls } = model;

  const nodes: string[] = [];
  for (let a = 0; a < nNodes; a++) {
    const id = a + 1;
    nodes.push(
      `${i10(id)}${formatRadiossF20(snapped[a * 3]!)}${formatRadiossF20(snapped[a * 3 + 1]!)}${formatRadiossF20(snapped[a * 3 + 2]!)}`,
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
${formatRadiossF20(mat.density)}${formatRadiossF20(0)}
${formatRadiossF20(mat.young)}${formatRadiossF20(mat.poisson)}${i10(0)}
${formatRadiossF20(mat.yieldStress)}${formatRadiossF20(mat.hardeningModulus)}${formatRadiossF20(1)}${formatRadiossF20(0)}${formatRadiossF20(0)}
${formatRadiossF20(0)}${formatRadiossF20(1)}${i10(0)}${i10(0)}${formatRadiossF20(0)}${formatRadiossF20(0)}
${formatRadiossF20(0)}${formatRadiossF20(0)}${formatRadiossF20(0)}${formatRadiossF20(0)}
/NODE
${nodes.join("\n")}
/PROP/SOLID/1
taylor_hex_full
${i10(17)}${i10(4)}${i10(0)}${i10(1)}${i10(0)}${i10(0)}${i10(0)}${i10(1)}${i10(0)}
${formatRadiossF20(1e-20)}${formatRadiossF20(1e-21)}
${formatRadiossF20(0)}
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
${formatRadiossF20(initialVelocity[0])}${formatRadiossF20(initialVelocity[1])}${formatRadiossF20(initialVelocity[2])}${i10(1)}${i10(0)}
/RWALL/PLANE/1
impact_wall
${i10(0)}${i10(0)}${i10(1)}${i10(0)}
${formatRadiossF20(0)}${formatRadiossF20(0)}${formatRadiossF20(0)}${formatRadiossF20(0)}${i10(0)}
${formatRadiossF20(wall.point[0])}${formatRadiossF20(wall.point[1])}${formatRadiossF20(wall.point[2])}
${formatRadiossF20(wall.point[0] + wall.normal[0])}${formatRadiossF20(wall.point[1] + wall.normal[1])}${formatRadiossF20(wall.point[2] + wall.normal[2])}
/ANIM/VERS
        44
/END
`;

  // Stop at fixture endTime (not 1.01×): OR also force-writes a final .sta after
  // TSTOP, which must not be used for parity (see openRadiossRunner pick).
  const tEnd = controls.endTime;
  const dtScale = controls.cfl > 0 ? controls.cfl : 0.9;
  const fixedDt = controls.fixedDt;
  // Float64 nodal dump for Object.is gates (stat_node.F E20.13). Anim VTK is float32.
  // /STATE/DT/ALL tags every node (NSTATALL); dump at fixture endTime.
  const dtCards =
    fixedDt !== undefined && fixedDt > 0
      ? `/DTIX
${formatRadiossF20(fixedDt)}${formatRadiossF20(fixedDt)}
/DT
${formatRadiossF20(1)}${formatRadiossF20(0)}`
      : `/DT
${formatRadiossF20(dtScale)}${formatRadiossF20(0)}`;
  const engine = `#RADIOSS ENGINE
/RUN/${root}/1
${formatRadiossF20(tEnd)}
${dtCards}
/ANIM/DT
${formatRadiossF20(0)}${formatRadiossF20(controls.endTime)}
/ANIM/NODA/DT
/ANIM/ELEM/EPSP
/STATE/DT/ALL
${formatRadiossF20(controls.endTime)}${formatRadiossF20(controls.endTime)}
/TFILE/4
${formatRadiossF20(model.output.historyInterval)}
/PRINT/-1/100
/MON/ON
/PARITH/OFF
/VERS/2023
`;

  return { root, starter, engine };
}
