#!/usr/bin/env bash
# Build OpenRadioss engine as a -fPIC shared library for the web-mbd force extract.
# Runs in-place under $OR_SRC/engine so ../Compiling_tools and ../extlib resolve.
set -euo pipefail

OR_SRC="${OR_SRC:-/tmp/OpenRadioss-src}"
ENGINE="$OR_SRC/engine"
OUT_DIR="${OUT_DIR:-/workspace/native/force-kernel/or-extract/build}"
NT="${NT:-$(nproc)}"

if [[ ! -f "$ENGINE/CMakeLists.txt" ]]; then
  echo "OpenRadioss engine not found at $ENGINE" >&2
  exit 1
fi
if [[ ! -f "$OR_SRC/extlib/zlib/linux64/lib/libz.a" ]]; then
  echo "extlib missing zlib; link OpenRadioss_extlib under $OR_SRC/extlib" >&2
  exit 1
fi
if [[ ! -f "$OR_SRC/Compiling_tools/script/load_extlib.py" ]]; then
  echo "Compiling_tools missing at $OR_SRC/Compiling_tools" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
CMAKE_ORIG="$OUT_DIR/CMakeLists.engine.orig.txt"
CMAKE_PATCHED="$OUT_DIR/CMakeLists.shared.txt"
cp "$ENGINE/CMakeLists.txt" "$CMAKE_ORIG"

python3 - <<PY
from pathlib import Path
src = Path("$ENGINE/CMakeLists.txt").read_text()
old = "add_executable (\${EXEC_NAME} \${source_files} \${source_files_common} \${c_source_files} \${cpp_source_files} \${cuda_source_files} \${Build_includes_directory}/engine_message_description.inc \${Build_includes_directory}/__foo.inc )"
new = """set (EXEC_NAME libor_h8c)
add_library (\${EXEC_NAME} SHARED \${source_files} \${source_files_common} \${c_source_files} \${cpp_source_files} \${cuda_source_files} \${Build_includes_directory}/engine_message_description.inc \${Build_includes_directory}/__foo.inc )
set_target_properties(\${EXEC_NAME} PROPERTIES POSITION_INDEPENDENT_CODE ON OUTPUT_NAME or_h8c)"""
if old not in src:
    raise SystemExit("add_executable line not found — CMakeLists changed")
Path("$CMAKE_PATCHED").write_text(src.replace(old, new, 1))
Path("$ENGINE/CMakeLists.txt").write_text(src.replace(old, new, 1))
print("patched engine CMakeLists for SHARED libor_h8c")
PY

cleanup() {
  # Restore upstream CMakeLists even if the build fails.
  if [[ -f "$CMAKE_ORIG" ]]; then
    cp "$CMAKE_ORIG" "$ENGINE/CMakeLists.txt"
    echo "restored $ENGINE/CMakeLists.txt"
  fi
}
trap cleanup EXIT

cd "$ENGINE"
export ADFL="-fPIC"
# Clean prior shared attempt if present
rm -rf cbuild_engine_linux64_gf cbuild_libor_h8c* 2>/dev/null || true

./build_script.sh -arch=linux64_gf -release -nt="$NT" -addflag="-fPIC" 2>&1 | tee "$OUT_DIR/build.log"

# Collect artifacts next to the extract docs
find "$ENGINE" "$OR_SRC/exec" -name 'libor_h8c.so*' -o -name '*or_h8c.so*' 2>/dev/null | tee "$OUT_DIR/artifacts.txt" || true
if [[ -f "$OR_SRC/exec/libor_h8c.so" ]]; then
  cp -a "$OR_SRC/exec/libor_h8c.so"* "$OUT_DIR/" || cp -a "$OR_SRC/exec/libor_h8c.so" "$OUT_DIR/"
elif [[ -f "$ENGINE/cbuild_engine_linux64_gf/libor_h8c.so" ]]; then
  cp -a "$ENGINE/cbuild_engine_linux64_gf/libor_h8c.so"* "$OUT_DIR/" || true
fi
ls -la "$OUT_DIR"/*.so 2>/dev/null || echo "no .so yet — see $OUT_DIR/build.log"
