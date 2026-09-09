#include "force_kernel.h"

#include <math.h>
#include <string.h>

/* Radioss s8eprst_ini PG=.577350269189625D0 (not 1/√3). */
static const double PG = 0.577350269189625;
static const double W1 = 1.0;
/* Radioss constant.inc ZEP3 = 3/10 used in Icpre=1 force splitting. */
static const double ZEP3 = 0.3;
static const double ONE_OVER_64 = 1.0 / 64.0;
static const double ONE_OVER_512 = 1.0 / 512.0;

/* Defaults matching hexInternalForces options. */
static const int CONSTANT_PRESSURE = 1;
static const int DSV_VOL0 = 1;
static const int MEAN_AMU = 0;
static const double QA = 0.0;
static const double QB = 0.0;

/* CORNERS node order — same as hex.ts */
static const double CORNERS[8][3] = {
    {-1, -1, -1},
    {1, -1, -1},
    {1, 1, -1},
    {-1, 1, -1},
    {-1, -1, 1},
    {1, -1, 1},
    {1, 1, 1},
    {-1, 1, 1},
};

/* RADIOSS_GAUSS: ξ fastest, then η, then ζ */
static const double RADIOSS_GAUSS[8][3] = {
    {-PG, -PG, -PG},
    {PG, -PG, -PG},
    {-PG, PG, -PG},
    {PG, PG, -PG},
    {-PG, -PG, PG},
    {PG, -PG, PG},
    {-PG, PG, PG},
    {PG, PG, PG},
};

/* Precomputed dN[gp][node][3] — built once on first call. */
static double SHAPES_DN[8][8][3];
static int shapes_ready = 0;

static void ensure_shapes(void) {
  int gp, a;
  if (shapes_ready) return;
  for (gp = 0; gp < 8; gp++) {
    double xi = RADIOSS_GAUSS[gp][0];
    double eta = RADIOSS_GAUSS[gp][1];
    double zeta = RADIOSS_GAUSS[gp][2];
    for (a = 0; a < 8; a++) {
      double c0 = CORNERS[a][0];
      double c1 = CORNERS[a][1];
      double c2 = CORNERS[a][2];
      SHAPES_DN[gp][a][0] = 0.125 * c0 * (1.0 + c1 * eta) * (1.0 + c2 * zeta);
      SHAPES_DN[gp][a][1] = 0.125 * c1 * (1.0 + c0 * xi) * (1.0 + c2 * zeta);
      SHAPES_DN[gp][a][2] = 0.125 * c2 * (1.0 + c0 * xi) * (1.0 + c1 * eta);
    }
  }
  shapes_ready = 1;
}

/* math3.ts mat3Det — row-major 3×3 */
static double mat3_det(const double m[9]) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) -
         m[1] * (m[3] * m[8] - m[5] * m[6]) +
         m[2] * (m[3] * m[7] - m[4] * m[6]);
}

/* math3.ts mat3Inverse — caller guarantees |det| >= 1e-30 */
static void mat3_inverse(const double m[9], double inv_out[9]) {
  double det = mat3_det(m);
  double inv = 1.0 / det;
  inv_out[0] = (m[4] * m[8] - m[5] * m[7]) * inv;
  inv_out[1] = (m[2] * m[7] - m[1] * m[8]) * inv;
  inv_out[2] = (m[1] * m[5] - m[2] * m[4]) * inv;
  inv_out[3] = (m[5] * m[6] - m[3] * m[8]) * inv;
  inv_out[4] = (m[0] * m[8] - m[2] * m[6]) * inv;
  inv_out[5] = (m[2] * m[3] - m[0] * m[5]) * inv;
  inv_out[6] = (m[3] * m[7] - m[4] * m[6]) * inv;
  inv_out[7] = (m[1] * m[6] - m[0] * m[7]) * inv;
  inv_out[8] = (m[0] * m[4] - m[1] * m[3]) * inv;
}

static void jacobian(const double dN[8][3], const double x[24], double J[9]) {
  int i, j, a;
  for (i = 0; i < 3; i++) {
    for (j = 0; j < 3; j++) {
      double s = 0.0;
      for (a = 0; a < 8; a++) s += x[a * 3 + i] * dN[a][j];
      J[i * 3 + j] = s;
    }
  }
}

static void grad_N(const double dN[8][3], const double Jinv[9], double gN[8][3]) {
  int a;
  for (a = 0; a < 8; a++) {
    const double *dn = dN[a];
    gN[a][0] = Jinv[0] * dn[0] + Jinv[3] * dn[1] + Jinv[6] * dn[2];
    gN[a][1] = Jinv[1] * dn[0] + Jinv[4] * dn[1] + Jinv[7] * dn[2];
    gN[a][2] = Jinv[2] * dn[0] + Jinv[5] * dn[1] + Jinv[8] * dn[2];
  }
}

/* OpenRadioss ONEP333 = 1.333 (not exact 4/3) — matches materialJ2.ts */
#define RADIOSS_ONEP333 1.333

/* materialJ2.ts lame — bulk = E/(3*(1-2ν)) like hm_read_mat02_jc */
static void lame(double E, double nu, double *lam, double *mu, double *bulk) {
  *lam = (E * nu) / ((1.0 + nu) * (1.0 - 2.0 * nu));
  *mu = E / (2.0 * (1.0 + nu));
  *bulk = E / (3.0 * (1.0 - 2.0 * nu));
}

