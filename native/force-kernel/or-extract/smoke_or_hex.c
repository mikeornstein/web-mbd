/**
 * Smoke: dlopen libwmbd_or_hex.so, call wmbd_hex_internal_forces_or (expect -1
 * until ELBUF packing), and verify DT1 landed in the same /COM08/ as the engine.
 *
 * Usage: ./smoke_or_hex [path/to/libwmbd_or_hex.so]
 */
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>

typedef struct {
  double density, young, poisson, yield_stress, hardening;
} WmbdMat;

typedef int (*or_force_fn)(const double *, const double *, const WmbdMat *, double *, double *,
                           double *, double, double *);
typedef double (*get_dt1_fn)(void);

int main(int argc, char **argv) {
  const char *path =
      argc > 1 ? argv[1] : "build/libwmbd_or_hex.so";

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
  if (!force || !get_dt1 || !s8e || !m2) {
    fprintf(stderr, "missing symbols force=%p get_dt1=%p s8e=%p m2=%p (%s)\n", (void *)force,
            (void *)get_dt1, s8e, m2, dlerror());
    return 1;
  }

  double x0[24] = {0};
  double v0[24] = {0};
  double stress[48] = {0};
  double eqps[8] = {0};
  double vol0[8] = {0};
  double f_out[24] = {0};
  WmbdMat mat = {8930, 117e9, 0.35, 400e6, 100e6};
  const double dt = 7.815479988515705e-8;

  int rc = force(x0, v0, &mat, stress, eqps, vol0, dt, f_out);
  double dt1 = get_dt1();

  printf("wmbd_hex_internal_forces_or rc=%d DT1=%.17e (expect %.17e)\n", rc, dt1, dt);
  if (rc != -1) {
    fprintf(stderr, "FAIL: expected stub rc=-1 until ELBUF packing\n");
    return 1;
  }
  if (dt1 != dt) {
    fprintf(stderr, "FAIL: DT1 not shared with /COM08/ (got %a want %a)\n", dt1, dt);
    return 1;
  }
  printf("PASS: BIND(C) entry + shared /COM08/ DT1 (packing still TODO)\n");
  return 0;
}
