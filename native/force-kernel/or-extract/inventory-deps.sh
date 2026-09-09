#!/usr/bin/env bash
# List first-hop Fortran callees of s8eforc3 + m2law from an OpenRadioss tree.
set -euo pipefail
ROOT="${1:-/tmp/OpenRadioss-src}"
S8E="$ROOT/engine/source/elements/solid/solide8e/s8eforc3.F"
M2="$ROOT/engine/source/materials/mat/mat002/m2law.F"

if [[ ! -f "$S8E" || ! -f "$M2" ]]; then
  echo "OpenRadioss sources not found under $ROOT" >&2
  exit 1
fi

echo "## s8eforc3.F calls"
rg -o '!\|\|--- calls.*' -A 80 "$S8E" | head -90 || true
echo
echo "## m2law.F calls"
rg -o '!\|\|--- calls.*' -A 40 "$M2" | head -50 || true
echo
echo "## Solid8e directory object count"
find "$ROOT/engine/source/elements/solid/solide8e" -name '*.F' -o -name '*.F90' | wc -l
echo "## mat002 object count"
find "$ROOT/engine/source/materials/mat/mat002" -name '*.F' -o -name '*.F90' | wc -l