/* materialJ2.ts j2Update */
static void j2_update(
    const WmbdMat *mat,
    double stress[6],
    double *eqps,
    double vol0,
    const double d[6],
    double dt,
    double vol,
    int have_amu_override,
    double amu_override) {
  double lam, mu, bulk;
  double pOld, dav, g1, g2;
  double j2, seq, ca, cb, ak, qh;
  double vol0_eff, amu, pNew;

  lame(mat->young, mat->poisson, &lam, &mu, &bulk);
  (void)lam;

  pOld = -(stress[0] + stress[1] + stress[2]) / 3.0;
  dav = -(d[0] + d[1] + d[2]) / 3.0;
  g1 = dt * mu;
  g2 = 2.0 * g1;

  stress[0] += pOld + g2 * (d[0] + dav);
  stress[1] += pOld + g2 * (d[1] + dav);
  stress[2] += pOld + g2 * (d[2] + dav);
  /* Engineering D4..D6: M2LAW uses G1*D4, not G2*ε_xy */
  stress[3] += g1 * d[3];
  stress[4] += g1 * d[4];
  stress[5] += g1 * d[5];

  j2 = 0.5 * (stress[0] * stress[0] + stress[1] * stress[1] + stress[2] * stress[2]) +
       stress[3] * stress[3] + stress[4] * stress[4] + stress[5] * stress[5];
  seq = sqrt(fmax(0.0, 3.0 * j2));

  ca = mat->yield_stress;
  cb = mat->hardening;
  ak = ca + cb * (*eqps);
  qh = cb;

  if (seq > ak && seq > 1e-15) {
    double scale = fmin(1.0, ak / seq);
    double dpla = (1.0 - scale) * seq / fmax(3.0 * mu + qh, 1e-15);
    ak = ak + dpla * qh;
    scale = fmin(1.0, ak / fmax(seq, 1e-15));
    stress[0] *= scale;
    stress[1] *= scale;
    stress[2] *= scale;
    stress[3] *= scale;
    stress[4] *= scale;
    stress[5] *= scale;
    *eqps += dpla;
  }

  vol0_eff = vol0 > 0.0 ? vol0 : vol;
  if (have_amu_override) {
    amu = amu_override;
  } else {
    amu = vol0_eff / fmax(vol, 1e-30) - 1.0;
  }
  pNew = bulk * amu;
  stress[0] -= pNew;
  stress[1] -= pNew;
  stress[2] -= pNew;
}

typedef struct {
  double pxc[4];
  double pyc[4];
  double pzc[4];
  double det;
} MeanDilOps;

/* hex.ts meanDilatationOperators */
static MeanDilOps mean_dilatation_operators(const double x[24]) {
  MeanDilOps o;
  double x1 = x[0], y1 = x[1], z1 = x[2];
  double x2 = x[3], y2 = x[4], z2 = x[5];
  double x3 = x[6], y3 = x[7], z3 = x[8];
  double x4 = x[9], y4 = x[10], z4 = x[11];
  double x5 = x[12], y5 = x[13], z5 = x[14];
  double x6 = x[15], y6 = x[16], z6 = x[17];
  double x7 = x[18], y7 = x[19], z7 = x[20];
  double x8 = x[21], y8 = x[22], z8 = x[23];

  double x17 = x7 - x1, x28 = x8 - x2, x35 = x5 - x3, x46 = x6 - x4;
  double y17 = y7 - y1, y28 = y8 - y2, y35 = y5 - y3, y46 = y6 - y4;
  double z17 = z7 - z1, z28 = z8 - z2, z35 = z5 - z3, z46 = z6 - z4;

  double aj4 = x17 + x28 - x35 - x46;
  double aj5 = y17 + y28 - y35 - y46;
  double aj6 = z17 + z28 - z35 - z46;
  double a17 = x17 + x46, a28 = x28 + x35;
  double b17 = y17 + y46, b28 = y28 + y35;
  double c17 = z17 + z46, c28 = z28 + z35;
  double aj7 = a17 + a28, aj8 = b17 + b28, aj9 = c17 + c28;
  double aj1 = a17 - a28, aj2 = b17 - b28, aj3 = c17 - c28;

  double jac_59_68 = aj5 * aj9 - aj6 * aj8;
  double jac_67_49 = aj6 * aj7 - aj4 * aj9;
  double jac_48_57 = aj4 * aj8 - aj5 * aj7;
  double jac_38_29 = -aj2 * aj9 + aj3 * aj8;
  double jac_19_37 = aj1 * aj9 - aj3 * aj7;
  double jac_27_18 = -aj1 * aj8 + aj2 * aj7;
  double jac_26_35 = aj2 * aj6 - aj3 * aj5;
  double jac_34_16 = -aj1 * aj6 + aj3 * aj4;
  double jac_15_24 = aj1 * aj5 - aj2 * aj4;

  double det = ONE_OVER_64 * (aj1 * jac_59_68 + aj2 * jac_67_49 + aj3 * jac_48_57);
  double dett = ONE_OVER_64 / fmax(det, 1e-30);

  double aji1 = dett * jac_59_68;
  double aji4 = dett * jac_67_49;
  double aji7 = dett * jac_48_57;
  double aji2 = dett * jac_38_29;
  double aji5 = dett * jac_19_37;
  double aji8 = dett * jac_27_18;
  double aji3 = dett * jac_26_35;
  double aji6 = dett * jac_34_16;
  double aji9 = dett * jac_15_24;

  double aj12 = aji1 - aji2;
  double aj45 = aji4 - aji5;
  double aj78 = aji7 - aji8;
  double aj12p = aji1 + aji2;
  double aj45p = aji4 + aji5;
  double aj78p = aji7 + aji8;

  o.pxc[0] = -aj12p - aji3;
  o.pxc[1] = aj12 - aji3;
  o.pxc[2] = aj12p - aji3;
  o.pxc[3] = -aj12 - aji3;
  o.pyc[0] = -aj45p - aji6;
  o.pyc[1] = aj45 - aji6;
  o.pyc[2] = aj45p - aji6;
  o.pyc[3] = -aj45 - aji6;
  o.pzc[0] = -aj78p - aji9;
  o.pzc[1] = aj78 - aji9;
  o.pzc[2] = aj78p - aji9;
  o.pzc[3] = -aj78 - aji9;
  o.det = det;
  return o;
}

