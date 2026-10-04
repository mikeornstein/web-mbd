#!/usr/bin/env bash
# Four-deck node-output re-run. Measurement only. Does not change the toy,
# does not replace radioss/A-inflate, does not use /DT/ANIM.
# Overlay /ANIM/VECT/VEL in the gitignored run copy only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="$ROOT/docs/diag-pr18-openradioss-control/opencourant-linux64-pin.json"
WANT_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["zipSha256"])' "$PIN")"
WANT_BYTES="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["zipBytes"])' "$PIN")"
WANT_TAG="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tag"])' "$PIN")"
OC_ZIP_URL="${OPENCOURANT_ZIP_URL:-https://github.com/OpenCourant/OpenCourant/releases/download/${WANT_TAG}/OpenCourant_linux64.zip}"

if [[ ! -f "$ROOT/radioss/env.sh" ]]; then
  echo "=== install OpenCourant linux64 (pinned $WANT_TAG) ==="
  tmp="$(mktemp -d)"
  zip="$tmp/OpenCourant_linux64.zip"
  curl -L --fail --retry 4 --retry-delay 4 -o "$zip" "$OC_ZIP_URL"
  got_bytes="$(wc -c < "$zip" | tr -d ' ')"
  got_sha="$(sha256sum "$zip" | awk '{print $1}')"
  echo "downloaded bytes=$got_bytes sha256=$got_sha"
  if [[ "$got_sha" != "$WANT_SHA" || "$got_bytes" != "$WANT_BYTES" ]]; then
    echo "BLOCKER: OpenCourant zip does not match the committed pin" >&2
    echo "  want sha256=$WANT_SHA bytes=$WANT_BYTES" >&2
    echo "  got  sha256=$got_sha bytes=$got_bytes" >&2
    rm -rf "$tmp"
    exit 1
  fi
  PREFIX="${OPENRADIOSS_PREFIX:-$ROOT/radioss/opt}"
  mkdir -p "$PREFIX"
  unzip -q -o "$zip" -d "$PREFIX"
  rm -rf "$tmp"
  OPENCOURANT_TAG="$WANT_TAG" "$ROOT/radioss/install_openradioss.sh"
fi

# shellcheck disable=SC1091
source "$ROOT/radioss/env.sh"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-4}"

if ! command -v starter_linux64_gf >/dev/null; then
  echo "BLOCKER: starter_linux64_gf not on PATH" >&2
  exit 1
fi
if ! command -v engine_linux64_gf >/dev/null; then
  echo "BLOCKER: engine_linux64_gf not on PATH" >&2
  exit 1
fi
if [[ -z "${ANIM_TO_VTK:-}" || ! -x "${ANIM_TO_VTK}" ]]; then
  echo "BLOCKER: ANIM_TO_VTK missing" >&2
  exit 1
fi

TH_TO_CSV=""
for cand in \
  "$(command -v th_to_csv 2>/dev/null || true)" \
  "$(command -v th_to_csv_linux64_gf 2>/dev/null || true)" \
  "${OPENRADIOSS_PATH:-}/exec/th_to_csv" \
  "${OPENRADIOSS_PATH:-}/exec/th_to_csv_linux64_gf"
do
  if [[ -n "$cand" && -x "$cand" ]]; then
    TH_TO_CSV="$cand"
    break
  fi
done
echo "th_to_csv=${TH_TO_CSV:-MISSING}"

overlay_vel() {
  local eng="$1"
  if grep -q '^/ANIM/VECT/VEL' "$eng"; then
    return 0
  fi
  if ! grep -q '^/ANIM/VECT/DISP' "$eng"; then
    echo "BLOCKER: $eng has no /ANIM/VECT/DISP to overlay after" >&2
    exit 1
  fi
  if grep -q '^/DT/ANIM' "$eng"; then
    echo "BLOCKER: $eng already has /DT/ANIM (forbidden)" >&2
    exit 1
  fi
  python3 - "$eng" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
text = p.read_text()
if "/DT/ANIM" in text:
    raise SystemExit("refusing /DT/ANIM")
needle = "/ANIM/VECT/DISP\n"
if needle not in text:
    raise SystemExit("missing /ANIM/VECT/DISP")
if "/ANIM/VECT/VEL" not in text:
    text = text.replace(needle, needle + "/ANIM/VECT/VEL\n", 1)
    p.write_text(text)
PY
}

