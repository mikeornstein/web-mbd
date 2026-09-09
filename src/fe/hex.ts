import type { MaterialJ2Linear } from "../ir/types.js";
import {
  createJ2State,
  j2Update,
  lame,
  RADIOSS_ONEP333,
  type J2State,
} from "./materialJ2.js";
import { mat3Det } from "./math3.js";

/** Radioss `s8eprst_ini` PG=.577350269189625D0 (not 1/√3, which is ~1 ulp larger). */
const G = 0.577350269189625;
const W1 = 1;

const CORNERS: [number, number, number][] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];

/** Radioss 2×2×2 order: ξ fastest, then η, then ζ (`KSI/ETA/ZETA` in `s8eprst_ini`). */
const RADIOSS_GAUSS: [number, number, number][] = [
  [-G, -G, -G],
  [G, -G, -G],
  [-G, G, -G],
  [G, G, -G],
  [-G, -G, G],
  [G, -G, G],
  [-G, G, G],
  [G, G, G],
];

const SHAPES: { dN: number[][] }[] = [];
for (const [xi, eta, zeta] of RADIOSS_GAUSS) {
  const dN: number[][] = [];
  for (const c of CORNERS) {
    dN.push([
      0.125 * c[0] * (1 + c[1] * eta) * (1 + c[2] * zeta),
      0.125 * c[1] * (1 + c[0] * xi) * (1 + c[2] * zeta),
      0.125 * c[2] * (1 + c[0] * xi) * (1 + c[1] * eta),
    ]);
  }
  SHAPES.push({ dN });
}

/** Radioss `ONE_OVER_512` — hierarchical DETDP scale (`s8ederipr3`). */
const ONE_OVER_512 = 1 / 512;

/**
 * Radioss `s8eprst_ini` natural derivatives PR/PS/PT (×8 vs isoparametric dN).
 * Layout: PRST[gp][axis][node], axis 0=ξ 1=η 2=ζ, node order matches CORNERS.
 */
const PRST: number[][][] = (() => {
  const out: number[][][] = [];
  for (let ip = 0; ip < 8; ip++) {
    const ksi = RADIOSS_GAUSS[ip]![0]!;
    const eta = RADIOSS_GAUSS[ip]![1]!;
    const zeta = RADIOSS_GAUSS[ip]![2]!;
    const etazeta = eta * zeta;
    const ksizeta = ksi * zeta;
    const ksieta = ksi * eta;
    const pr = [
      -(1 - eta - zeta + etazeta),
      1 - eta - zeta + etazeta,
      1 + eta - zeta - etazeta,
      -(1 + eta - zeta - etazeta),
      -(1 - eta + zeta - etazeta),
      1 - eta + zeta - etazeta,
      1 + eta + zeta + etazeta,
      -(1 + eta + zeta + etazeta),
    ];
    const ps = [
      -(1 - ksi - zeta + ksizeta),
      -(1 + ksi - zeta - ksizeta),
      1 + ksi - zeta - ksizeta,
      1 - ksi - zeta + ksizeta,
      -(1 - ksi + zeta - ksizeta),
      -(1 + ksi + zeta + ksizeta),
      1 + ksi + zeta + ksizeta,
      1 - ksi + zeta - ksizeta,
    ];
    const pt = [
      -(1 - ksi - eta + ksieta),
      -(1 + ksi - eta - ksieta),
      -(1 + ksi + eta + ksieta),
      -(1 - ksi + eta - ksieta),
      1 - ksi - eta + ksieta,
      1 + ksi - eta - ksieta,
      1 + ksi + eta + ksieta,
      1 - ksi + eta - ksieta,
    ];
    out.push([pr, ps, pt]);
  }
  return out;
})();

export type Aj9 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Hierarchical GP Jacobians (`s8ederic3` center CJ + hourglass → `s8ejacip3`).
 * Same construction as `characteristicLengthSmax`; IP order = RADIOSS_GAUSS.
 */