/* hex.ts meanDilatationRate */
static double mean_dilatation_rate(const MeanDilOps *ops, const double v[24]) {
  const double *pxc = ops->pxc;
  const double *pyc = ops->pyc;
  const double *pzc = ops->pzc;
  return pxc[0] * (v[0] - v[18]) + pxc[1] * (v[3] - v[21]) + pxc[2] * (v[6] - v[12]) +
         pxc[3] * (v[9] - v[15]) + pyc[0] * (v[1] - v[19]) + pyc[1] * (v[4] - v[22]) +
         pyc[2] * (v[7] - v[13]) + pyc[3] * (v[10] - v[16]) + pzc[0] * (v[2] - v[20]) +
         pzc[1] * (v[5] - v[23]) + pzc[2] * (v[8] - v[14]) + pzc[3] * (v[11] - v[17]);
}

typedef struct {
  double detJ;
  double gN[8][3];
  double L[9];
  double d[6];
  double vol;
  double q;
} GpCache;

static void normalize3(double v[3]) {
  double n = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (n != 0.0) {
    double inv = 1.0 / n;
    v[0] *= inv;
    v[1] *= inv;
    v[2] *= inv;
  }
}

static void hex_corot_R(const double x[24], double R[9]) {
  double x1 = x[0], y1 = x[1], z1 = x[2];
  double x2 = x[3], y2 = x[4], z2 = x[5];
  double x3 = x[6], y3 = x[7], z3 = x[8];
  double x4 = x[9], y4 = x[10], z4 = x[11];
  double x5 = x[12], y5 = x[13], z5 = x[14];
  double x6 = x[15], y6 = x[16], z6 = x[17];
  double x7 = x[18], y7 = x[19], z7 = x[20];
  double x8 = x[21], y8 = x[22], z8 = x[23];
  double x17 = x7 - x1, x28 = x8 - x2, x35 = x5 - x3, x46 = x6 - x4;
  double y17 = y7 - y1, y28 = y8 - y2, y35 = y5 - y3, y46 = y6 - y4;
  double z17 = z7 - z1, z28 = z8 - z2, z35 = z5 - z3, z46 = z6 - z4;
  double a17 = x17 + x46, a28 = x28 + x35;
  double b17 = y17 + y46, b28 = y28 + y35;
  double c17 = z17 + z46, c28 = z28 + z35;
  double U[3], V[3], W[3];
  double e1[3], e2[3], e3[3];
  int n;

  U[0] = x17 + x28 - x35 - x46;
  U[1] = y17 + y28 - y35 - y46;
  U[2] = z17 + z28 - z35 - z46;
  V[0] = a17 + a28;
  V[1] = b17 + b28;
  V[2] = c17 + c28;
  W[0] = a17 - a28;
  W[1] = b17 - b28;
  W[2] = c17 - c28;
  normalize3(U);
  normalize3(V);
  normalize3(W);
  for (n = 0; n < 3; n++) {
    e1[0] = V[1] * W[2] - V[2] * W[1] + U[0];
    e1[1] = V[2] * W[0] - V[0] * W[2] + U[1];
    e1[2] = V[0] * W[1] - V[1] * W[0] + U[2];
    e2[0] = W[1] * U[2] - W[2] * U[1] + V[0];
    e2[1] = W[2] * U[0] - W[0] * U[2] + V[1];
    e2[2] = W[0] * U[1] - W[1] * U[0] + V[2];
    e3[0] = U[1] * V[2] - U[2] * V[1] + W[0];
    e3[1] = U[2] * V[0] - U[0] * V[2] + W[1];
    e3[2] = U[0] * V[1] - U[1] * V[0] + W[2];
    U[0] = e1[0]; U[1] = e1[1]; U[2] = e1[2];
    V[0] = e2[0]; V[1] = e2[1]; V[2] = e2[2];
    W[0] = e3[0]; W[1] = e3[1]; W[2] = e3[2];
    normalize3(U);
    normalize3(V);
    normalize3(W);
  }
  e1[0] = U[0]; e1[1] = U[1]; e1[2] = U[2];
  e3[0] = e1[1] * V[2] - e1[2] * V[1];
  e3[1] = e1[2] * V[0] - e1[0] * V[2];
  e3[2] = e1[0] * V[1] - e1[1] * V[0];
  normalize3(e3);
  e2[0] = e3[1] * e1[2] - e3[2] * e1[1];
  e2[1] = e3[2] * e1[0] - e3[0] * e1[2];
  e2[2] = e3[0] * e1[1] - e3[1] * e1[0];
  R[0] = e1[0]; R[1] = e1[1]; R[2] = e1[2];
  R[3] = e2[0]; R[4] = e2[1]; R[5] = e2[2];
  R[6] = e3[0]; R[7] = e3[1]; R[8] = e3[2];
}

