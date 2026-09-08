#ifndef WEB_MBD_FORCE_KERNEL_H
#define WEB_MBD_FORCE_KERNEL_H

#ifdef __cplusplus
extern "C" {
#endif

/** Material: density, E, nu, sigY, H (SI). */
typedef struct {
  double density;
  double young;
  double poisson;
  double yield_stress;
  double hardening;
} WmbdMat;

/**
 * One hex force evaluation (H8C-like / LAW2-like), matching web-mbd `hexInternalForces`
 * defaults: Icpre=1, DSV on, qa=qb=0, jcvt=0 (Jaumann; pass 1 for co-rot).
 *
 * @param x0  current 8×3 nodal coords (node-major xyz)
 * @param v0  current 8×3 nodal velocities
 * @param stress_io  8 Gauss × 6 Voigt stresses (in/out; local-frame when jcvt=1)
 * @param eqps_io    8 Gauss equivalent plastic strains (in/out)
 * @param vol0_io    8 Gauss reference volumes (in/out; DSV updates)
 * @param dt         constitutive DT1
 * @param f_out      8×3 +∫Bᵀσ dV (node-major, global)
 * @param jcvt       1 = SRCOOR3/SRROTA3 co-rot; 0 = SROTA3 Jaumann (default path)
 * @return internal energy increment ∫σ:D dV dt
 */
double wmbd_hex_internal_forces(
    const double x0[24],
    const double v0[24],
    const WmbdMat *mat,
    double stress_io[48],
    double eqps_io[8],
    double vol0_io[8],
    double dt,
    double f_out[24],
    int jcvt);

#ifdef __cplusplus
}
#endif

#endif