export function hierarchicalGpAj(x: Float64Array): Aj9[] {
  const x1 = x[0]!,
    y1 = x[1]!,
    z1 = x[2]!;
  const x2 = x[3]!,
    y2 = x[4]!,
    z2 = x[5]!;
  const x3 = x[6]!,
    y3 = x[7]!,
    z3 = x[8]!;
  const x4 = x[9]!,
    y4 = x[10]!,
    z4 = x[11]!;
  const x5 = x[12]!,
    y5 = x[13]!,
    z5 = x[14]!;
  const x6 = x[15]!,
    y6 = x[16]!,
    z6 = x[17]!;
  const x7 = x[18]!,
    y7 = x[19]!,
    z7 = x[20]!;
  const x8 = x[21]!,
    y8 = x[22]!,
    z8 = x[23]!;

  const x17 = x7 - x1,
    x28 = x8 - x2,
    x35 = x5 - x3,
    x46 = x6 - x4;
  const y17 = y7 - y1,
    y28 = y8 - y2,
    y35 = y5 - y3,
    y46 = y6 - y4;
  const z17 = z7 - z1,
    z28 = z8 - z2,
    z35 = z5 - z3,
    z46 = z6 - z4;

  const aj4 = x17 + x28 - x35 - x46;
  const aj5 = y17 + y28 - y35 - y46;
  const aj6 = z17 + z28 - z35 - z46;
  const a17 = x17 + x46,
    a28 = x28 + x35;
  const b17 = y17 + y46,
    b28 = y28 + y35;
  const c17 = z17 + z46,
    c28 = z28 + z35;
  const aj7 = a17 + a28,
    aj8 = b17 + b28,
    aj9 = c17 + c28;
  const aj1 = a17 - a28,
    aj2 = b17 - b28,
    aj3 = c17 - c28;

  const hx1 = x1 + x2 - x3 - x4 - x5 - x6 + x7 + x8;
  const hy1 = y1 + y2 - y3 - y4 - y5 - y6 + y7 + y8;
  const hz1 = z1 + z2 - z3 - z4 - z5 - z6 + z7 + z8;
  const hx2 = x1 - x2 - x3 + x4 - x5 + x6 + x7 - x8;
  const hy2 = y1 - y2 - y3 + y4 - y5 + y6 + y7 - y8;
  const hz2 = z1 - z2 - z3 + z4 - z5 + z6 + z7 - z8;
  const hx3 = x1 - x2 + x3 - x4 + x5 - x6 + x7 - x8;
  const hy3 = y1 - y2 + y3 - y4 + y5 - y6 + y7 - y8;
  const hz3 = z1 - z2 + z3 - z4 + z5 - z6 + z7 - z8;
  const hx4 = -x1 + x2 - x3 + x4 + x5 - x6 + x7 - x8;
  const hy4 = -y1 + y2 - y3 + y4 + y5 - y6 + y7 - y8;
  const hz4 = -z1 + z2 - z3 + z4 + z5 - z6 + z7 - z8;

  const pg2 = G * G;
  const hx1pg = hx1 * G,
    hx2pg = hx2 * G,
    hx3pg = hx3 * G,
    hx4pg2 = hx4 * pg2;
  const hy1pg = hy1 * G,
    hy2pg = hy2 * G,
    hy3pg = hy3 * G,
    hy4pg2 = hy4 * pg2;
  const hz1pg = hz1 * G,
    hz2pg = hz2 * G,
    hz3pg = hz3 * G,
    hz4pg2 = hz4 * pg2;

  return [
    [
      aj1 - hx3pg - hx2pg + hx4pg2,
      aj2 - hy3pg - hy2pg + hy4pg2,
      aj3 - hz3pg - hz2pg + hz4pg2,
      aj4 - hx1pg - hx3pg + hx4pg2,
      aj5 - hy1pg - hy3pg + hy4pg2,
      aj6 - hz1pg - hz3pg + hz4pg2,
      aj7 - hx2pg - hx1pg + hx4pg2,
      aj8 - hy2pg - hy1pg + hy4pg2,
      aj9 - hz2pg - hz1pg + hz4pg2,
    ],
    [
      aj1 - hx3pg - hx2pg + hx4pg2,
      aj2 - hy3pg - hy2pg + hy4pg2,
      aj3 - hz3pg - hz2pg + hz4pg2,
      aj4 - hx1pg + hx3pg - hx4pg2,
      aj5 - hy1pg + hy3pg - hy4pg2,
      aj6 - hz1pg + hz3pg - hz4pg2,
      aj7 + hx2pg - hx1pg - hx4pg2,
      aj8 + hy2pg - hy1pg - hy4pg2,
      aj9 + hz2pg - hz1pg - hz4pg2,
    ],
    [
      aj1 + hx3pg - hx2pg - hx4pg2,
      aj2 + hy3pg - hy2pg - hy4pg2,
      aj3 + hz3pg - hz2pg - hz4pg2,
      aj4 - hx1pg - hx3pg + hx4pg2,
      aj5 - hy1pg - hy3pg + hy4pg2,
      aj6 - hz1pg - hz3pg + hz4pg2,
      aj7 - hx2pg + hx1pg - hx4pg2,
      aj8 - hy2pg + hy1pg - hy4pg2,
      aj9 - hz2pg + hz1pg - hz4pg2,
    ],
    [
      aj1 + hx3pg - hx2pg - hx4pg2,
      aj2 + hy3pg - hy2pg - hy4pg2,
      aj3 + hz3pg - hz2pg - hz4pg2,
      aj4 - hx1pg + hx3pg - hx4pg2,
      aj5 - hy1pg + hy3pg - hy4pg2,
      aj6 - hz1pg + hz3pg - hz4pg2,
      aj7 + hx2pg + hx1pg + hx4pg2,
      aj8 + hy2pg + hy1pg + hy4pg2,
      aj9 + hz2pg + hz1pg + hz4pg2,
    ],
    [
      aj1 - hx3pg + hx2pg - hx4pg2,
      aj2 - hy3pg + hy2pg - hy4pg2,
      aj3 - hz3pg + hz2pg - hz4pg2,
      aj4 + hx1pg - hx3pg - hx4pg2,
      aj5 + hy1pg - hy3pg - hy4pg2,
      aj6 + hz1pg - hz3pg - hz4pg2,
      aj7 - hx2pg - hx1pg + hx4pg2,
      aj8 - hy2pg - hy1pg + hy4pg2,
      aj9 - hz2pg - hz1pg + hz4pg2,
    ],
    [
      aj1 - hx3pg + hx2pg - hx4pg2,
      aj2 - hy3pg + hy2pg - hy4pg2,
      aj3 - hz3pg + hz2pg - hz4pg2,
      aj4 + hx1pg + hx3pg + hx4pg2,
      aj5 + hy1pg + hy3pg + hy4pg2,
      aj6 + hz1pg + hz3pg + hz4pg2,
      aj7 + hx2pg - hx1pg - hx4pg2,
      aj8 + hy2pg - hy1pg - hy4pg2,
      aj9 + hz2pg - hz1pg - hz4pg2,
    ],
    [
      aj1 + hx3pg + hx2pg + hx4pg2,
      aj2 + hy3pg + hy2pg + hy4pg2,
      aj3 + hz3pg + hz2pg + hz4pg2,
      aj4 + hx1pg - hx3pg - hx4pg2,
      aj5 + hy1pg - hy3pg - hy4pg2,
      aj6 + hz1pg - hz3pg - hz4pg2,
      aj7 - hx2pg + hx1pg - hx4pg2,
      aj8 - hy2pg + hy1pg - hy4pg2,
      aj9 - hz2pg + hz1pg - hz4pg2,
    ],
    [
      aj1 + hx3pg + hx2pg + hx4pg2,
      aj2 + hy3pg + hy2pg + hy4pg2,
      aj3 + hz3pg + hz2pg + hz4pg2,
      aj4 + hx1pg + hx3pg + hx4pg2,
      aj5 + hy1pg + hy3pg + hy4pg2,
      aj6 + hz1pg + hz3pg + hz4pg2,
      aj7 + hx2pg + hx1pg + hx4pg2,
      aj8 + hy2pg + hy1pg + hy4pg2,
      aj9 + hz2pg + hz1pg + hz4pg2,
    ],
  ];
}

/** Radioss `s8ederipr3`: DETDP, VOL=WI·DETDP (WI=1), AJI inverse. */
export function s8ederipr3(aj: Aj9): { detdp: number; vol: number; aji: number[] } {
  const [a1, a2, a3, a4, a5, a6, a7, a8, a9] = aj;
  const jac_59_68 = a5 * a9 - a6 * a8;
  const jac_67_49 = a6 * a7 - a4 * a9;
  const jac_38_29 = -a2 * a9 + a3 * a8;
  const jac_19_37 = a1 * a9 - a3 * a7;
  const jac_27_18 = -a1 * a8 + a2 * a7;
  const jac_26_35 = a2 * a6 - a3 * a5;
  const jac_34_16 = -a1 * a6 + a3 * a4;
  const jac_15_24 = a1 * a5 - a2 * a4;
  const jac_48_57 = a4 * a8 - a5 * a7;
  const detdp = ONE_OVER_512 * (a1 * jac_59_68 + a2 * jac_67_49 + a3 * jac_48_57);
  const dett = ONE_OVER_512 / detdp;
  const aji = [
    dett * jac_59_68,
    dett * jac_38_29,
    dett * jac_26_35,
    dett * jac_67_49,
    dett * jac_19_37,
    dett * jac_34_16,
    dett * jac_48_57,
    dett * jac_27_18,
    dett * jac_15_24,
  ];
  return { detdp, vol: W1 * detdp, aji };
}

/**
 * Radioss `s8ederig3`: Cartesian GradN from AJI × PR/PS/PT at one GP.
 * Returns gN[node][xyz] with node order matching CORNERS / IXS.
 */