static void rotate_nodes8(const double R[9], const double src[24], double dst[24], int rT) {
  int a;
  for (a = 0; a < 8; a++) {
    double ox = src[a * 3], oy = src[a * 3 + 1], oz = src[a * 3 + 2];
    if (rT) {
      dst[a * 3] = R[0] * ox + R[1] * oy + R[2] * oz;
      dst[a * 3 + 1] = R[3] * ox + R[4] * oy + R[5] * oz;
      dst[a * 3 + 2] = R[6] * ox + R[7] * oy + R[8] * oz;
    } else {
      dst[a * 3] = R[0] * ox + R[3] * oy + R[6] * oz;
      dst[a * 3 + 1] = R[1] * ox + R[4] * oy + R[7] * oz;
      dst[a * 3 + 2] = R[2] * ox + R[5] * oy + R[8] * oz;
    }
  }
}


/* Radioss s8eprst_ini PR/PS/PT at 8 GPs (RADIOSS_GAUSS order). */
static void fill_prst(double pr[8][8], double ps[8][8], double pt[8][8]) {
  static const double GAUSS[8][3] = {
      {-PG, -PG, -PG}, {PG, -PG, -PG}, {-PG, PG, -PG}, {PG, PG, -PG},
      {-PG, -PG, PG},  {PG, -PG, PG},  {-PG, PG, PG},  {PG, PG, PG},
  };
  int ip, a;
  for (ip = 0; ip < 8; ip++) {
    double ksi = GAUSS[ip][0], eta = GAUSS[ip][1], zeta = GAUSS[ip][2];
    double etazeta = eta * zeta, ksizeta = ksi * zeta, ksieta = ksi * eta;
    pr[ip][0] = -(1.0 - eta - zeta + etazeta);
    pr[ip][1] = -pr[ip][0];
    pr[ip][2] = 1.0 + eta - zeta - etazeta;
    pr[ip][3] = -pr[ip][2];
    pr[ip][4] = -(1.0 - eta + zeta - etazeta);
    pr[ip][5] = -pr[ip][4];
    pr[ip][6] = 1.0 + eta + zeta + etazeta;
    pr[ip][7] = -pr[ip][6];
    ps[ip][0] = -(1.0 - ksi - zeta + ksizeta);
    ps[ip][1] = -(1.0 + ksi - zeta - ksizeta);
    ps[ip][2] = -ps[ip][1];
    ps[ip][3] = -ps[ip][0];
    ps[ip][4] = -(1.0 - ksi + zeta - ksizeta);
    ps[ip][5] = -(1.0 + ksi + zeta + ksizeta);
    ps[ip][6] = -ps[ip][5];
    ps[ip][7] = -ps[ip][4];
    pt[ip][0] = -(1.0 - ksi - eta + ksieta);
    pt[ip][1] = -(1.0 + ksi - eta - ksieta);
    pt[ip][2] = -(1.0 + ksi + eta + ksieta);
    pt[ip][3] = -(1.0 - ksi + eta - ksieta);
    pt[ip][4] = -pt[ip][0];
    pt[ip][5] = -pt[ip][1];
    pt[ip][6] = -pt[ip][2];
    pt[ip][7] = -pt[ip][3];
  }
  (void)a;
}

