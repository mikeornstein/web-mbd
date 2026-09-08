#!/usr/bin/env bash
# Relink libor_h8c objects + web-mbd BIND(C) wrapper into libwmbd_or_hex.so
# so Fortran commons (/COM08/, …) are shared with s8eforc3_.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OR_SRC="${OR_SRC:-/tmp/OpenRadioss-src}"
CBDIR="$OR_SRC/engine/cbuild_engine_linux64_gf"
OUT_DIR="${OUT_DIR:-$ROOT/build}"
MODDIR="$CBDIR/CMakeFiles/modules"

if [[ ! -f "$CBDIR/CMakeFiles/libor_h8c.dir/objects1.rsp" ]]; then
  echo "engine PIC build not found at $CBDIR — run ./build-shared-engine.sh first" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
FFLAGS='-nostdinc -w -O2 -fdec-math -DWITHOUT_LINALG -DCOMP_GFORTRAN=1 -ffp-contract=off -frounding-math -fopenmp -DMYREAL8 -DCPP_mach=CPP_p4linux964 -DCPP_rel=80 -DCPP_comp=f90 -ffixed-line-length-none -fallow-argument-mismatch -fallow-invalid-boz -std=legacy -fPIC'
FINCS="-I$OR_SRC/common_source/includes -I$OR_SRC/common_source/modules -I$OR_SRC/engine/share/includes -I$OR_SRC/engine/share/r8 -I$OR_SRC/engine/share/spe_inc -I$CBDIR/CMakeFiles/includes_engine_linux64_gf -J$MODDIR"

echo "compiling wmbd_or_com08.c + or_hex_force.F90"
cc -O2 -fPIC -c -o "$OUT_DIR/wmbd_or_com08.o" "$ROOT/wmbd_or_com08.c"
gfortran $FFLAGS $FINCS -c -o "$OUT_DIR/or_hex_force.o" "$ROOT/or_hex_force.F90"

echo "relinking libwmbd_or_hex.so (OR objects + wrapper)"
(
  cd "$CBDIR"
  # shellcheck disable=SC2086
  gfortran -fPIC -shared -fopenmp -Wl,-soname,libwmbd_or_hex.so \
    -o "$OUT_DIR/libwmbd_or_hex.so" \
    @CMakeFiles/libor_h8c.dir/objects1.rsp \
    @CMakeFiles/libor_h8c.dir/objects2.rsp \
    "$OUT_DIR/wmbd_or_com08.o" \
    "$OUT_DIR/or_hex_force.o" \
    -lrt \
    "$OR_SRC/extlib/zlib/linux64/lib/libz.a" \
    "$OR_SRC/extlib/md5/linux64/libmd5.a" \
    -ldl -lstdc++ -lgomp
)

ls -la "$OUT_DIR/libwmbd_or_hex.so"
nm -D "$OUT_DIR/libwmbd_or_hex.so" | grep -E 'wmbd_hex_internal_forces_or|wmbd_or_set_dt1|s8eforc3_' | head
echo "OK: $OUT_DIR/libwmbd_or_hex.so"