export function s8ederig3(aji: number[], gp: number): number[][] {
  const pr = PRST[gp]![0]!;
  const ps = PRST[gp]![1]!;
  const pt = PRST[gp]![2]!;
  const aji1 = aji[0]!,
    aji2 = aji[1]!,
    aji3 = aji[2]!,
    aji4 = aji[3]!,
    aji5 = aji[4]!,
    aji6 = aji[5]!,
    aji7 = aji[6]!,
    aji8 = aji[7]!,
    aji9 = aji[8]!;

  const px = new Array<number>(8);
  const py = new Array<number>(8);
  const pz = new Array<number>(8);

  const a1pr1 = aji1 * pr[0]!,
    a1pr3 = aji1 * pr[2]!,
    a1pr5 = aji1 * pr[4]!,
    a1pr7 = aji1 * pr[6]!;
  const a2ps1 = aji2 * ps[0]!,
    a2ps2 = aji2 * ps[1]!,
    a2ps5 = aji2 * ps[4]!,
    a2ps6 = aji2 * ps[5]!;
  const a3pt1 = aji3 * pt[0]!,
    a3pt2 = aji3 * pt[1]!,
    a3pt3 = aji3 * pt[2]!,
    a3pt4 = aji3 * pt[3]!;
  px[0] = a1pr1 + a2ps1 + a3pt1;
  px[1] = -a1pr1 + a2ps2 + a3pt2;
  px[2] = a1pr3 - a2ps2 + a3pt3;
  px[3] = -a1pr3 - a2ps1 + a3pt4;
  px[4] = a1pr5 + a2ps5 - a3pt1;
  px[5] = -a1pr5 + a2ps6 - a3pt2;
  px[6] = a1pr7 - a2ps6 - a3pt3;
  px[7] = -a1pr7 - a2ps5 - a3pt4;

  const a4pr1 = aji4 * pr[0]!,
    a4pr3 = aji4 * pr[2]!,
    a4pr5 = aji4 * pr[4]!,
    a4pr7 = aji4 * pr[6]!;
  const a5ps1 = aji5 * ps[0]!,
    a5ps2 = aji5 * ps[1]!,
    a5ps5 = aji5 * ps[4]!,
    a5ps6 = aji5 * ps[5]!;
  const a6pt1 = aji6 * pt[0]!,
    a6pt2 = aji6 * pt[1]!,
    a6pt3 = aji6 * pt[2]!,
    a6pt4 = aji6 * pt[3]!;
  py[0] = a4pr1 + a5ps1 + a6pt1;
  py[1] = -a4pr1 + a5ps2 + a6pt2;
  py[2] = a4pr3 - a5ps2 + a6pt3;
  py[3] = -a4pr3 - a5ps1 + a6pt4;
  py[4] = a4pr5 + a5ps5 - a6pt1;
  py[5] = -a4pr5 + a5ps6 - a6pt2;
  py[6] = a4pr7 - a5ps6 - a6pt3;
  py[7] = -a4pr7 - a5ps5 - a6pt4;

  const a7pr1 = aji7 * pr[0]!,
    a7pr3 = aji7 * pr[2]!,
    a7pr5 = aji7 * pr[4]!,
    a7pr7 = aji7 * pr[6]!;
  const a8ps1 = aji8 * ps[0]!,
    a8ps2 = aji8 * ps[1]!,
    a8ps5 = aji8 * ps[4]!,
    a8ps6 = aji8 * ps[5]!;
  const a9pt1 = aji9 * pt[0]!,
    a9pt2 = aji9 * pt[1]!,
    a9pt3 = aji9 * pt[2]!,
    a9pt4 = aji9 * pt[3]!;
  pz[0] = a7pr1 + a8ps1 + a9pt1;
  pz[1] = -a7pr1 + a8ps2 + a9pt2;
  pz[2] = a7pr3 - a8ps2 + a9pt3;
  pz[3] = -a7pr3 - a8ps1 + a9pt4;
  pz[4] = a7pr5 + a8ps5 - a9pt1;
  pz[5] = -a7pr5 + a8ps6 - a9pt2;
  pz[6] = a7pr7 - a8ps6 - a9pt3;
  pz[7] = -a7pr7 - a8ps5 - a9pt4;

  return Array.from({ length: 8 }, (_, a) => [px[a]!, py[a]!, pz[a]!]);
}

/** Per-GP hierarchical GradN + VOL for FORINT (`s8ejacip3`→`s8ederipr3`→`s8ederig3`). */
export function hierarchicalGpGeometry(x: Float64Array): { gN: number[][]; vol: number; detdp: number }[] {
  return hierarchicalGpAj(x).map((aj, gp) => {
    const { detdp, vol, aji } = s8ederipr3(aj);
    if (!(detdp > 0)) throw new Error("hex inversion (hierarchical DETDP)");
    return { gN: s8ederig3(aji, gp), vol, detdp };
  });
}

function jacobian(dN: number[][], x: Float64Array): number[] {
  const J = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let a = 0; a < 8; a++) s += x[a * 3 + i]! * dN[a]![j]!;
      J[i * 3 + j] = s;
    }
  }
  return J;
}

export function gatherHex(
  coords: ArrayLike<number>,
  conn: ArrayLike<number>,
  out: Float64Array,
): void {
  for (let a = 0; a < 8; a++) {
    const o = conn[a]! * 3;
    out[a * 3] = coords[o]!;
    out[a * 3 + 1] = coords[o + 1]!;
    out[a * 3 + 2] = coords[o + 2]!;
  }
}

export function hexVolume(x: Float64Array): number {
  let vol = 0;
  for (const sh of SHAPES) vol += mat3Det(jacobian(sh.dN, x)) * W1 * W1 * W1;
  return vol;
}

/**
 * Radioss starter H8C / `S8ZDERIC3` element volume used for lumped mass:
 * `VOL = ONE_OVER_64 * det(AJ)` at the element center (not the 8-GP iso sum).
 * Matches `smass3` `RHO*VOLU*ONE_OVER_8` to Object.is vs live `NODES%MS`.
 */
