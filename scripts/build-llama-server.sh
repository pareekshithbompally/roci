#!/usr/bin/env bash
# Builds llama-server (src-tauri/engines/llama.cpp, on transcribe.cpp's ggml) into src-tauri/binaries: the helper Tauri
# bundles on the Mac, where it runs on-device chat, search and read aloud. Rebuilt only when the engine sources change.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT_DIR/src-tauri/engines/llama.cpp"
OUT="$ROOT_DIR/src-tauri/binaries"
BIN="$OUT/llama-server-aarch64-apple-darwin"
BUILD="${CARGO_TARGET_DIR:-$ROOT_DIR/src-tauri/target}/llama-server"
STAMP="$OUT/llama-server.sources"

SOURCES_HASH="$(find -L "$ENGINE" -type f \( -name '*.c' -o -name '*.cpp' -o -name '*.h' -o -name '*.m' -o -name '*.metal' -o -name 'CMakeLists.txt' -o -name '*.cmake' \) -print0 | sort -z | xargs -0 shasum | shasum | cut -d' ' -f1)"
if [[ -x "$BIN" && "$(cat "$STAMP" 2>/dev/null || true)" == "$SOURCES_HASH" ]]; then
  exit 0
fi

echo "llama-server: building (first build takes a few minutes)"
cmake -S "$ENGINE" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_DEPLOYMENT_TARGET=26.0 -DBUILD_SHARED_LIBS=OFF \
  -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TOOLS=ON -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_APP=OFF \
  -DLLAMA_OPENSSL=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_BUILD_UI=OFF -DGGML_CCACHE=OFF >/dev/null
cmake --build "$BUILD" --target llama-server -j "$(sysctl -n hw.ncpu)" >/dev/null

mkdir -p "$OUT"
cp "$BUILD/bin/llama-server" "$BIN"
echo "$SOURCES_HASH" > "$STAMP"
echo "llama-server: ready in $OUT"
