#ifndef WEB_MBD_OR_BRIDGE_H
#define WEB_MBD_OR_BRIDGE_H

#include "force_kernel.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * OpenRadioss-backed hex force evaluation (same ABI as wmbd_hex_internal_forces).
 * Returns 0 on success. Until libor_h8c is linked, this symbol is absent —
 * loaders should dlsym and fall back to the C mirror.
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
    double dt,
    double f_out[24]);

#ifdef __cplusplus
}
#endif

#endif