export function hexVolumeRadiossCenter(x: Float64Array): number {
  const x1 = x[0]!,
    y1 = x[1]!,
    z1 = x[2]!;
  const x2 = x[3]!,
    y2 = x[4]!,
    z2 = x[5]!;
  const x3 = x[6]!,
    y3 = x[7]!,
    z3 = x[8]!;
  const x4 = x[9]!,
    y4 = x[10]!,
    z4 = x[11]!;
  const x5 = x[12]!,
    y5 = x[13]!,
    z5 = x[14]!;
  const x6 = x[15]!,
    y6 = x[16]!,
    z6 = x[17]!;
  const x7 = x[18]!,
    y7 = x[19]!,
    z7 = x[20]!;
  const x8 = x[21]!,
    y8 = x[22]!,
    z8 = x[23]!;

  const x17 = x7 - x1,
    x28 = x8 - x2,
    x35 = x5 - x3,
    x46 = x6 - x4;
  const y17 = y7 - y1,
    y28 = y8 - y2,
    y35 = y5 - y3,
    y46 = y6 - y4;
  const z17 = z7 - z1,
    z28 = z8 - z2,
    z35 = z5 - z3,
    z46 = z6 - z4;

  const jac4 = x17 + x28 - x35 - x46;
  const jac5 = y17 + y28 - y35 - y46;
  const jac6 = z17 + z28 - z35 - z46;
  const x_17_46 = x17 + x46,
    x_28_35 = x28 + x35;
  const y_17_46 = y17 + y46,
    y_28_35 = y28 + y35;
  const z_17_46 = z17 + z46,
    z_28_35 = z28 + z35;
  const jac7 = x_17_46 + x_28_35,
    jac8 = y_17_46 + y_28_35,
    jac9 = z_17_46 + z_28_35;
  const jac1 = x_17_46 - x_28_35,
    jac2 = y_17_46 - y_28_35,
    jac3 = z_17_46 - z_28_35;

  const jac_59_68 = jac5 * jac9 - jac6 * jac8;
  const jac_67_49 = jac6 * jac7 - jac4 * jac9;
  const jac_48_57 = jac4 * jac8 - jac5 * jac7;
  return (1 / 64) * (jac1 * jac_59_68 + jac2 * jac_67_49 + jac3 * jac_48_57);
}

export function hexLumpedNodalMass(x0: Float64Array, density: number): Float64Array {
  // ONE_OVER_8 = 1/8 exact; VOLU from S8ZDERIC3 center Jacobian.
  const share = density * hexVolumeRadiossCenter(x0) * (1 / 8);
  return Float64Array.from({ length: 8 }, () => share);
}

export function createHexGpStates(x0?: Float64Array): J2State[] {
  if (!x0) return Array.from({ length: 8 }, () => createJ2State());
  // Live VOLO from hierarchical DETDP (`s8ederipr3`), not iso det(J).
  return hierarchicalGpGeometry(x0).map((gp) => createJ2State(gp.vol));
}

export function characteristicLength(x0: Float64Array, poisson = 0.35): number {
  // Radioss H8C / LAW2: DELTAX = min_gp(128 * VOL_gp * SMAX) (s8ederi_2);
  // FAC_NU=1 for LAW2 so sz_dt1 is overwritten. Fall back to min edge.
  // `poisson` reserved for optional sz_dt1 blend when FAC_NU<1.
  const hPxc = characteristicLengthPxc(x0, poisson);
  const h = characteristicLengthSmax(x0);
  // Prefer SMAX (LAW2 path); keep PXC available for diagnostics / future FAC_NU.
  if (h > 0 && Number.isFinite(h)) return h;
  if (hPxc > 0 && Number.isFinite(hPxc)) return hPxc;
  let minEdge = Infinity;
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of edges) {
    const dx = x0[a * 3]! - x0[b * 3]!;
    const dy = x0[a * 3 + 1]! - x0[b * 3 + 1]!;
    const dz = x0[a * 3 + 2]! - x0[b * 3 + 2]!;
    minEdge = Math.min(minEdge, Math.hypot(dx, dy, dz));
  }
  return minEdge;
}

/**
 * Radioss `s8ederic3` SMAX (1 / √ max median-face metric) times hierarchical GP
 * volume from `s8ejacip3` + `s8ederipr3` (`DETDP = ONE_OVER_512 · det(AJ)`):
 * DELTAX = 128 * VOL_gp * SMAX  (`s8ederi_2`, WI=1 for 2×2×2).
 *
 * Isoparametric `det(J)` at GPs agrees to ~1 ulp on most hexes; the hierarchical
 * path is required for Object.is on Taylor DT₀ vs live OpenRadioss.
 */
export function characteristicLengthSmax(x: Float64Array): number {
  // Raw cofactors for SMAX (before 1/64 scaling) — Radioss s8ederic3.
  const x1 = x[0]!,
    y1 = x[1]!,
    z1 = x[2]!;
  const x2 = x[3]!,
    y2 = x[4]!,
    z2 = x[5]!;
  const x3 = x[6]!,
    y3 = x[7]!,
    z3 = x[8]!;
  const x4 = x[9]!,
    y4 = x[10]!,
    z4 = x[11]!;
  const x5 = x[12]!,
    y5 = x[13]!,
    z5 = x[14]!;
  const x6 = x[15]!,
    y6 = x[16]!,
    z6 = x[17]!;
  const x7 = x[18]!,
    y7 = x[19]!,
    z7 = x[20]!;
  const x8 = x[21]!,
    y8 = x[22]!,
    z8 = x[23]!;

  const x17 = x7 - x1,
    x28 = x8 - x2,
    x35 = x5 - x3,
    x46 = x6 - x4;
  const y17 = y7 - y1,
    y28 = y8 - y2,
    y35 = y5 - y3,
    y46 = y6 - y4;
  const z17 = z7 - z1,
    z28 = z8 - z2,
    z35 = z5 - z3,
    z46 = z6 - z4;

  const aj4 = x17 + x28 - x35 - x46;
  const aj5 = y17 + y28 - y35 - y46;
  const aj6 = z17 + z28 - z35 - z46;
  const a17 = x17 + x46,
    a28 = x28 + x35;
  const b17 = y17 + y46,
    b28 = y28 + y35;
  const c17 = z17 + z46,
    c28 = z28 + z35;
  const aj7 = a17 + a28,
    aj8 = b17 + b28,
    aj9 = c17 + c28;
  const aj1 = a17 - a28,
    aj2 = b17 - b28,
    aj3 = c17 - c28;

  const jac_59_68 = aj5 * aj9 - aj6 * aj8;
  const jac_67_49 = aj6 * aj7 - aj4 * aj9;
  const jac_48_57 = aj4 * aj8 - aj5 * aj7;
  const jac_38_29 = -aj2 * aj9 + aj3 * aj8;
  const jac_19_37 = aj1 * aj9 - aj3 * aj7;
  const jac_27_18 = -aj1 * aj8 + aj2 * aj7;
  const jac_26_35 = aj2 * aj6 - aj3 * aj5;
  const jac_34_16 = -aj1 * aj6 + aj3 * aj4;
  const jac_15_24 = aj1 * aj5 - aj2 * aj4;

  let s2 =
    jac_59_68 * jac_59_68 + jac_67_49 * jac_67_49 + jac_48_57 * jac_48_57;
  s2 = Math.max(
    s2,
    jac_38_29 * jac_38_29 + jac_19_37 * jac_19_37 + jac_27_18 * jac_27_18,
  );
  s2 = Math.max(
    s2,
    jac_26_35 * jac_26_35 + jac_34_16 * jac_34_16 + jac_15_24 * jac_15_24,
  );
  if (!(s2 > 0)) return 0;
  const smax = 1 / Math.sqrt(s2);

  let minVol = Infinity;
  for (const aj of hierarchicalGpAj(x)) {
    const { vol } = s8ederipr3(aj);
    if (!(vol > 0)) return 0;
    minVol = Math.min(minVol, vol);
  }
  return 128 * minVol * smax;
}

