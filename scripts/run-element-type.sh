#!/usr/bin/env bash
# Diagnosis-only Radioss runner for element-type decks. Does not change the toy
# and does not replace radioss/A-inflate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/radioss/env.sh"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-4}"

run_one() {
  local deck_dir="$1"
  local label="$2"
  local timeout_s="${3:-300}"
  local run="$deck_dir/run"
  mkdir -p "$run"
  cp -f "$deck_dir"/Ainflate_0000.rad "$deck_dir"/Ainflate_0001.rad "$run"/
  cd "$run"
  echo "=== $label starter ==="
  starter_linux64_gf -i Ainflate_0000.rad -np 1 | tee starter.log
  echo "=== $label engine (timeout ${timeout_s}s) ==="
  set +e
  set +o pipefail
  timeout --signal=TERM "$timeout_s" engine_linux64_gf -i Ainflate_0001.rad | tee engine.log
  local eng_ec=${PIPESTATUS[0]}
  set -euo pipefail
  echo "engine exit $eng_ec" | tee -a engine.log
  echo "=== $label anim_to_vtk ==="
  local anim
  for anim in AinflateA[0-9][0-9][0-9]; do
    [[ -e "$anim" ]] || continue
    local vtk="Ainflate_A${anim: -3}.vtk"
    "$ANIM_TO_VTK" "$anim" > "$vtk"
    echo "wrote $vtk ($(wc -c < "$vtk") bytes)"
  done
  echo "done $label"
}

LABEL="${1:-all}"
if [[ "$LABEL" == "all" || "$LABEL" == "sh3n" ]]; then
  run_one "$ROOT/radioss/diag-element-type/sh3n" "sh3n" 300
fi
if [[ "$LABEL" == "all" || "$LABEL" == "qeph" ]]; then
  run_one "$ROOT/radioss/diag-element-type/qeph" "qeph" 300
fi
if [[ "$LABEL" == "all" || "$LABEL" == "qeph2" ]]; then
  run_one "$ROOT/radioss/diag-element-type/qeph-ismstr2" "qeph-ismstr2" 300
fi
if [[ "$LABEL" == "all" || "$LABEL" == "fine" ]]; then
  run_one "$ROOT/radioss/diag-element-type/fine" "fine" 600
fi
