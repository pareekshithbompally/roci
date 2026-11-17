#!/usr/bin/env bash
# Builds RociMLX (src-tauri/RociMLX: MLX Swift chat and embeddings) into src-tauri/frameworks: the framework Rust links and
# Tauri bundles, and MLX's Metal library bundle (shipped as a resource). Rebuilt only when the package's sources change.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE="$ROOT_DIR/src-tauri/RociMLX"
OUT="$ROOT_DIR/src-tauri/frameworks"
DERIVED="${CARGO_TARGET_DIR:-$ROOT_DIR/src-tauri/target}/rocimlx"
STAMP="$OUT/RociMLX.sources"

SOURCES_HASH="$(find "$PACKAGE/Package.swift" "$PACKAGE/Sources" -type f -print0 | sort -z | xargs -0 shasum | shasum | cut -d' ' -f1)"
if [[ -d "$OUT/RociMLX.framework" && "$(cat "$STAMP" 2>/dev/null || true)" == "$SOURCES_HASH" ]]; then
  exit 0
fi

# MLX compiles Metal shaders: Xcode's Metal Toolchain is a separate component.
xcrun -f metal >/dev/null 2>&1 && xcrun metal --version >/dev/null 2>&1 || xcodebuild -downloadComponent MetalToolchain

echo "RociMLX: building (first build takes a few minutes)"
(cd "$PACKAGE" && xcodebuild -scheme RociMLX -destination 'generic/platform=macOS' -derivedDataPath "$DERIVED" \
  -configuration Release ARCHS=arm64 ONLY_ACTIVE_ARCH=YES -skipMacroValidation -skipPackagePluginValidation -quiet build)

PRODUCTS="$DERIVED/Build/Products/Release"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$PRODUCTS/PackageFrameworks/RociMLX.framework" "$OUT/"
cp -R "$PRODUCTS/mlx-swift_Cmlx.bundle" "$OUT/"
echo "$SOURCES_HASH" > "$STAMP"
echo "RociMLX: ready in $OUT"