export function characteristicLengthPxc(x: Float64Array, poisson = 0.35): number {
  const gfac = (1 - 2 * poisson) / (1 - poisson);
  if (!(gfac < 1)) return 0;
  const { pxc, pyc, pzc } = meanDilatationOperators(x);
  const pxx = 2 * (pxc[0]! ** 2 + pxc[1]! ** 2 + pxc[2]! ** 2 + pxc[3]! ** 2);
  const pyy = 2 * (pyc[0]! ** 2 + pyc[1]! ** 2 + pyc[2]! ** 2 + pyc[3]! ** 2);
  const pzz = 2 * (pzc[0]! ** 2 + pzc[1]! ** 2 + pzc[2]! ** 2 + pzc[3]! ** 2);
  const pxy = 2 * (pxc[0]! * pyc[0]! + pxc[1]! * pyc[1]! + pxc[2]! * pyc[2]! + pxc[3]! * pyc[3]!);
  const pxz = 2 * (pxc[0]! * pzc[0]! + pxc[1]! * pzc[1]! + pxc[2]! * pzc[2]! + pxc[3]! * pzc[3]!);
  const pyz = 2 * (pyc[0]! * pzc[0]! + pyc[1]! * pzc[1]! + pyc[2]! * pzc[2]! + pyc[3]! * pzc[3]!);
  const aa = -(pxx + pyy + pzz);
  const bb = gfac * (pxx * pyy + pxx * pzz + pyy * pzz - pxy * pxy - pxz * pxz - pyz * pyz);
  const p = bb - (1 / 3) * aa * aa;
  const d = 4 * Math.sqrt((1 / 3) * Math.max(-p, 0)) - (2 / 3) * aa;
  if (!(d > 0)) return 0;
  return 1 / Math.sqrt(d);
}

/** Radioss constant.inc: ZEP3 = 3/10 used in Icpre=1 force splitting. */
const ZEP3 = 0.3;
const ONE_OVER_64 = 1 / 64;

/**
 * Mid-face mean-dilatation operators PXC/PYC/PZC (Radioss `s8ederic3` / `s8zjac_ic`).
 * Four paired-node weights for diagonals (1,7), (2,8), (3,5), (4,6) — 0-based
 * (0,6), (1,7), (2,4), (3,5). `det` is the element Jacobian determinant at the
 * natural-space origin (equals physical volume for a parallelepiped).
 */
export function meanDilatationOperators(x: Float64Array): {
  pxc: [number, number, number, number];
  pyc: [number, number, number, number];
  pzc: [number, number, number, number];
  det: number;
} {
  const x1 = x[0]!,
    y1 = x[1]!,
    z1 = x[2]!;
  const x2 = x[3]!,
    y2 = x[4]!,
    z2 = x[5]!;
  const x3 = x[6]!,
    y3 = x[7]!,
    z3 = x[8]!;
  const x4 = x[9]!,
    y4 = x[10]!,
    z4 = x[11]!;
  const x5 = x[12]!,
    y5 = x[13]!,
    z5 = x[14]!;
  const x6 = x[15]!,
    y6 = x[16]!,
    z6 = x[17]!;
  const x7 = x[18]!,
    y7 = x[19]!,
    z7 = x[20]!;
  const x8 = x[21]!,
    y8 = x[22]!,
    z8 = x[23]!;

  const x17 = x7 - x1,
    x28 = x8 - x2,
    x35 = x5 - x3,
    x46 = x6 - x4;
  const y17 = y7 - y1,
    y28 = y8 - y2,
    y35 = y5 - y3,
    y46 = y6 - y4;
  const z17 = z7 - z1,
    z28 = z8 - z2,
    z35 = z5 - z3,
    z46 = z6 - z4;

  const aj4 = x17 + x28 - x35 - x46;
  const aj5 = y17 + y28 - y35 - y46;
  const aj6 = z17 + z28 - z35 - z46;
  const a17 = x17 + x46,
    a28 = x28 + x35;
  const b17 = y17 + y46,
    b28 = y28 + y35;
  const c17 = z17 + z46,
    c28 = z28 + z35;
  const aj7 = a17 + a28,
    aj8 = b17 + b28,
    aj9 = c17 + c28;
  const aj1 = a17 - a28,
    aj2 = b17 - b28,
    aj3 = c17 - c28;

  const jac_59_68 = aj5 * aj9 - aj6 * aj8;
  const jac_67_49 = aj6 * aj7 - aj4 * aj9;
  const jac_48_57 = aj4 * aj8 - aj5 * aj7;
  const jac_38_29 = -aj2 * aj9 + aj3 * aj8;
  const jac_19_37 = aj1 * aj9 - aj3 * aj7;
  const jac_27_18 = -aj1 * aj8 + aj2 * aj7;
  const jac_26_35 = aj2 * aj6 - aj3 * aj5;
  const jac_34_16 = -aj1 * aj6 + aj3 * aj4;
  const jac_15_24 = aj1 * aj5 - aj2 * aj4;

  const det = ONE_OVER_64 * (aj1 * jac_59_68 + aj2 * jac_67_49 + aj3 * jac_48_57);
  const dett = ONE_OVER_64 / Math.max(det, 1e-30);

  const aji1 = dett * jac_59_68;
  const aji4 = dett * jac_67_49;
  const aji7 = dett * jac_48_57;
  const aji2 = dett * jac_38_29;
  const aji5 = dett * jac_19_37;
  const aji8 = dett * jac_27_18;
  const aji3 = dett * jac_26_35;
  const aji6 = dett * jac_34_16;
  const aji9 = dett * jac_15_24;

  const aj12 = aji1 - aji2;
  const aj45 = aji4 - aji5;
  const aj78 = aji7 - aji8;
  const aj12p = aji1 + aji2;
  const aj45p = aji4 + aji5;
  const aj78p = aji7 + aji8;

  return {
    pxc: [-aj12p - aji3, aj12 - aji3, aj12p - aji3, -aj12 - aji3],
    pyc: [-aj45p - aji6, aj45 - aji6, aj45p - aji6, -aj45 - aji6],
    pzc: [-aj78p - aji9, aj78 - aji9, aj78p - aji9, -aj78 - aji9],
    det,
  };
}

/** Mean dilatation rate from PXC (Radioss `s8edefoc3`). */
export function meanDilatationRate(
  pxc: [number, number, number, number],
  pyc: [number, number, number, number],
  pzc: [number, number, number, number],
  v: Float64Array,
): number {
  // Pairs (0,6), (1,7), (2,4), (3,5)
  return (
    pxc[0]! * (v[0]! - v[18]!) +
    pxc[1]! * (v[3]! - v[21]!) +
    pxc[2]! * (v[6]! - v[12]!) +
    pxc[3]! * (v[9]! - v[15]!) +
    pyc[0]! * (v[1]! - v[19]!) +
    pyc[1]! * (v[4]! - v[22]!) +
    pyc[2]! * (v[7]! - v[13]!) +
    pyc[3]! * (v[10]! - v[16]!) +
    pzc[0]! * (v[2]! - v[20]!) +
    pzc[1]! * (v[5]! - v[23]!) +
    pzc[2]! * (v[8]! - v[14]!) +
    pzc[3]! * (v[11]! - v[17]!)
  );
}

