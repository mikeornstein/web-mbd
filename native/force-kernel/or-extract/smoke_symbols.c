/**
 * OpenRadioss H8C extract smoke bridge.
 *
 * Once libor_h8c.so is built (`build-shared-engine.sh`), this unit verifies that
 * `s8eforc3_` / `m2law_` resolve. Full MVSIZ/ELBUF packing for
 * `wmbd_hex_internal_forces_or` is still TODO — do not call the Fortran entry
 * points without initialized commons.
 *
 * The shared engine links OpenMP unresolved; preload libgomp before dlopen.
 */
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv) {
  const char *path =
      argc > 1 ? argv[1] : "native/force-kernel/or-extract/build/libor_h8c.so";

  /* OpenMP runtime must be globally visible for gfortran -fopenmp objects. */
  void *gomp = dlopen("libgomp.so.1", RTLD_NOW | RTLD_GLOBAL);
  if (!gomp) {
    fprintf(stderr, "dlopen(libgomp.so.1) failed: %s\n", dlerror());
    return 1;
  }

  void *h = dlopen(path, RTLD_NOW | RTLD_LOCAL);
  if (!h) {
    fprintf(stderr, "dlopen(%s) failed: %s\n", path, dlerror());
    return 2;
  }
  void *s8 = dlsym(h, "s8eforc3_");
  void *m2 = dlsym(h, "m2law_");
  if (!s8 || !m2) {
    fprintf(stderr, "missing symbols s8eforc3_=%p m2law_=%p (%s)\n", s8, m2, dlerror());
    dlclose(h);
    return 3;
  }
  printf("ok: loaded %s\n", path);
  printf("  s8eforc3_=%p\n", s8);
  printf("  m2law_=%p\n", m2);
  dlclose(h);
  return 0;
}