/* s8ejacip3 hierarchical GP AJ (9 components × 8 GPs). */
static void hierarchical_gp_aj(const double x[24], double aj[8][9]) {
  double x1 = x[0], y1 = x[1], z1 = x[2];
  double x2 = x[3], y2 = x[4], z2 = x[5];
  double x3 = x[6], y3 = x[7], z3 = x[8];
  double x4 = x[9], y4 = x[10], z4 = x[11];
  double x5 = x[12], y5 = x[13], z5 = x[14];
  double x6 = x[15], y6 = x[16], z6 = x[17];
  double x7 = x[18], y7 = x[19], z7 = x[20];
  double x8 = x[21], y8 = x[22], z8 = x[23];
  double x17 = x7 - x1, x28 = x8 - x2, x35 = x5 - x3, x46 = x6 - x4;
  double y17 = y7 - y1, y28 = y8 - y2, y35 = y5 - y3, y46 = y6 - y4;
  double z17 = z7 - z1, z28 = z8 - z2, z35 = z5 - z3, z46 = z6 - z4;
  double aj4 = x17 + x28 - x35 - x46;
  double aj5 = y17 + y28 - y35 - y46;
  double aj6 = z17 + z28 - z35 - z46;
  double a17 = x17 + x46, a28 = x28 + x35;
  double b17 = y17 + y46, b28 = y28 + y35;
  double c17 = z17 + z46, c28 = z28 + z35;
  double cj7 = a17 + a28, cj8 = b17 + b28, cj9 = c17 + c28;
  double cj1 = a17 - a28, cj2 = b17 - b28, cj3 = c17 - c28;
  double hx1 = x1 + x2 - x3 - x4 - x5 - x6 + x7 + x8;
  double hy1 = y1 + y2 - y3 - y4 - y5 - y6 + y7 + y8;
  double hz1 = z1 + z2 - z3 - z4 - z5 - z6 + z7 + z8;
  double hx2 = x1 - x2 - x3 + x4 - x5 + x6 + x7 - x8;
  double hy2 = y1 - y2 - y3 + y4 - y5 + y6 + y7 - y8;
  double hz2 = z1 - z2 - z3 + z4 - z5 + z6 + z7 - z8;
  double hx3 = x1 - x2 + x3 - x4 + x5 - x6 + x7 - x8;
  double hy3 = y1 - y2 + y3 - y4 + y5 - y6 + y7 - y8;
  double hz3 = z1 - z2 + z3 - z4 + z5 - z6 + z7 - z8;
  double hx4 = -x1 + x2 - x3 + x4 + x5 - x6 + x7 - x8;
  double hy4 = -y1 + y2 - y3 + y4 + y5 - y6 + y7 - y8;
  double hz4 = -z1 + z2 - z3 + z4 + z5 - z6 + z7 - z8;
  double pg2 = PG * PG;
  double hx1pg = hx1 * PG, hx2pg = hx2 * PG, hx3pg = hx3 * PG, hx4pg2 = hx4 * pg2;
  double hy1pg = hy1 * PG, hy2pg = hy2 * PG, hy3pg = hy3 * PG, hy4pg2 = hy4 * pg2;
  double hz1pg = hz1 * PG, hz2pg = hz2 * PG, hz3pg = hz3 * PG, hz4pg2 = hz4 * pg2;
  /* IP=1..8 signs match s8ejacip3 / hex.ts hierarchicalGpAj */
  #define SETAJ(ip, s1,s2,s3, s4,s5,s6, s7,s8,s9) do { \
    aj[ip][0]=cj1+(s1); aj[ip][1]=cj2+(s2); aj[ip][2]=cj3+(s3); \
    aj[ip][3]=aj4+(s4); aj[ip][4]=aj5+(s5); aj[ip][5]=aj6+(s6); \
    aj[ip][6]=cj7+(s7); aj[ip][7]=cj8+(s8); aj[ip][8]=cj9+(s9); \
  } while (0)
  SETAJ(0, -hx3pg-hx2pg+hx4pg2, -hy3pg-hy2pg+hy4pg2, -hz3pg-hz2pg+hz4pg2,
           -hx1pg-hx3pg+hx4pg2, -hy1pg-hy3pg+hy4pg2, -hz1pg-hz3pg+hz4pg2,
           -hx2pg-hx1pg+hx4pg2, -hy2pg-hy1pg+hy4pg2, -hz2pg-hz1pg+hz4pg2);
  SETAJ(1, -hx3pg-hx2pg+hx4pg2, -hy3pg-hy2pg+hy4pg2, -hz3pg-hz2pg+hz4pg2,
           -hx1pg+hx3pg-hx4pg2, -hy1pg+hy3pg-hy4pg2, -hz1pg+hz3pg-hz4pg2,
           +hx2pg-hx1pg-hx4pg2, +hy2pg-hy1pg-hy4pg2, +hz2pg-hz1pg-hz4pg2);
  SETAJ(2, +hx3pg-hx2pg-hx4pg2, +hy3pg-hy2pg-hy4pg2, +hz3pg-hz2pg-hz4pg2,
           -hx1pg-hx3pg+hx4pg2, -hy1pg-hy3pg+hy4pg2, -hz1pg-hz3pg+hz4pg2,
           -hx2pg+hx1pg-hx4pg2, -hy2pg+hy1pg-hy4pg2, -hz2pg+hz1pg-hz4pg2);
  SETAJ(3, +hx3pg-hx2pg-hx4pg2, +hy3pg-hy2pg-hy4pg2, +hz3pg-hz2pg-hz4pg2,
           -hx1pg+hx3pg-hx4pg2, -hy1pg+hy3pg-hy4pg2, -hz1pg+hz3pg-hz4pg2,
           +hx2pg+hx1pg+hx4pg2, +hy2pg+hy1pg+hy4pg2, +hz2pg+hz1pg+hz4pg2);
  SETAJ(4, -hx3pg+hx2pg-hx4pg2, -hy3pg+hy2pg-hy4pg2, -hz3pg+hz2pg-hz4pg2,
           +hx1pg-hx3pg-hx4pg2, +hy1pg-hy3pg-hy4pg2, +hz1pg-hz3pg-hz4pg2,
           -hx2pg-hx1pg+hx4pg2, -hy2pg-hy1pg+hy4pg2, -hz2pg-hz1pg+hz4pg2);
  SETAJ(5, -hx3pg+hx2pg-hx4pg2, -hy3pg+hy2pg-hy4pg2, -hz3pg+hz2pg-hz4pg2,
           +hx1pg+hx3pg+hx4pg2, +hy1pg+hy3pg+hy4pg2, +hz1pg+hz3pg+hz4pg2,
           +hx2pg-hx1pg-hx4pg2, +hy2pg-hy1pg-hy4pg2, +hz2pg-hz1pg-hz4pg2);
  SETAJ(6, +hx3pg+hx2pg+hx4pg2, +hy3pg+hy2pg+hy4pg2, +hz3pg+hz2pg+hz4pg2,
           +hx1pg-hx3pg-hx4pg2, +hy1pg-hy3pg-hy4pg2, +hz1pg-hz3pg-hz4pg2,
           -hx2pg+hx1pg-hx4pg2, -hy2pg+hy1pg-hy4pg2, -hz2pg+hz1pg-hz4pg2);
  SETAJ(7, +hx3pg+hx2pg+hx4pg2, +hy3pg+hy2pg+hy4pg2, +hz3pg+hz2pg+hz4pg2,
           +hx1pg+hx3pg+hx4pg2, +hy1pg+hy3pg+hy4pg2, +hz1pg+hz3pg+hz4pg2,
           +hx2pg+hx1pg+hx4pg2, +hy2pg+hy1pg+hy4pg2, +hz2pg+hz1pg+hz4pg2);
  #undef SETAJ
}

