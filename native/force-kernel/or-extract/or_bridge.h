#ifndef WEB_MBD_OR_BRIDGE_H
#define WEB_MBD_OR_BRIDGE_H

#include "force_kernel.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * OpenRadioss-backed hex force evaluation.
 * Returns 0 on success (S8E ran), -2 when packed only, -4 on alloc failure.
 *
 * smstr_io[21] / offg_io persist ISMSTR=4 reference state per element across
 * CD steps (Radioss GBUF%SMSTR / GBUF%OFF).
 *
 * Packing contract: see or-extract/README.md.
 */
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
    double f_out[24]);

#ifdef __cplusplus
}
#endif

#endif
