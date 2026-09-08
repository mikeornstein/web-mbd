/**
 * Call wmbd_hex_internal_forces_or on a large-stack pthread.
 * Node's JS thread stack is too small for S8EFORC3's MVSIZ locals.
 */
#include <dlfcn.h>
#include <pthread.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  double density, young, poisson, yield_stress, hardening;
} WmbdMat;

typedef int (*or_fn)(const double *, const double *, const WmbdMat *, double *, double *, double *,
                     double *, double *, double *, double, double *);

typedef struct {
  or_fn fn;
  const double *x0;
  const double *v0;
  const WmbdMat *mat;
  double *stress;
  double *eqps;
  double *vol0;
  double *smstr;
  double *offg;
  double *hist;
  double dt;
  double *f_out;
  int rc;
} OrCallArgs;

static void *or_call_thread(void *arg) {
  OrCallArgs *a = (OrCallArgs *)arg;
  a->rc = a->fn(a->x0, a->v0, a->mat, a->stress, a->eqps, a->vol0, a->smstr, a->offg, a->hist, a->dt,
                a->f_out);
  return NULL;
}

int wmbd_hex_internal_forces_or_pthread(
    const double x0[24],
    const double v0[24],
    const WmbdMat *mat,
    double stress_io[48],
    double eqps_io[8],
    double vol0_io[8],
    double smstr_io[21],
    double *offg_io,
    double hist_io[32],
    double dt,
    double f_out[24]) {
  or_fn fn = (or_fn)dlsym(RTLD_DEFAULT, "wmbd_hex_internal_forces_or");
  if (!fn) return -98;

  OrCallArgs args = {
      .fn = fn,
      .x0 = x0,
      .v0 = v0,
      .mat = mat,
      .stress = stress_io,
      .eqps = eqps_io,
      .vol0 = vol0_io,
      .smstr = smstr_io,
      .offg = offg_io,
      .hist = hist_io,
      .dt = dt,
      .f_out = f_out,
      .rc = -97,
  };

  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, 64 * 1024 * 1024);
  pthread_t th;
  if (pthread_create(&th, &attr, or_call_thread, &args) != 0) {
    pthread_attr_destroy(&attr);
    return -96;
  }
  pthread_attr_destroy(&attr);
  pthread_join(th, NULL);
  return args.rc;
}
