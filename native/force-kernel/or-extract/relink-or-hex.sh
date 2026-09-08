#!/usr/bin/env bash
# Relink libor_h8c objects + web-mbd BIND(C) wrapper into libwmbd_or_hex.so
# so Fortran commons (/COM08/, …) are shared with s8eforc3_.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OR_SRC="${OR_SRC:-/tmp/OpenRadioss-src}"
if [[ -z "${CBDIR:-}" ]]; then
  if [[ -f "$OR_SRC/engine/cbuild_engine_linux64_gf_h8c_lib/CMakeFiles/libor_h8c.dir/objects1.rsp" ]]; then
    CBDIR="$OR_SRC/engine/cbuild_engine_linux64_gf_h8c_lib"
  else
    CBDIR="$OR_SRC/engine/cbuild_engine_linux64_gf"
  fi
fi
OUT_DIR="${OUT_DIR:-$ROOT/build}"
MODDIR="$CBDIR/CMakeFiles/modules"

if [[ ! -f "$CBDIR/CMakeFiles/libor_h8c.dir/objects1.rsp" ]]; then
  echo "engine PIC build not found at $CBDIR — run ./build-shared-engine.sh first" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
FFLAGS='-nostdinc -w -O2 -fdec-math -DWITHOUT_LINALG -DCOMP_GFORTRAN=1 -ffp-contract=off -frounding-math -fopenmp -DMYREAL8 -DCPP_mach=CPP_p4linux964 -DCPP_rel=80 -DCPP_comp=f90 -ffixed-line-length-none -fallow-argument-mismatch -fallow-invalid-boz -std=legacy -fPIC'
FINCS="-I$OR_SRC/common_source/includes -I$OR_SRC/common_source/modules -I$OR_SRC/engine/share/includes -I$OR_SRC/engine/share/r8 -I$OR_SRC/engine/share/spe_inc -I$CBDIR/CMakeFiles/includes_engine_linux64_gf -J$MODDIR"

FINCS_STARTER="$FINCS -I$OR_SRC/starter/share/includes -I$OR_SRC/starter/share/spe_inc"

echo "compiling wmbd_or_com08.c + commons + starter allocbuf + or_hex_force.F90"
cc -O2 -fPIC -c -o "$OUT_DIR/wmbd_or_com08.o" "$ROOT/wmbd_or_com08.c"
gfortran $FFLAGS $FINCS -c -o "$OUT_DIR/or_hex_commons.o" "$ROOT/or_hex_commons.F"

# Starter ALLOCBUF_AUTO renamed to avoid clash with engine restart unpacker.
sed 's/SUBROUTINE ALLOCBUF_AUTO/SUBROUTINE WMBD_ALLOCBUF_AUTO/g; s/allocbuf_auto/wmbd_allocbuf_auto/g' \
  "$OR_SRC/starter/source/elements/elbuf_init/allocbuf_auto.F" > "$OUT_DIR/wmbd_allocbuf_auto.F"
gfortran $FFLAGS $FINCS_STARTER -c -o "$OUT_DIR/wmbd_allocbuf_auto.o" "$OUT_DIR/wmbd_allocbuf_auto.F"

gfortran $FFLAGS $FINCS -c -o "$OUT_DIR/or_hex_force.o" "$ROOT/or_hex_force.F90"
gfortran $FFLAGS $FINCS -c -o "$OUT_DIR/or_mesh_force.o" "$ROOT/or_mesh_force.F90"
cc -O2 -fPIC -c -o "$OUT_DIR/or_hex_pthread.o" "$ROOT/or_hex_pthread.c"

echo "relinking libwmbd_or_hex.so (OR objects + wrapper + pack + mesh)"
(
  cd "$CBDIR"
  # shellcheck disable=SC2086
  gfortran -fPIC -shared -fopenmp -Wl,-soname,libwmbd_or_hex.so \
    -o "$OUT_DIR/libwmbd_or_hex.so" \
    @CMakeFiles/libor_h8c.dir/objects1.rsp \
    @CMakeFiles/libor_h8c.dir/objects2.rsp \
    "$OUT_DIR/wmbd_or_com08.o" \
    "$OUT_DIR/or_hex_commons.o" \
    "$OUT_DIR/wmbd_allocbuf_auto.o" \
    "$OUT_DIR/or_hex_force.o" \
    "$OUT_DIR/or_mesh_force.o" \
    "$OUT_DIR/or_hex_pthread.o" \
    -lrt -lpthread \
    "$OR_SRC/extlib/zlib/linux64/lib/libz.a" \
    "$OR_SRC/extlib/md5/linux64/libmd5.a" \
    -ldl -lstdc++ -lgomp
)

ls -la "$OUT_DIR/libwmbd_or_hex.so"
nm -D "$OUT_DIR/libwmbd_or_hex.so" | grep -E 'wmbd_hex_internal_forces_or|wmbd_mesh_internal_forces_or|wmbd_or_set_dt1|s8eforc3_' | head
echo "OK: $OUT_DIR/libwmbd_or_hex.so"
