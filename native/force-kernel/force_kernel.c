#include "force_kernel.h"

#include <math.h>
#include <string.h>

/* Stub ABI: returns 0 and zero forces until the C mirror of hexInternalForces lands.
 * See README.md for the OR-extract plan. */
double wmbd_hex_internal_forces(
    const double x0[24],
    const double v0[24],
    const WmbdMat *mat,
    double stress_io[48],
    double eqps_io[8],
    double vol0_io[8],
    double dt,
    double f_out[24]) {
  (void)x0;
  (void)v0;
  (void)mat;
  (void)stress_io;
  (void)eqps_io;
  (void)vol0_io;
  (void)dt;
  memset(f_out, 0, 24 * sizeof(double));
  return 0.0;
}
