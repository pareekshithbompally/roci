#!/usr/bin/env bash
# Builds stable-diffusion.cpp's sd-server (Metal, no web UI) at a pinned commit into src-tauri/binaries for Tauri's externalBin.
# It runs as its own process: its ggml differs from transcribe.cpp's, so it can't be linked into the app.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SD_REPO="https://github.com/leejet/stable-diffusion.cpp.git"
SD_COMMIT="532d2c15c430a785a712b2d94281f04e733008a4"
TRIPLE="aarch64-apple-darwin"
DEPLOYMENT_TARGET="26.0"

BIN_DIR="$ROOT_DIR/src-tauri/binaries"
BIN="$BIN_DIR/sd-server-$TRIPLE"
STAMP="$BIN.commit"
SRC="${CARGO_TARGET_DIR:-$ROOT_DIR/src-tauri/target}/sd-cpp"

if [[ -x "$BIN" && "$(cat "$STAMP" 2>/dev/null || true)" == "$SD_COMMIT" ]]; then
  exit 0
fi

echo "sd-server: building stable-diffusion.cpp ${SD_COMMIT:0:7} with Metal (first build takes a few minutes)"
rm -rf "$SRC"
mkdir -p "$SRC"
git -C "$SRC" init -q
git -C "$SRC" remote add origin "$SD_REPO"
git -C "$SRC" fetch -q --depth 1 origin "$SD_COMMIT"
git -C "$SRC" checkout -q FETCH_HEAD
git -C "$SRC" submodule update -q --init --recursive --depth 1

cmake -S "$SRC" -B "$SRC/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET="$DEPLOYMENT_TARGET" \
  -DSD_METAL=ON \
  -DSD_BUILD_EXAMPLES=ON \
  -DSD_BUILD_SHARED_LIBS=OFF \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DSD_SERVER_BUILD_FRONTEND=OFF
cmake --build "$SRC/build" --config Release --target sd-server -j "$(sysctl -n hw.ncpu)"

BUILT="$(find "$SRC/build" -type f -name sd-server -perm -u+x | head -n 1)"
if [[ -z "$BUILT" ]]; then
  echo "sd-server: build finished but the sd-server executable wasn't found" >&2
  exit 1
fi
mkdir -p "$BIN_DIR"
cp "$BUILT" "$BIN"
echo "$SD_COMMIT" > "$STAMP"
echo "sd-server: ready at $BIN"
