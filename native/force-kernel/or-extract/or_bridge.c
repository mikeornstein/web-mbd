/**
 * OpenRadioss-backed hex force stub.
 *
 * libor_h8c.so exposes s8eforc3_ / m2law_, but those entry points need a full
 * Radioss element group context (ELBUF_TAB, PM, GEO, IPARG, MVSIZ buffers,
 * timers, …). Until that packing lands, this returns -1 and callers must use
 * the C mirror (wmbd_hex_internal_forces).
 */
#include "or_bridge.h"

#include <stdio.h>

int wmbd_hex_internal_forces_or(
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
  (void)f_out;
  /* Keep stderr quiet in hot paths; one-shot loaders can check the return. */
  return -1; /* ENOSYS: MVSIZ/ELBUF packing not implemented */
}