/**
 * Radioss `srepiso3` edge vectors at the natural origin (same combos as PXC aj*).
 * Returns ξ, η, ζ covariant vectors (RX, SX, TX).
 */
export function hexEdgeVectors(x: Float64Array): {
  rx: [number, number, number];
  sx: [number, number, number];
  tx: [number, number, number];
} {
  const x1 = x[0]!,
    y1 = x[1]!,
    z1 = x[2]!;
  const x2 = x[3]!,
    y2 = x[4]!,
    z2 = x[5]!;
  const x3 = x[6]!,
    y3 = x[7]!,
    z3 = x[8]!;
  const x4 = x[9]!,
    y4 = x[10]!,
    z4 = x[11]!;
  const x5 = x[12]!,
    y5 = x[13]!,
    z5 = x[14]!;
  const x6 = x[15]!,
    y6 = x[16]!,
    z6 = x[17]!;
  const x7 = x[18]!,
    y7 = x[19]!,
    z7 = x[20]!;
  const x8 = x[21]!,
    y8 = x[22]!,
    z8 = x[23]!;

  const x17 = x7 - x1,
    x28 = x8 - x2,
    x35 = x5 - x3,
    x46 = x6 - x4;
  const y17 = y7 - y1,
    y28 = y8 - y2,
    y35 = y5 - y3,
    y46 = y6 - y4;
  const z17 = z7 - z1,
    z28 = z8 - z2,
    z35 = z5 - z3,
    z46 = z6 - z4;
  const a17 = x17 + x46,
    a28 = x28 + x35;
  const b17 = y17 + y46,
    b28 = y28 + y35;
  const c17 = z17 + z46,
    c28 = z28 + z35;

  return {
    rx: [x17 + x28 - x35 - x46, y17 + y28 - y35 - y46, z17 + z28 - z35 - z46],
    sx: [a17 + a28, b17 + b28, c17 + c28],
    tx: [a17 - a28, b17 - b28, c17 - c28],
  };
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n === 0) return [0, 0, 0];
  const inv = 1 / n;
  return [v[0] * inv, v[1] * inv, v[2] * inv];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Radioss `sortho3` (NITER=3): orthonormal triad from ξ/η/ζ edge vectors.
 * Returns column-major R = [e1|e2|e3] as 9 doubles (R11,R21,R31, R12,…).
 */
export function hexOrthoR(
  rx: [number, number, number],
  sx: [number, number, number],
  tx: [number, number, number],
): Float64Array {
  let U = normalize3(rx);
  let V = normalize3(sx);
  let W = normalize3(tx);
  for (let n = 0; n < 3; n++) {
    const e1: [number, number, number] = [
      V[1] * W[2] - V[2] * W[1] + U[0],
      V[2] * W[0] - V[0] * W[2] + U[1],
      V[0] * W[1] - V[1] * W[0] + U[2],
    ];
    const e2: [number, number, number] = [
      W[1] * U[2] - W[2] * U[1] + V[0],
      W[2] * U[0] - W[0] * U[2] + V[1],
      W[0] * U[1] - W[1] * U[0] + V[2],
    ];
    const e3: [number, number, number] = [
      U[1] * V[2] - U[2] * V[1] + W[0],
      U[2] * V[0] - U[0] * V[2] + W[1],
      U[0] * V[1] - U[1] * V[0] + W[2],
    ];
    U = normalize3(e1);
    V = normalize3(e2);
    W = normalize3(e3);
  }
  const e1 = U;
  const e3 = normalize3(cross3(e1, V));
  const e2 = cross3(e3, e1);
  // Column-major: e1, e2, e3
  return Float64Array.from([
    e1[0],
    e1[1],
    e1[2],
    e2[0],
    e2[1],
    e2[2],
    e3[0],
    e3[1],
    e3[2],
  ]);
}

/** Radioss `srcoor3` R from current global hex coords (JHBE=17 path). */
export function hexCorotR(x: Float64Array): Float64Array {
  const { rx, sx, tx } = hexEdgeVectors(x);
  return hexOrthoR(rx, sx, tx);
}

/** Apply R or Rᵀ to all 8 nodes. `rT` true → Rᵀ, false → R.
 * Radioss SRCOOR3: x_local = R x_global; SRROTA3 forces: F_global = Rᵀ F_local
 * with R = [e1|e2|e3] (SORTHO3).
 */
export function rotateNodes8(r: Float64Array, src: Float64Array, dst: Float64Array, rT: boolean): void {
  for (let a = 0; a < 8; a++) {
    const ox = src[a * 3]!,
      oy = src[a * 3 + 1]!,
      oz = src[a * 3 + 2]!;
    if (rT) {
      // Rᵀ: (e1·v, e2·v, e3·v)
      dst[a * 3] = r[0]! * ox + r[1]! * oy + r[2]! * oz;
      dst[a * 3 + 1] = r[3]! * ox + r[4]! * oy + r[5]! * oz;
      dst[a * 3 + 2] = r[6]! * ox + r[7]! * oy + r[8]! * oz;
    } else {
      // R: e1*vx + e2*vy + e3*vz
      dst[a * 3] = r[0]! * ox + r[3]! * oy + r[6]! * oz;
      dst[a * 3 + 1] = r[1]! * ox + r[4]! * oy + r[7]! * oz;
      dst[a * 3 + 2] = r[2]! * ox + r[5]! * oy + r[8]! * oz;
    }
  }
}

export interface HexForceOptions {
  /** Mean-dilatation / constant-pressure (Radioss Icpre=1). Default true. */
  constantPressure?: boolean;
  /**
   * Radioss `s8edefo3` DSV correction: adjust each GP `vol0` toward mean
   * dilatation before LAW2 AMU. Default true when `constantPressure` is on.
   */
  dsvVol0?: boolean;
  /**
   * Element-mean AMU for LAW2 pressure (V0_sum/V_sum − 1). Default false —
   * prefer `dsvVol0` (Radioss path). Enable only for experiments.
   */
  meanAmu?: boolean;
  /** Quadratic bulk viscosity qa (Radioss). Default 0. */
  bulkViscQuad?: number;
  /** Linear bulk viscosity qb (Radioss). Default 0. */
  bulkViscLin?: number;
  /**
   * Radioss JCVT: 1 = co-rotational (`SRCOOR3`/`SRROTA3`, no Jaumann).
   * 0 = global + `SROTA3` Jaumann. Default **0** until co-rot residual vs the
   * live Taylor oracle is back under gates (deck is JCVT=1; port still drifts Rf).
   */
  jcvt?: 0 | 1;
}

