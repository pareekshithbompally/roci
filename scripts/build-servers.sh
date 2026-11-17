#!/usr/bin/env bash
# Builds the bundled model server (Metal, static, no web UI) at a pinned commit into src-tauri/binaries for Tauri's
# externalBin. It runs as its own process: its ggml differs from transcribe.cpp's, so it can't be linked into the app.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRIPLE="aarch64-apple-darwin"
BIN_DIR="$ROOT_DIR/src-tauri/binaries"
WORK_DIR="${CARGO_TARGET_DIR:-$ROOT_DIR/src-tauri/target}"
COMMON_FLAGS=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_OSX_ARCHITECTURES=arm64
  -DCMAKE_OSX_DEPLOYMENT_TARGET=26.0
  -DBUILD_SHARED_LIBS=OFF
  -DGGML_METAL=ON
  -DGGML_METAL_EMBED_LIBRARY=ON
)

# build <binary> <repo> <commit> <cmake flags…>: skipped when the binary at that commit is already there.
build() {
  local name="$1" repo="$2" commit="$3"
  shift 3
  local bin="$BIN_DIR/$name-$TRIPLE" src="$WORK_DIR/$name-src"
  if [[ -x "$bin" && "$(cat "$bin.commit" 2>/dev/null || true)" == "$commit" ]]; then
    return
  fi

  echo "$name: building ${commit:0:7} with Metal (first build takes a few minutes)"
  rm -rf "$src"
  mkdir -p "$src"
  git -C "$src" init -q
  git -C "$src" remote add origin "$repo"
  git -C "$src" fetch -q --depth 1 origin "$commit"
  git -C "$src" checkout -q FETCH_HEAD
  git -C "$src" submodule update -q --init --recursive --depth 1

  cmake -S "$src" -B "$src/build" "${COMMON_FLAGS[@]}" "$@"
  cmake --build "$src/build" --config Release --target "$name" -j "$(sysctl -n hw.ncpu)"

  local built
  built="$(find "$src/build" -type f -name "$name" -perm -u+x | head -n 1)"
  if [[ -z "$built" ]]; then
    echo "$name: build finished but the executable wasn't found" >&2
    exit 1
  fi
  mkdir -p "$BIN_DIR"
  cp "$built" "$bin"
  echo "$commit" > "$bin.commit"
  echo "$name: ready at $bin"
}

# Text-to-image (OpenAI image API).
build sd-server https://github.com/leejet/stable-diffusion.cpp.git 532d2c15c430a785a712b2d94281f04e733008a4 \
  -DSD_METAL=ON -DSD_BUILD_EXAMPLES=ON -DSD_BUILD_SHARED_LIBS=OFF -DSD_SERVER_BUILD_FRONTEND=OFF