run_one() {
  local deck_dir="$1"
  local label="$2"
  local timeout_s="${3:-300}"
  local run="$deck_dir/run"
  mkdir -p "$run"
  cp -f "$deck_dir"/Ainflate_0000.rad "$deck_dir"/Ainflate_0001.rad "$run"/
  overlay_vel "$run/Ainflate_0001.rad"
  if grep -q '^/DT/ANIM' "$run/Ainflate_0001.rad"; then
    echo "BLOCKER: run copy has /DT/ANIM" >&2
    exit 1
  fi
  if ! grep -q '^/ANIM/DT' "$run/Ainflate_0001.rad"; then
    echo "BLOCKER: run copy missing committed /ANIM/DT" >&2
    exit 1
  fi
  cd "$run"
  echo "=== $label starter ==="
  starter_linux64_gf -i Ainflate_0000.rad -np 1 | tee starter.log
  echo "=== $label engine (timeout ${timeout_s}s) ==="
  local t0
  t0="$(date +%s)"
  set +e
  set +o pipefail
  timeout --signal=TERM "$timeout_s" engine_linux64_gf -i Ainflate_0001.rad | tee engine.log
  local eng_ec=${PIPESTATUS[0]}
  set -euo pipefail
  local t1
  t1="$(date +%s)"
  echo "engine exit $eng_ec wall_s=$((t1 - t0))" | tee -a engine.log
  echo "=== $label anim_to_vtk ==="
  local anim
  for anim in AinflateA[0-9][0-9][0-9]; do
    [[ -e "$anim" ]] || continue
    local vtk="Ainflate_A${anim: -3}.vtk"
    "$ANIM_TO_VTK" "$anim" > "$vtk"
    echo "wrote $vtk ($(wc -c < "$vtk") bytes)"
  done
  if [[ -n "$TH_TO_CSV" ]]; then
    echo "=== $label th_to_csv ==="
    local th
    for th in AinflateT01 Ainflate_T01 *T01; do
      if [[ -e "$th" ]]; then
        "$TH_TO_CSV" "$th" > Ainflate_T01.csv || true
        echo "wrote Ainflate_T01.csv from $th ($(wc -c < Ainflate_T01.csv 2>/dev/null || echo 0) bytes)"
        break
      fi
    done
  else
    echo "th_to_csv missing; engine time-history columns will be reported as unavailable"
  fi
  echo "done $label"
}

LABEL="${1:-all}"
echo "OpenCourant pin tag=$WANT_TAG sha256=$WANT_SHA bytes=$WANT_BYTES"
echo "engine=$(command -v engine_linux64_gf)"
if [[ "$LABEL" == "all" || "$LABEL" == "golden" ]]; then
  run_one "$ROOT/radioss/diag-oriented-ismstr2" "golden-oriented-ismstr2" 300
fi
if [[ "$LABEL" == "all" || "$LABEL" == "qeph2" ]]; then
  run_one "$ROOT/radioss/diag-element-type/qeph-ismstr2" "qeph-ismstr2" 300
fi
if [[ "$LABEL" == "all" || "$LABEL" == "fine" ]]; then
  run_one "$ROOT/radioss/diag-element-type/fine" "fine" 600
fi
if [[ "$LABEL" == "all" || "$LABEL" == "sh3n" ]]; then
  run_one "$ROOT/radioss/diag-element-type/sh3n" "sh3n" 300
fi