/**
 * Velocity gradient + rate at one GP, mirroring Radioss `s8edefo3`
 * (`I_SH==0`, `ICP≠11`, `JCVT` path):
 *
 * 1. Off-diagonal Lij as separate left-to-right `P·V` sums (PY*VX, …)
 * 2. Diagonal Lii likewise (PX*VX, …)
 * 3. Engineering shear D4=DXY+DYX (not ½(Lxy+Lyx)) before M2LAW
 *
 * `L` layout matches prior TS: [∂vx/∂x, ∂vx/∂y, ∂vx/∂z, ∂vy/∂x, …].
 * `d` is Radioss (DXX,DYY,DZZ,D4,D5,D6).
 */
export function s8edefo3Rates(
  gN: number[][],
  v: Float64Array,
): { L: number[]; d: Float64Array } {
  const px = [gN[0]![0]!, gN[1]![0]!, gN[2]![0]!, gN[3]![0]!, gN[4]![0]!, gN[5]![0]!, gN[6]![0]!, gN[7]![0]!];
  const py = [gN[0]![1]!, gN[1]![1]!, gN[2]![1]!, gN[3]![1]!, gN[4]![1]!, gN[5]![1]!, gN[6]![1]!, gN[7]![1]!];
  const pz = [gN[0]![2]!, gN[1]![2]!, gN[2]![2]!, gN[3]![2]!, gN[4]![2]!, gN[5]![2]!, gN[6]![2]!, gN[7]![2]!];
  const vx = [v[0]!, v[3]!, v[6]!, v[9]!, v[12]!, v[15]!, v[18]!, v[21]!];
  const vy = [v[1]!, v[4]!, v[7]!, v[10]!, v[13]!, v[16]!, v[19]!, v[22]!];
  const vz = [v[2]!, v[5]!, v[8]!, v[11]!, v[14]!, v[17]!, v[20]!, v[23]!];

  // Off-diagonals first (s8edefo3 I_SH==0 block), left-assoc P*V.
  const dxy =
    py[0]! * vx[0]! +
    py[1]! * vx[1]! +
    py[2]! * vx[2]! +
    py[3]! * vx[3]! +
    py[4]! * vx[4]! +
    py[5]! * vx[5]! +
    py[6]! * vx[6]! +
    py[7]! * vx[7]!;
  const dxz =
    pz[0]! * vx[0]! +
    pz[1]! * vx[1]! +
    pz[2]! * vx[2]! +
    pz[3]! * vx[3]! +
    pz[4]! * vx[4]! +
    pz[5]! * vx[5]! +
    pz[6]! * vx[6]! +
    pz[7]! * vx[7]!;
  const dyx =
    px[0]! * vy[0]! +
    px[1]! * vy[1]! +
    px[2]! * vy[2]! +
    px[3]! * vy[3]! +
    px[4]! * vy[4]! +
    px[5]! * vy[5]! +
    px[6]! * vy[6]! +
    px[7]! * vy[7]!;
  const dyz =
    pz[0]! * vy[0]! +
    pz[1]! * vy[1]! +
    pz[2]! * vy[2]! +
    pz[3]! * vy[3]! +
    pz[4]! * vy[4]! +
    pz[5]! * vy[5]! +
    pz[6]! * vy[6]! +
    pz[7]! * vy[7]!;
  const dzx =
    px[0]! * vz[0]! +
    px[1]! * vz[1]! +
    px[2]! * vz[2]! +
    px[3]! * vz[3]! +
    px[4]! * vz[4]! +
    px[5]! * vz[5]! +
    px[6]! * vz[6]! +
    px[7]! * vz[7]!;
  const dzy =
    py[0]! * vz[0]! +
    py[1]! * vz[1]! +
    py[2]! * vz[2]! +
    py[3]! * vz[3]! +
    py[4]! * vz[4]! +
    py[5]! * vz[5]! +
    py[6]! * vz[6]! +
    py[7]! * vz[7]!;

  const dxx =
    px[0]! * vx[0]! +
    px[1]! * vx[1]! +
    px[2]! * vx[2]! +
    px[3]! * vx[3]! +
    px[4]! * vx[4]! +
    px[5]! * vx[5]! +
    px[6]! * vx[6]! +
    px[7]! * vx[7]!;
  const dyy =
    py[0]! * vy[0]! +
    py[1]! * vy[1]! +
    py[2]! * vy[2]! +
    py[3]! * vy[3]! +
    py[4]! * vy[4]! +
    py[5]! * vy[5]! +
    py[6]! * vy[6]! +
    py[7]! * vy[7]!;
  const dzz =
    pz[0]! * vz[0]! +
    pz[1]! * vz[1]! +
    pz[2]! * vz[2]! +
    pz[3]! * vz[3]! +
    pz[4]! * vz[4]! +
    pz[5]! * vz[5]! +
    pz[6]! * vz[6]! +
    pz[7]! * vz[7]!;

  const L = [dxx, dxy, dxz, dyx, dyy, dyz, dzx, dzy, dzz];
  const d = new Float64Array(6);
  d[0] = dxx;
  d[1] = dyy;
  d[2] = dzz;
  // s8edefo3 JCVT≠0 / ISMDISP: D4=DXY+DYX (engineering), not ½(·).
  d[3] = dxy + dyx;
  d[4] = dyz + dzy;
  d[5] = dxz + dzx;
  return { L, d };
}

