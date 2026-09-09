/**
 * OpenRadioss-backed hex force stub (C fallback).
 *
 * Prefer the BIND(C) symbol in libwmbd_or_hex.so (or_hex_force.F90), which
 * shares /COM08/ with s8eforc3_ and packs ELBUF (rc=-2; WMBD_OR_CALL_S8E=1 →
 * S8EFORC3). This C stub remains for builds without the extract .so.
 */
#include "or_bridge.h"

int wmbd_hex_internal_forces_or(
    const double x0[24],
    const double v0[24],
    const WmbdMat *mat,
    double stress_io[48],
    double eqps_io[8],
    double vol0_io[8],
    double smstr_io[21],
    double *offg_io,
    double dt,
    double f_out[24]) {
  (void)x0;
  (void)v0;
  (void)mat;
  (void)stress_io;
  (void)eqps_io;
  (void)vol0_io;
  (void)smstr_io;
  (void)offg_io;
  (void)dt;
  (void)f_out;
  return -1; /* ENOSYS: extract .so not linked */
}
