/**
 * Smoke: dlopen libwmbd_or_hex.so, call wmbd_hex_internal_forces_or.
 *
 * Default: expect rc=-2 (commons + ELBUF packed) and shared /COM08/ DT1.
 * With WMBD_OR_CALL_S8E=1: expect rc=0 and finite forces (experimental).
 *
 * Usage: ./smoke_or_hex [path/to/libwmbd_or_hex.so]
 */
#include <dlfcn.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  double density, young, poisson, yield_stress, hardening;
} WmbdMat;

typedef int (*or_force_fn)(const double *, const double *, const WmbdMat *, double *, double *,
                           double *, double *, double *, double, double *);
typedef double (*get_dt1_fn)(void);

static int env_truthy(const char *name) {
  const char *v = getenv(name);
  return v && (v[0] == '1' || v[0] == 'y' || v[0] == 'Y');
}

int main(int argc, char **argv) {
  const char *path = argc > 1 ? argv[1] : "build/libwmbd_or_hex.so";
  const int call_s8e = env_truthy("WMBD_OR_CALL_S8E");

  void *gomp = dlopen("libgomp.so.1", RTLD_NOW | RTLD_GLOBAL);
  if (!gomp) {
    fprintf(stderr, "libgomp: %s\n", dlerror());
    return 1;
  }
  void *lib = dlopen(path, RTLD_NOW | RTLD_GLOBAL);
  if (!lib) {
    fprintf(stderr, "dlopen %s: %s\n", path, dlerror());
    return 1;
  }

  or_force_fn force = (or_force_fn)dlsym(lib, "wmbd_hex_internal_forces_or");
  get_dt1_fn get_dt1 = (get_dt1_fn)dlsym(lib, "wmbd_or_get_dt1");
  void *s8e = dlsym(lib, "s8eforc3_");
  void *m2 = dlsym(lib, "m2law_");
  void *alloc = dlsym(lib, "wmbd_allocbuf_auto_");
  if (!force || !get_dt1 || !s8e || !m2) {
    fprintf(stderr, "missing symbols force=%p get_dt1=%p s8e=%p m2=%p (%s)\n", (void *)force,
            (void *)get_dt1, s8e, m2, dlerror());
    return 1;
  }
  if (!alloc) {
    fprintf(stderr, "missing wmbd_allocbuf_auto_\n");
    return 1;
  }

  double x0[24] = {
      0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
  };
  double v0[24] = {0};
  v0[14] = v0[17] = v0[20] = v0[23] = -1.0;
  double stress[48] = {0};
  double eqps[8] = {0};
  double vol0[8];
  for (int i = 0; i < 8; ++i) vol0[i] = 0.125;
  double smstr[21] = {0};
  double offg = 1.0;
  double f_out[24] = {0};
  WmbdMat mat = {8930, 117e9, 0.35, 400e6, 100e6};
  const double dt = 7.815479988515705e-8;

  int rc = force(x0, v0, &mat, stress, eqps, vol0, smstr, &offg, dt, f_out);
  double dt1 = get_dt1();

  printf("wmbd_hex_internal_forces_or rc=%d DT1=%.17e (expect %.17e) call_s8e=%d\n", rc, dt1, dt,
         call_s8e);
  if (dt1 != dt) {
    fprintf(stderr, "FAIL: DT1 not shared with /COM08/ (got %a want %a)\n", dt1, dt);
    return 1;
  }

  if (call_s8e) {
    if (rc != 0) {
      fprintf(stderr, "FAIL: expected rc=0 when WMBD_OR_CALL_S8E=1 (got %d)\n", rc);
      return 1;
    }
    double fnorm = 0;
    for (int i = 0; i < 24; ++i) fnorm += f_out[i] * f_out[i];
    fnorm = sqrt(fnorm);
    printf("force L2=%.6e offg=%.6e\n", fnorm, offg);
    if (!isfinite(fnorm)) {
      fprintf(stderr, "FAIL: non-finite forces\n");
      return 1;
    }
    printf("PASS: S8EFORC3 packing path returned forces\n");
    return 0;
  }

  if (rc != -2) {
    fprintf(stderr, "FAIL: expected pack-ready rc=-2 (got %d)\n", rc);
    return 1;
  }
  printf("PASS: commons + ELBUF packed (rc=-2); set WMBD_OR_CALL_S8E=1 to try S8EFORC3\n");
  return 0;
}
