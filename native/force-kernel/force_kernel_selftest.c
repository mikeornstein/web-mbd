#include "force_kernel.h"

#include <stdio.h>
#include <string.h>

/*
 * Unit-cube smoke: one force eval with zero stress / vol0 init.
 * Optional golden JSON loading can be added later.
 */
int main(int argc, char **argv) {
  double x0[24];
  double v0[24];
  double stress[48];
  double eqps[8];
  double vol0[8];
  double f_out[24];
  WmbdMat mat;
  double dU;
  int a, i;

  (void)argc;
  (void)argv;

  /* Unit cube corners matching CORNERS natural→physical for [0,1]^3 */
  /* node order = CORNERS: (-1,-1,-1).. mapped to physical cube [0,1]^3 */
  {
    static const double corners[8][3] = {
        {0, 0, 0}, {1, 0, 0}, {1, 1, 0}, {0, 1, 0},
        {0, 0, 1}, {1, 0, 1}, {1, 1, 1}, {0, 1, 1},
    };
    for (a = 0; a < 8; a++) {
      x0[a * 3] = corners[a][0];
      x0[a * 3 + 1] = corners[a][1];
      x0[a * 3 + 2] = corners[a][2];
    }
  }

  memset(v0, 0, sizeof(v0));
  /* Small compressive velocity on +z face nodes for non-trivial strain rate */
  for (a = 4; a < 8; a++) {
    v0[a * 3 + 2] = -0.01;
  }

  memset(stress, 0, sizeof(stress));
  memset(eqps, 0, sizeof(eqps));
  memset(vol0, 0, sizeof(vol0));
  memset(f_out, 0, sizeof(f_out));

  mat.density = 7850.0;
  mat.young = 2.1e11;
  mat.poisson = 0.3;
  mat.yield_stress = 3.5e8;
  mat.hardening = 1.0e9;

  dU = wmbd_hex_internal_forces(x0, v0, &mat, stress, eqps, vol0, 1e-6, f_out, 1);

  printf("dU = %.17g\n", dU);
  printf("forces:\n");
  for (a = 0; a < 8; a++) {
    printf("  n%d: % .17g % .17g % .17g\n", a, f_out[a * 3], f_out[a * 3 + 1],
           f_out[a * 3 + 2]);
  }
  printf("eqps:");
  for (i = 0; i < 8; i++) printf(" %.6g", eqps[i]);
  printf("\n");
  return 0;
}
