#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_DIR="$ROOT_DIR/src-tauri"
TARGET_DIR="${CARGO_TARGET_DIR:-$TAURI_DIR/target}"
APP_BINARY="Kasset"

# Support cross-compilation targets (e.g. --target aarch64-apple-darwin)
# Check target-specific path first, then fallback to default
if [[ -n "${TAURI_TARGET_TRIPLE:-}" && -f "$TARGET_DIR/$TAURI_TARGET_TRIPLE/release/$APP_BINARY" ]]; then
  BIN_PATH="$TARGET_DIR/$TAURI_TARGET_TRIPLE/release/$APP_BINARY"
elif [[ -f "$TARGET_DIR/aarch64-apple-darwin/release/$APP_BINARY" ]]; then
  BIN_PATH="$TARGET_DIR/aarch64-apple-darwin/release/$APP_BINARY"
else
  BIN_PATH="$TARGET_DIR/release/$APP_BINARY"
fi
DESTINATION="$TARGET_DIR/swift-runtime"

if [[ ! -f "$BIN_PATH" ]]; then
  echo "Swift runtime prep: binary not found at $BIN_PATH. Build first." >&2
  exit 1
fi

SWIFT_TOOLCHAIN_DIR="${SWIFT_TOOLCHAIN_DIR:-}"
SWIFT_CONCURRENCY_LIB="${SWIFT_CONCURRENCY_LIB:-}"

if [[ -z "$SWIFT_TOOLCHAIN_DIR" && -d "$HOME/Library/Developer/Toolchains" ]]; then
  SWIFT_TOOLCHAIN_DIR="$(ls -dt "$HOME"/Library/Developer/Toolchains/*.xctoolchain 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$SWIFT_TOOLCHAIN_DIR" && -d "/Library/Developer/Toolchains" ]]; then
  SWIFT_TOOLCHAIN_DIR="$(ls -dt /Library/Developer/Toolchains/*.xctoolchain 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$SWIFT_CONCURRENCY_LIB" && -n "$SWIFT_TOOLCHAIN_DIR" ]]; then
  CANDIDATE="$SWIFT_TOOLCHAIN_DIR/usr/lib/swift/macosx/libswift_Concurrency.dylib"
  if [[ -f "$CANDIDATE" ]]; then
    SWIFT_CONCURRENCY_LIB="$CANDIDATE"
  fi
fi

# Try Command Line Tools location
if [[ -z "$SWIFT_CONCURRENCY_LIB" && -d "/Library/Developer/CommandLineTools" ]]; then
  CANDIDATE="/Library/Developer/CommandLineTools/usr/lib/swift/macosx/libswift_Concurrency.dylib"
  if [[ -f "$CANDIDATE" ]]; then
    SWIFT_CONCURRENCY_LIB="$CANDIDATE"
  fi
fi

# Try system Swift location
if [[ -z "$SWIFT_CONCURRENCY_LIB" && -d "/usr/lib/swift" ]]; then
  CANDIDATE="/usr/lib/swift/libswift_Concurrency.dylib"
  if [[ -f "$CANDIDATE" ]]; then
    SWIFT_CONCURRENCY_LIB="$CANDIDATE"
  fi
fi

if [[ -z "$SWIFT_CONCURRENCY_LIB" ]]; then
  echo "Swift runtime prep: libswift_Concurrency.dylib not found. Checking if binary needs it..." >&2
  
  # Check if binary actually depends on Swift Concurrency
  if command -v otool >/dev/null 2>&1; then
    if otool -L "$BIN_PATH" 2>/dev/null | grep -q "libswift_Concurrency"; then
      echo "Swift runtime prep: Binary requires libswift_Concurrency.dylib but it was not found." >&2
      echo "Install Xcode or a Swift toolchain from swift.org and set SWIFT_TOOLCHAIN_DIR if needed." >&2
      exit 1
    else
      echo "Swift runtime prep: Binary does not require libswift_Concurrency.dylib, skipping." >&2
      exit 0
    fi
  else
    echo "Swift runtime prep: Cannot verify dependencies (otool not found), skipping." >&2
    exit 0
  fi
fi

rm -rf "$DESTINATION"
mkdir -p "$DESTINATION"

cp "$SWIFT_CONCURRENCY_LIB" "$DESTINATION/libswift_Concurrency.dylib"

if command -v install_name_tool >/dev/null 2>&1; then
  install_name_tool -id "@rpath/libswift_Concurrency.dylib" "$DESTINATION/libswift_Concurrency.dylib"
  if command -v python3 >/dev/null 2>&1; then
    if python3 - "$BIN_PATH" <<'PY'
import subprocess
import sys

output = subprocess.check_output(["otool", "-L", sys.argv[1]], text=True)
sys.exit(0 if "/usr/lib/swift/libswift_Concurrency.dylib" in output else 1)
PY
    then
      install_name_tool -change "/usr/lib/swift/libswift_Concurrency.dylib" "@rpath/libswift_Concurrency.dylib" "$BIN_PATH"
    fi
  fi
fi

if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - --timestamp=none "$DESTINATION/libswift_Concurrency.dylib"
fi

if command -v python3 >/dev/null 2>&1 && command -v install_name_tool >/dev/null 2>&1; then
  HAS_RPATH=$(python3 - "$BIN_PATH" <<'PY'
import subprocess
import sys

output = subprocess.check_output(["otool", "-l", sys.argv[1]], text=True)
print("yes" if "@executable_path/../Frameworks" in output else "no")
PY
  )

  if [[ "$HAS_RPATH" != "yes" ]]; then
    install_name_tool -add_rpath "@executable_path/../Frameworks" "$BIN_PATH"
  fi
fi
