#!/usr/bin/env bash
# Install a Linux OpenRadioss-class engine for regenerating the Letter A golden.
#
# The historical OpenRadioss GitHub release tag latest-20260728
# (OpenRadioss_linux64.zip) now 404s from this environment: the
# OpenRadioss/OpenRadioss repository itself returns 404, and openradioss.org
# redirects to Siemens. The working public Linux package is the OpenCourant
# community continuation:
#   https://github.com/OpenCourant/OpenCourant/releases
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PREFIX="${OPENRADIOSS_PREFIX:-$ROOT/opt}"
TAG="${OPENRADIOSS_TAG:-latest-20261003}"
# Official OpenRadioss URL (kept first; expected 404 as of 2026-10-04).
OR_ZIP_URL="${OPENRADIOSS_ZIP_URL:-https://github.com/OpenRadioss/OpenRadioss/releases/download/${TAG}/OpenRadioss_linux64.zip}"
# Working fallback: OpenCourant linux64 package (starter_linux64_gf / engine_linux64_gf).
OC_TAG="${OPENCOURANT_TAG:-latest-20261003}"
OC_ZIP_URL="${OPENCOURANT_ZIP_URL:-https://github.com/OpenCourant/OpenCourant/releases/download/${OC_TAG}/OpenCourant_linux64.zip}"

mkdir -p "$PREFIX"
STARTER=""
for cand in \
  "$PREFIX/OpenRadioss/exec/starter_linux64_gf" \
  "$PREFIX/OpenCourant/exec/starter_linux64_gf"
do
  if [[ -x "$cand" ]]; then
    STARTER="$cand"
    break
  fi
done

if [[ -z "$STARTER" ]]; then
  tmp="$(mktemp -d)"
  zip="$tmp/engine.zip"
  if curl -L --fail --retry 4 --retry-delay 4 -o "$zip" "$OR_ZIP_URL"; then
    echo "Downloading $OR_ZIP_URL"
    unzip -q -o "$zip" -d "$PREFIX"
  else
    echo "OpenRadioss zip 404 or failed ($OR_ZIP_URL); trying OpenCourant $OC_ZIP_URL"
    curl -L --fail --retry 4 --retry-delay 4 -o "$zip" "$OC_ZIP_URL"
    unzip -q -o "$zip" -d "$PREFIX"
  fi
  rm -rf "$tmp"
fi

OR=""
for cand in "$PREFIX/OpenRadioss" "$PREFIX/OpenCourant"; do
  if [[ -x "$cand/exec/starter_linux64_gf" ]]; then
    OR="$cand"
    break
  fi
done
if [[ -z "$OR" ]]; then
  echo "BLOCKER: no starter_linux64_gf under $PREFIX" >&2
  exit 1
fi
test -x "$OR/exec/engine_linux64_gf"
test -x "$OR/exec/anim_to_vtk_linux64_gf"
cat > "$ROOT/env.sh" <<EOF
# shellcheck disable=SC2148
export OPENRADIOSS_PATH="$OR"
export RAD_CFG_PATH="\$OPENRADIOSS_PATH/hm_cfg_files"
export RAD_H3D_PATH="\$OPENRADIOSS_PATH/extlib/h3d/lib/linux64"
export OMP_STACKSIZE="\${OMP_STACKSIZE:-400m}"
export OMP_NUM_THREADS="\${OMP_NUM_THREADS:-4}"
export LD_LIBRARY_PATH="\$OPENRADIOSS_PATH/extlib/hm_reader/linux64:\${RAD_H3D_PATH}:\${LD_LIBRARY_PATH:-}"
export PATH="\$OPENRADIOSS_PATH/exec:\$PATH"
export ANIM_TO_VTK="\$OPENRADIOSS_PATH/exec/anim_to_vtk_linux64_gf"
EOF
# shellcheck disable=SC1091
source "$ROOT/env.sh"
echo "starter: $(command -v starter_linux64_gf)"
ldd "$OR/exec/starter_linux64_gf" | grep -E 'not found' && {
  echo "BLOCKER: missing shared libraries for starter" >&2
  exit 1
} || true
echo "install ok  path=$OR"