static int s8ederipr3(const double aj[9], double *detdp, double *vol, double aji[9]) {
  double a1=aj[0],a2=aj[1],a3=aj[2],a4=aj[3],a5=aj[4],a6=aj[5],a7=aj[6],a8=aj[7],a9=aj[8];
  double jac_59_68=a5*a9-a6*a8;
  double jac_67_49=a6*a7-a4*a9;
  double jac_38_29=-a2*a9+a3*a8;
  double jac_19_37=a1*a9-a3*a7;
  double jac_27_18=-a1*a8+a2*a7;
  double jac_26_35=a2*a6-a3*a5;
  double jac_34_16=-a1*a6+a3*a4;
  double jac_15_24=a1*a5-a2*a4;
  double jac_48_57=a4*a8-a5*a7;
  double det = ONE_OVER_512 * (a1*jac_59_68 + a2*jac_67_49 + a3*jac_48_57);
  double dett;
  if (!(det > 0.0)) return 0;
  dett = ONE_OVER_512 / det;
  aji[0]=dett*jac_59_68; aji[1]=dett*jac_38_29; aji[2]=dett*jac_26_35;
  aji[3]=dett*jac_67_49; aji[4]=dett*jac_19_37; aji[5]=dett*jac_34_16;
  aji[6]=dett*jac_48_57; aji[7]=dett*jac_27_18; aji[8]=dett*jac_15_24;
  *detdp = det;
  *vol = W1 * det;
  return 1;
}

static void s8ederig3(const double aji[9], int gp, double gN[8][3],
                      const double pr[8][8], const double ps[8][8], const double pt[8][8]) {
  double aji1=aji[0],aji2=aji[1],aji3=aji[2],aji4=aji[3],aji5=aji[4];
  double aji6=aji[5],aji7=aji[6],aji8=aji[7],aji9=aji[8];
  const double *PR=pr[gp], *PS=ps[gp], *PT=pt[gp];
  double a1pr1=aji1*PR[0], a1pr3=aji1*PR[2], a1pr5=aji1*PR[4], a1pr7=aji1*PR[6];
  double a2ps1=aji2*PS[0], a2ps2=aji2*PS[1], a2ps5=aji2*PS[4], a2ps6=aji2*PS[5];
  double a3pt1=aji3*PT[0], a3pt2=aji3*PT[1], a3pt3=aji3*PT[2], a3pt4=aji3*PT[3];
  gN[0][0]= a1pr1+a2ps1+a3pt1;
  gN[1][0]=-a1pr1+a2ps2+a3pt2;
  gN[2][0]= a1pr3-a2ps2+a3pt3;
  gN[3][0]=-a1pr3-a2ps1+a3pt4;
  gN[4][0]= a1pr5+a2ps5-a3pt1;
  gN[5][0]=-a1pr5+a2ps6-a3pt2;
  gN[6][0]= a1pr7-a2ps6-a3pt3;
  gN[7][0]=-a1pr7-a2ps5-a3pt4;
  {
    double a4pr1=aji4*PR[0], a4pr3=aji4*PR[2], a4pr5=aji4*PR[4], a4pr7=aji4*PR[6];
    double a5ps1=aji5*PS[0], a5ps2=aji5*PS[1], a5ps5=aji5*PS[4], a5ps6=aji5*PS[5];
    double a6pt1=aji6*PT[0], a6pt2=aji6*PT[1], a6pt3=aji6*PT[2], a6pt4=aji6*PT[3];
    gN[0][1]= a4pr1+a5ps1+a6pt1;
    gN[1][1]=-a4pr1+a5ps2+a6pt2;
    gN[2][1]= a4pr3-a5ps2+a6pt3;
    gN[3][1]=-a4pr3-a5ps1+a6pt4;
    gN[4][1]= a4pr5+a5ps5-a6pt1;
    gN[5][1]=-a4pr5+a5ps6-a6pt2;
    gN[6][1]= a4pr7-a5ps6-a6pt3;
    gN[7][1]=-a4pr7-a5ps5-a6pt4;
  }
  {
    double a7pr1=aji7*PR[0], a7pr3=aji7*PR[2], a7pr5=aji7*PR[4], a7pr7=aji7*PR[6];
    double a8ps1=aji8*PS[0], a8ps2=aji8*PS[1], a8ps5=aji8*PS[4], a8ps6=aji8*PS[5];
    double a9pt1=aji9*PT[0], a9pt2=aji9*PT[1], a9pt3=aji9*PT[2], a9pt4=aji9*PT[3];
    gN[0][2]= a7pr1+a8ps1+a9pt1;
    gN[1][2]=-a7pr1+a8ps2+a9pt2;
    gN[2][2]= a7pr3-a8ps2+a9pt3;
    gN[3][2]=-a7pr3-a8ps1+a9pt4;
    gN[4][2]= a7pr5+a8ps5-a9pt1;
    gN[5][2]=-a7pr5+a8ps6-a9pt2;
    gN[6][2]= a7pr7-a8ps6-a9pt3;
    gN[7][2]=-a7pr7-a8ps5-a9pt4;
  }
}