/** Returns ∫σ:D dV dt. `fOut` accumulates +∫Bᵀσ dV. */
export function hexInternalForces(args: {
  x: Float64Array;
  v: Float64Array;
  states: J2State[];
  mat: MaterialJ2Linear;
  dt: number;
  fOut: Float64Array;
  options?: HexForceOptions;
}): number {
  const { states, mat, dt, fOut } = args;
  const constantPressure = args.options?.constantPressure !== false;
  const dsvVol0 = args.options?.dsvVol0 ?? constantPressure;
  const meanAmu = args.options?.meanAmu === true;
  const qa = args.options?.bulkViscQuad ?? 0;
  const qb = args.options?.bulkViscLin ?? 0;
  const jcvt = args.options?.jcvt ?? 0;
  fOut.fill(0);
  let dU = 0;

  // JCVT=1: work in co-rotational frame (Radioss SRCOOR3); stresses stay local.
  let x = args.x;
  let v = args.v;
  let R: Float64Array | null = null;
  if (jcvt === 1) {
    R = hexCorotR(args.x);
    const xLoc = new Float64Array(24);
    const vLoc = new Float64Array(24);
    // Radioss: x_local = R x_global (SRROTA3 with R11,R12,R13 / R21,...)
    rotateNodes8(R, args.x, xLoc, false);
    rotateNodes8(R, args.v, vLoc, false);
    x = xLoc;
    v = vLoc;
  }

  type GpCache = {
    detJ: number;
    gN: number[][];
    L: number[];
    d: Float64Array;
    vol: number;
    q: number;
  };
  const cache: GpCache[] = [];
  let volSum = 0;

  const pxcOps = constantPressure || dsvVol0 ? meanDilatationOperators(x) : null;
  const dsv =
    dsvVol0 && pxcOps
      ? meanDilatationRate(pxcOps.pxc, pxcOps.pyc, pxcOps.pzc, v)
      : 0;

  // Hierarchical AJ GradN + DETDP (s8ejacip3 → s8ederipr3 → s8ederig3).
  const hier = hierarchicalGpGeometry(x);

  for (let gp = 0; gp < 8; gp++) {
    const { gN, vol, detdp } = hier[gp]!;
    const { L, d } = s8edefo3Rates(gN, v);

    cache.push({ detJ: detdp, gN, L, d, vol, q: 0 });
    volSum += vol;
  }

  const { mu, bulk } = lame(mat.young, mat.poisson);
  // Radioss mqviscb / m2law: SSP = sqrt((ONEP333·G + K)/ρ₀) with ONEP333=1.333
  const ssp = Math.sqrt((RADIOSS_ONEP333 * mu + bulk) / mat.density);
  let vol0Sum = 0;
  for (let gp = 0; gp < 8; gp++) vol0Sum += states[gp]!.vol0;
  // Optional element-mean AMU; Radioss path uses DSV vol0 correction instead.
  const amuElem =
    meanAmu && vol0Sum > 0 ? vol0Sum / Math.max(volSum, 1e-30) - 1 : undefined;

  // Radioss TOL = 1 - EM20: reject only catastrophic positive DV.
  const dsvTol = 1 - 1e-20;

  for (let gp = 0; gp < 8; gp++) {
    const gpCache = cache[gp]!;
    const { L, d, vol } = gpCache;

    // Radioss H8C (Icpre=1) keeps GP strain rates; mean pressure is selectively
    // re-assembled via s8efmoy3 (ZEP3) + s8zfintp3 (PXC).
    const trD = d[0]! + d[1]! + d[2]!;
    const state = states[gp]!;
    if (dsvVol0 && state.vol0 > 0) {
      // s8edefo3 ICP=1: DV = (DSV - trD)*dt; VOLO *= (1-DV) unless DV > TOL.
      let dv = (dsv - trD) * dt;
      if (dv > dsvTol) dv = 0;
      state.vol0 *= 1 - dv;
    }

    // mqviscb: QVIS = ρ·AD·AL·(QA²·AD·AL + QB·SSP), AL=VOL^{1/3}, AD=max(0,-trD)
    const al = Math.cbrt(Math.max(vol, 0));
    const ad = Math.max(0, -trD);
    const rho = mat.density * (state.vol0 / Math.max(vol, 1e-30));
    gpCache.q = rho * ad * al * (qa * qa * ad * al + qb * ssp);

    const sigma = state.stress;
    if (jcvt === 0) {
      // Radioss SROTA3 Jaumann (JCVT=0): Wα = (dt/2)*(∂vβ/∂xγ − ∂vγ/∂xβ)
      const wzz = 0.5 * dt * (L[3]! - L[1]!);
      const wyy = 0.5 * dt * (L[2]! - L[6]!);
      const wxx = 0.5 * dt * (L[7]! - L[5]!);
      const s1 = sigma[0]!,
        s2 = sigma[1]!,
        s3 = sigma[2]!,
        s4 = sigma[3]!,
        s5 = sigma[4]!,
        s6 = sigma[5]!;
      const q1 = 2 * s4 * wzz;
      const q2 = 2 * s6 * wyy;
      const q3 = 2 * s5 * wxx;
      sigma[0] = s1 - q1 + q2;
      sigma[1] = s2 + q1 - q3;
      sigma[2] = s3 - q2 + q3;
      sigma[3] = s4 + wzz * (s1 - s2) + wyy * s5 - wxx * s6;
      sigma[4] = s5 + wxx * (s2 - s3) + wzz * s6 - wyy * s4;
      sigma[5] = s6 + wyy * (s3 - s1) + wxx * s4 - wzz * s5;
    }
    // JCVT=1: CSMALL3 — stresses already in co-rot frame; no objective rate.

    j2Update(mat, state, d, dt, vol, amuElem);
  }

  // Volume-weighted mean pressure (Radioss s8efmoy3 with ICP=1).
  let pp = 0;

  for (let gp = 0; gp < 8; gp++) {
    const { gN, d, vol, q } = cache[gp]!;
    const sigma = states[gp]!.stress;
    // s8efint3 ICP=1: ZEP3 strip uses raw SIG (QVIS not folded in); QVIS
    // enters mean PP only via s8efmoy3: PP += FAC*(ZEP3*tr(σ) - QVIS).
    let s0 = sigma[0]!;
    let s1 = sigma[1]!;
    let s2 = sigma[2]!;
    const s3 = sigma[3]!;
    const s4 = sigma[4]!;
    const s5 = sigma[5]!;

    // M2LAW EINC uses D4*σ4 with engineering D (no factor 2).
    dU +=
      ((s0 - q) * d[0]! +
        (s1 - q) * d[1]! +
        (s2 - q) * d[2]! +
        s3 * d[3]! +
        s4 * d[4]! +
        s5 * d[5]!) *
      vol *
      dt;

    if (constantPressure && pxcOps) {
      const pLoc = ZEP3 * (s0 + s1 + s2);
      pp += (vol / Math.max(volSum, 1e-30)) * (pLoc - q);
      s0 -= pLoc;
      s1 -= pLoc;
      s2 -= pLoc;
    } else {
      s0 -= q;
      s1 -= q;
      s2 -= q;
    }

    for (let a = 0; a < 8; a++) {
      const gx = gN[a]![0]!,
        gy = gN[a]![1]!,
        gz = gN[a]![2]!;
      fOut[a * 3]! += (s0 * gx + s3 * gy + s5 * gz) * vol;
      fOut[a * 3 + 1]! += (s3 * gx + s1 * gy + s4 * gz) * vol;
      fOut[a * 3 + 2]! += (s5 * gx + s4 * gy + s2 * gz) * vol;
    }
  }

  if (constantPressure && pxcOps) {
    // s8zfintp3: SP = PP * VOLG; our fOut is +f_int so signs flip vs Radioss F.
    const { pxc, pyc, pzc } = pxcOps;
    const sp = pp * volSum;
    const pairs: [number, number, number][] = [
      [0, 6, 0],
      [1, 7, 1],
      [2, 4, 2],
      [3, 5, 3],
    ];
    for (const [a, b, k] of pairs) {
      const sx = sp * pxc[k]!;
      const sy = sp * pyc[k]!;
      const sz = sp * pzc[k]!;
      fOut[a * 3]! += sx;
      fOut[a * 3 + 1]! += sy;
      fOut[a * 3 + 2]! += sz;
      fOut[b * 3]! -= sx;
      fOut[b * 3 + 1]! -= sy;
      fOut[b * 3 + 2]! -= sz;
    }
  }

  // JCVT=1: SRROTA3 — F_global = Rᵀ F_local
  if (R) {
    const fLoc = Float64Array.from(fOut);
    rotateNodes8(R, fLoc, fOut, true);
  }

  return dU;
}
