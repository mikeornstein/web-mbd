#!/usr/bin/env bash
# Diagnosis-only Radioss runner. Does not change the toy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/radioss/env.sh"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-4}"

DECK_DIR="$1"
LABEL="$2"
RUN="$DECK_DIR/run"
ART="$DECK_DIR/post"
mkdir -p "$RUN" "$ART"
cp -f "$DECK_DIR"/Ainflate_0000.rad "$DECK_DIR"/Ainflate_0001.rad "$RUN"/
cd "$RUN"

echo "=== $LABEL starter ==="
starter_linux64_gf -i Ainflate_0000.rad -np 1 | tee starter.log
echo "=== $LABEL engine ==="
set +e
set +o pipefail
timeout --signal=TERM 120 engine_linux64_gf -i Ainflate_0001.rad | tee engine.log
eng_ec=${PIPESTATUS[0]}
set -euo pipefail
echo "engine exit $eng_ec" | tee -a engine.log

echo "=== $LABEL post ==="
python3 /tmp/inflation-abc/tools/radioss_post.py \
  --run-dir "$RUN" \
  --deck-dir "$DECK_DIR" \
  --mesh /workspace/src/fixtures/meshes/A.json \
  --metrics-only \
  --label "$LABEL" || true

# Copy post products out of the gitignored artifacts/ name.
if [[ -d "$DECK_DIR/artifacts" ]]; then
  cp -f "$DECK_DIR/artifacts/metrics.json" "$ART/metrics.json" 2>/dev/null || true
  cp -f "$DECK_DIR/artifacts/warn.json" "$ART/warn.json" 2>/dev/null || true
  cp -f "$DECK_DIR/artifacts/metrics.csv" "$ART/metrics.csv" 2>/dev/null || true
fi
# Keep starter Ismstr warning in a non-.log name so it can be committed.
grep -A4 "ISMSTR" "$RUN/starter.log" > "$ART/starter-ismstr-warning.txt" || true
echo "done $LABEL"