static void s8edefo3_rates(const double gN[8][3], const double v[24], double L[9], double d[6]) {
  /* Mirror Radioss s8edefo3: off-diagonals then diagonals, left-assoc P*V. */
  double px[8], py[8], pz[8], vx[8], vy[8], vz[8];
  double dxy, dxz, dyx, dyz, dzx, dzy, dxx, dyy, dzz;
  int a;
  for (a = 0; a < 8; a++) {
    px[a] = gN[a][0];
    py[a] = gN[a][1];
    pz[a] = gN[a][2];
    vx[a] = v[a * 3];
    vy[a] = v[a * 3 + 1];
    vz[a] = v[a * 3 + 2];
  }
  dxy = py[0] * vx[0] + py[1] * vx[1] + py[2] * vx[2] + py[3] * vx[3] +
        py[4] * vx[4] + py[5] * vx[5] + py[6] * vx[6] + py[7] * vx[7];
  dxz = pz[0] * vx[0] + pz[1] * vx[1] + pz[2] * vx[2] + pz[3] * vx[3] +
        pz[4] * vx[4] + pz[5] * vx[5] + pz[6] * vx[6] + pz[7] * vx[7];
  dyx = px[0] * vy[0] + px[1] * vy[1] + px[2] * vy[2] + px[3] * vy[3] +
        px[4] * vy[4] + px[5] * vy[5] + px[6] * vy[6] + px[7] * vy[7];
  dyz = pz[0] * vy[0] + pz[1] * vy[1] + pz[2] * vy[2] + pz[3] * vy[3] +
        pz[4] * vy[4] + pz[5] * vy[5] + pz[6] * vy[6] + pz[7] * vy[7];
  dzx = px[0] * vz[0] + px[1] * vz[1] + px[2] * vz[2] + px[3] * vz[3] +
        px[4] * vz[4] + px[5] * vz[5] + px[6] * vz[6] + px[7] * vz[7];
  dzy = py[0] * vz[0] + py[1] * vz[1] + py[2] * vz[2] + py[3] * vz[3] +
        py[4] * vz[4] + py[5] * vz[5] + py[6] * vz[6] + py[7] * vz[7];
  dxx = px[0] * vx[0] + px[1] * vx[1] + px[2] * vx[2] + px[3] * vx[3] +
        px[4] * vx[4] + px[5] * vx[5] + px[6] * vx[6] + px[7] * vx[7];
  dyy = py[0] * vy[0] + py[1] * vy[1] + py[2] * vy[2] + py[3] * vy[3] +
        py[4] * vy[4] + py[5] * vy[5] + py[6] * vy[6] + py[7] * vy[7];
  dzz = pz[0] * vz[0] + pz[1] * vz[1] + pz[2] * vz[2] + pz[3] * vz[3] +
        pz[4] * vz[4] + pz[5] * vz[5] + pz[6] * vz[6] + pz[7] * vz[7];
  L[0] = dxx;
  L[1] = dxy;
  L[2] = dxz;
  L[3] = dyx;
  L[4] = dyy;
  L[5] = dyz;
  L[6] = dzx;
  L[7] = dzy;
  L[8] = dzz;
  d[0] = dxx;
  d[1] = dyy;
  d[2] = dzz;
  d[3] = dxy + dyx;
  d[4] = dyz + dzy;
  d[5] = dxz + dzx;
}

