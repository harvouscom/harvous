#!/usr/bin/env bash
# package-dmg.sh — build Harvous_macOS Release and create a DMG (no git tag, no gh).
#
# Uses MARKETING_VERSION from project.yml unless HARVOUS_VERSION is set.
# Prerequisites: Xcode, XcodeGen. Optional: create-dmg (otherwise falls back to hdiutil).
#
# Usage:
#   ./package-dmg.sh
#   HARVOUS_VERSION=0.2.0 ./package-dmg.sh

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$SCRIPT_DIR"

VERSION="${HARVOUS_VERSION:-}"
if [ -z "$VERSION" ]; then
  VERSION=$(grep 'MARKETING_VERSION:' project.yml | head -1 | sed -n 's/.*"\([^"]*\)".*/\1/p')
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "✗ xcodegen required (XcodeGen)."
  exit 1
fi

echo "▶ Packaging Harvous Mac ${VERSION} (DMG name Harvous-${VERSION}.dmg)"
echo "→ xcodegen generate…"
xcodegen generate

echo "→ xcodebuild Release…"
xcodebuild -project Harvous.xcodeproj \
  -scheme Harvous_macOS \
  -configuration Release \
  -destination 'platform=macOS' \
  -derivedDataPath build \
  clean build

APP_PATH="build/Build/Products/Release/Harvous.app"
if [ ! -d "$APP_PATH" ]; then
  echo "✗ Expected ${APP_PATH} not found."
  exit 1
fi

DMG_NAME="Harvous-${VERSION}.dmg"
rm -f "$DMG_NAME"

if command -v create-dmg >/dev/null 2>&1; then
  echo "→ create-dmg…"
  if [ -f "$SCRIPT_DIR/dmg-background.tiff" ]; then
    VOLICON_ARGS=()
    if [ -f "$APP_PATH/Contents/Resources/AppIcon.icns" ]; then
      VOLICON_ARGS=(--volicon "$APP_PATH/Contents/Resources/AppIcon.icns")
    fi
    create-dmg \
      --volname "Harvous" \
      "${VOLICON_ARGS[@]}" \
      --background "$SCRIPT_DIR/dmg-background.tiff" \
      --window-pos 200 120 \
      --window-size 420 520 \
      --icon-size 100 \
      --icon "Harvous.app" 210 160 \
      --hide-extension "Harvous.app" \
      --app-drop-link 210 370 \
      "$DMG_NAME" \
      "$APP_PATH"
  else
    create-dmg \
      --volname "Harvous" \
      "$DMG_NAME" \
      "$APP_PATH"
  fi
else
  echo "→ create-dmg not found; using hdiutil (simple compressed image)…"
  hdiutil create -volname "Harvous" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_NAME"
fi

echo ""
echo "✓ ${SCRIPT_DIR}/${DMG_NAME}"
