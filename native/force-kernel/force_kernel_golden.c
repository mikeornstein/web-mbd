#include "force_kernel.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Compare IEEE doubles with Object.is semantics (bit-identical, NaN==NaN, +0 != -0). */
static int doubles_object_is(double a, double b) {
  unsigned long long ua, ub;
  memcpy(&ua, &a, 8);
  memcpy(&ub, &b, 8);
  return ua == ub;
}

static int load_doubles(const char *path, double **out, size_t *n_out) {
  FILE *f = fopen(path, "rb");
  long sz;
  size_t n, nr;
  double *buf;
  if (!f) return -1;
  if (fseek(f, 0, SEEK_END) != 0) {
    fclose(f);
    return -1;
  }
  sz = ftell(f);
  if (sz < 0 || sz % 8 != 0) {
    fclose(f);
    return -1;
  }
  n = (size_t)sz / 8;
  rewind(f);
  buf = (double *)malloc(n * sizeof(double));
  if (!buf) {
    fclose(f);
    return -1;
  }
  nr = fread(buf, 8, n, f);
  fclose(f);
  if (nr != n) {
    free(buf);
    return -1;
  }
  *out = buf;
  *n_out = n;
  return 0;
}

/*
 * Golden layout (little-endian doubles), matching tests/force-kernel-golden.test.ts:
 * dt, mat(5), x(24), v(24), stress_in(48), eqps_in(8), vol0_in(8),
 * fOut(24), dU, stress_out(48), eqps_out(8), vol0_out(8)
 * total = 1+5+24+24+48+8+8+24+1+48+8+8 = 207
 */
int main(int argc, char **argv) {
  double *g = NULL;
  size_t n = 0;
  const char *path;
  WmbdMat mat;
  double x0[24], v0[24], stress[48], eqps[8], vol0[8], f_out[24];
  double dt, dU, dU_exp;
  size_t o = 0;
  int i, fail = 0;

  if (argc < 2) {
    fprintf(stderr, "usage: %s goldens/hex0_step1.dbl\n", argv[0]);
    return 2;
  }
  path = argv[1];
  if (load_doubles(path, &g, &n) != 0) {
    fprintf(stderr, "failed to load %s\n", path);
    return 2;
  }
  if (n < 207) {
    fprintf(stderr, "golden too short: %zu doubles\n", n);
    free(g);
    return 2;
  }

  dt = g[o++];
  mat.density = g[o++];
  mat.young = g[o++];
  mat.poisson = g[o++];
  mat.yield_stress = g[o++];
  mat.hardening = g[o++];
  memcpy(x0, g + o, 24 * sizeof(double));
  o += 24;
  memcpy(v0, g + o, 24 * sizeof(double));
  o += 24;
  memcpy(stress, g + o, 48 * sizeof(double));
  o += 48;
  memcpy(eqps, g + o, 8 * sizeof(double));
  o += 8;
  memcpy(vol0, g + o, 8 * sizeof(double));
  o += 8;

  dU = wmbd_hex_internal_forces(x0, v0, &mat, stress, eqps, vol0, dt, f_out);

  for (i = 0; i < 24; i++) {
    if (!doubles_object_is(f_out[i], g[o + i])) {
      fprintf(stderr, "fOut[%d] mismatch: got %.17g want %.17g\n", i, f_out[i],
              g[o + i]);
      fail = 1;
    }
  }
  o += 24;
  dU_exp = g[o++];
  if (!doubles_object_is(dU, dU_exp)) {
    fprintf(stderr, "dU mismatch: got %.17g want %.17g\n", dU, dU_exp);
    fail = 1;
  }
  for (i = 0; i < 48; i++) {
    if (!doubles_object_is(stress[i], g[o + i])) {
      fprintf(stderr, "stress[%d] mismatch: got %.17g want %.17g\n", i, stress[i],
              g[o + i]);
      fail = 1;
    }
  }
  o += 48;
  for (i = 0; i < 8; i++) {
    if (!doubles_object_is(eqps[i], g[o + i])) {
      fprintf(stderr, "eqps[%d] mismatch: got %.17g want %.17g\n", i, eqps[i],
              g[o + i]);
      fail = 1;
    }
  }
  o += 8;
  for (i = 0; i < 8; i++) {
    if (!doubles_object_is(vol0[i], g[o + i])) {
      fprintf(stderr, "vol0[%d] mismatch: got %.17g want %.17g\n", i, vol0[i],
              g[o + i]);
      fail = 1;
    }
  }

  free(g);
  if (fail) {
    fprintf(stderr, "FAIL\n");
    return 1;
  }
  printf("PASS Object.is match on fOut/dU/stress/eqps/vol0 (%zu doubles)\n", n);
  return 0;
}