double wmbd_hex_internal_forces(
    const double x0[24],
    const double v0[24],
    const WmbdMat *mat,
    double stress_io[48],
    double eqps_io[8],
    double vol0_io[8],
    double dt,
    double f_out[24],
    int jcvt) {
  int gp, a;
  double dU = 0.0;
  double volSum = 0.0;
  double vol0Sum = 0.0;
  double lam, mu, bulk, ssp;
  double amuElem = 0.0;
  int have_amu = 0;
  double dsv = 0.0;
  double dsvTol = 1.0 - 1e-20;
  double pp = 0.0;
  MeanDilOps pxcOps;
  int have_pxc = 0;
  GpCache cache[8];
  double R[9];
  double x_loc[24], v_loc[24];
  const double *x;
  const double *v;
  double f_loc[24];

  ensure_shapes();
  memset(f_out, 0, 24 * sizeof(double));

  if (jcvt == 1) {
    hex_corot_R(x0, R);
    rotate_nodes8(R, x0, x_loc, 0); /* x_local = R x_global */
    rotate_nodes8(R, v0, v_loc, 0);
    x = x_loc;
    v = v_loc;
  } else {
    x = x0;
    v = v0;
  }

  if (CONSTANT_PRESSURE || DSV_VOL0) {
    pxcOps = mean_dilatation_operators(x);
    have_pxc = 1;
  }
  if (DSV_VOL0 && have_pxc) {
    dsv = mean_dilatation_rate(&pxcOps, v);
  }

  {
    double aj[8][9];
    double pr[8][8], ps[8][8], pt[8][8];
    fill_prst(pr, ps, pt);
    hierarchical_gp_aj(x, aj);
    for (gp = 0; gp < 8; gp++) {
      double detdp, vol, aji[9];
      GpCache *c = &cache[gp];
      if (!s8ederipr3(aj[gp], &detdp, &vol, aji)) {
        return NAN;
      }
      s8ederig3(aji, gp, c->gN, pr, ps, pt);
      s8edefo3_rates(c->gN, v, c->L, c->d);
      c->vol = vol;
      c->detJ = detdp;
      c->q = 0.0;
      volSum += c->vol;
    }
  }

  lame(mat->young, mat->poisson, &lam, &mu, &bulk);
  (void)lam;
  ssp = sqrt((RADIOSS_ONEP333 * mu + bulk) / mat->density);

  for (gp = 0; gp < 8; gp++) vol0Sum += vol0_io[gp];
  if (MEAN_AMU && vol0Sum > 0.0) {
    amuElem = vol0Sum / fmax(volSum, 1e-30) - 1.0;
    have_amu = 1;
  }

  for (gp = 0; gp < 8; gp++) {
    GpCache *c = &cache[gp];
    double *L = c->L;
    double *d = c->d;
    double vol = c->vol;
    double trD = d[0] + d[1] + d[2];
    double *sigma = &stress_io[gp * 6];
    double al, ad, rho;

    if (DSV_VOL0 && vol0_io[gp] > 0.0) {
      double dv = (dsv - trD) * dt;
      if (dv > dsvTol) dv = 0.0;
      vol0_io[gp] *= 1.0 - dv;
    }

    al = cbrt(fmax(vol, 0.0));
    ad = fmax(0.0, -trD);
    rho = mat->density * (vol0_io[gp] / fmax(vol, 1e-30));
    c->q = rho * ad * al * (QA * QA * ad * al + QB * ssp);

    if (jcvt == 0) {
      double wzz = 0.5 * dt * (L[3] - L[1]);
      double wyy = 0.5 * dt * (L[2] - L[6]);
      double wxx = 0.5 * dt * (L[7] - L[5]);
      double s1 = sigma[0], s2 = sigma[1], s3 = sigma[2];
      double s4 = sigma[3], s5 = sigma[4], s6 = sigma[5];
      double q1 = 2.0 * s4 * wzz;
      double q2 = 2.0 * s6 * wyy;
      double q3 = 2.0 * s5 * wxx;
      sigma[0] = s1 - q1 + q2;
      sigma[1] = s2 + q1 - q3;
      sigma[2] = s3 - q2 + q3;
      sigma[3] = s4 + wzz * (s1 - s2) + wyy * s5 - wxx * s6;
      sigma[4] = s5 + wxx * (s2 - s3) + wzz * s6 - wyy * s4;
      sigma[5] = s6 + wyy * (s3 - s1) + wxx * s4 - wzz * s5;
    }

    j2_update(mat, sigma, &eqps_io[gp], vol0_io[gp], d, dt, vol, have_amu, amuElem);
  }

  for (gp = 0; gp < 8; gp++) {
    GpCache *c = &cache[gp];
    double *d = c->d;
    double vol = c->vol;
    double q = c->q;
    double *sigma = &stress_io[gp * 6];
    double s0 = sigma[0];
    double s1 = sigma[1];
    double s2 = sigma[2];
    double s3 = sigma[3];
    double s4 = sigma[4];
    double s5 = sigma[5];

    dU += ((s0 - q) * d[0] + (s1 - q) * d[1] + (s2 - q) * d[2] + s3 * d[3] +
           s4 * d[4] + s5 * d[5]) *
          vol * dt;

    if (CONSTANT_PRESSURE && have_pxc) {
      double pLoc = ZEP3 * (s0 + s1 + s2);
      pp += (vol / fmax(volSum, 1e-30)) * (pLoc - q);
      s0 -= pLoc;
      s1 -= pLoc;
      s2 -= pLoc;
    } else {
      s0 -= q;
      s1 -= q;
      s2 -= q;
    }

    for (a = 0; a < 8; a++) {
      double gx = c->gN[a][0];
      double gy = c->gN[a][1];
      double gz = c->gN[a][2];
      f_out[a * 3] += (s0 * gx + s3 * gy + s5 * gz) * vol;
      f_out[a * 3 + 1] += (s3 * gx + s1 * gy + s4 * gz) * vol;
      f_out[a * 3 + 2] += (s5 * gx + s4 * gy + s2 * gz) * vol;
    }
  }

  if (CONSTANT_PRESSURE && have_pxc) {
    const double *pxc = pxcOps.pxc;
    const double *pyc = pxcOps.pyc;
    const double *pzc = pxcOps.pzc;
    double sp = pp * volSum;
    static const int pairs[4][3] = {{0, 6, 0}, {1, 7, 1}, {2, 4, 2}, {3, 5, 3}};
    int k;
    for (k = 0; k < 4; k++) {
      int ia = pairs[k][0];
      int ib = pairs[k][1];
      int ik = pairs[k][2];
      double sx = sp * pxc[ik];
      double sy = sp * pyc[ik];
      double sz = sp * pzc[ik];
      f_out[ia * 3] += sx;
      f_out[ia * 3 + 1] += sy;
      f_out[ia * 3 + 2] += sz;
      f_out[ib * 3] -= sx;
      f_out[ib * 3 + 1] -= sy;
      f_out[ib * 3 + 2] -= sz;
    }
  }

  if (jcvt == 1) {
    memcpy(f_loc, f_out, 24 * sizeof(double));
    rotate_nodes8(R, f_loc, f_out, 1); /* F_global = R^T F_local */
  }

  return dU;
}
