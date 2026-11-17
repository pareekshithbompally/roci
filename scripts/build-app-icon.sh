#!/usr/bin/env bash
# Compiles the Icon Composer icon (src-tauri/icons/AppIcon.icon) into the Mac app's asset catalog: Assets.car with its
# light, dark, clear and tinted renderings, and AppIcon.icns. Needs the Xcode that made the icon (CI has an older one),
# so run it after changing the icon and commit src-tauri/icons/compiled.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON="$ROOT_DIR/src-tauri/icons/AppIcon.icon"
OUT="$ROOT_DIR/src-tauri/icons/compiled"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$OUT"
xcrun actool "$ICON" --compile "$WORK" --output-format human-readable-text --notices --warnings \
  --output-partial-info-plist "$WORK/partial.plist" --app-icon AppIcon --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en --target-device mac \
  --minimum-deployment-target 26.0 --platform macosx >/dev/null
cp "$WORK/Assets.car" "$WORK/AppIcon.icns" "$OUT/"
echo "App icon compiled into $OUT (Xcode $(xcodebuild -version | head -1 | cut -d' ' -f2))"
