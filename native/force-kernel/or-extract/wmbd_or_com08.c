/**
 * Access OpenRadioss /COM08/ from C inside the same shared object as the
 * Fortran engine objects (so DT1 writes hit the same BSS as s8eforc3_).
 *
 * Layout from engine/share/includes/com08_c.inc with -DMYREAL8:
 *   TT, DT1, DT2, DT12, DT2OLD, TSTOP, TABFIS[10], TABFWR[10], ...
 */
#include <stddef.h>

extern double com08_[];

enum {
  COM08_TT = 0,
  COM08_DT1 = 1,
  COM08_DT2 = 2,
  COM08_DT12 = 3,
  COM08_DT2OLD = 4,
  COM08_TSTOP = 5
};

void wmbd_or_set_dt1(double dt1) { com08_[COM08_DT1] = dt1; }

double wmbd_or_get_dt1(void) { return com08_[COM08_DT1]; }

void wmbd_or_set_dt12(double dt12) { com08_[COM08_DT12] = dt12; }

/* Used by smoke_or_hex to prove commons share with s8eforc3_. */
