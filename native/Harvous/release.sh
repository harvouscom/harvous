#!/usr/bin/env bash
# release.sh — bump version, build Harvous_macOS Release, create DMG, publish GitHub release.
#
# Usage:
#   ./release.sh 0.2.0
#   ./release.sh 0.2.0 --bump-only
#
# Prerequisites: Xcode, XcodeGen (xcodegen), create-dmg; gh (for full release, authenticated)
# Run from a clean git working tree (commit app/source changes first). Uses project.yml as the
# single version source of truth, then runs xcodegen.
#
# Based on https://github.com/heyderekj/dinky/blob/main/release.sh — omit Homebrew cask, site sed, zip.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
cd "$SCRIPT_DIR"

BUMP_ONLY=false
VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --bump-only) BUMP_ONLY=true; shift ;;
    *)
      if [ -n "${VERSION}" ]; then
        echo "Usage: $0 X.Y.Z [--bump-only]"
        exit 1
      fi
      VERSION="$1"
      shift
      ;;
  esac
done

if [ -z "${VERSION}" ]; then
  echo "Usage: $0 X.Y.Z [--bump-only]"
  exit 1
fi

for cmd in xcodegen create-dmg; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "✗ Missing required command: $cmd"
    exit 1
  fi
done

if [ "$BUMP_ONLY" != true ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "✗ gh (GitHub CLI) is required for a full release. Install gh or use --bump-only."
    exit 1
  fi
fi

if git -C "$REPO_ROOT" rev-parse "refs/tags/v${VERSION}" >/dev/null 2>&1; then
  echo "✗ Git tag v${VERSION} already exists locally. Remove it or pick another version."
  exit 1
fi

if [ "$BUMP_ONLY" != true ]; then
  if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
    echo "✗ Working tree is not clean. Commit or stash before releasing."
    git -C "$REPO_ROOT" status -sb
    exit 1
  fi
fi

FILE_MARKETING=$(grep 'MARKETING_VERSION:' project.yml | head -1 | sed -n 's/.*"\([^"]*\)".*/\1/p')

echo "▶ Releasing Harvous Mac v${VERSION} (project.yml MARKETING_VERSION is ${FILE_MARKETING})"
echo ""

if [ "$FILE_MARKETING" != "$VERSION" ]; then
  echo "→ Bumping MARKETING_VERSION and CURRENT_PROJECT_VERSION in project.yml…"
  sed -i '' "s/MARKETING_VERSION: \".*\"/MARKETING_VERSION: \"$VERSION\"/" project.yml
  sed -i '' "s/CURRENT_PROJECT_VERSION: \".*\"/CURRENT_PROJECT_VERSION: \"$VERSION\"/" project.yml
else
  echo "→ project.yml already at ${VERSION} (skipping version bump)"
fi

echo "→ xcodegen generate…"
xcodegen generate

if [ "$BUMP_ONLY" = true ]; then
  echo ""
  echo "✓ Bump only — updated project.yml and regenerated the Xcode project."
  echo "  Commit those files, then run: ./release.sh ${VERSION}"
  exit 0
fi

PREV_GIT_TAG=$(git -C "$REPO_ROOT" tag -l 'v*' --sort=-version:refname | head -1 || true)

# Keep DerivedData outside native/Harvous/ so XcodeGen's "." source tree does not ingest build/.
DERIVED_DATA="${HARVOUS_DERIVED_DATA:-$SCRIPT_DIR/../.harvous_mac_derived_data}"
mkdir -p "$DERIVED_DATA"

echo "→ Building Release (Harvous_macOS, derived data: ${DERIVED_DATA})…"
xcodebuild -project Harvous.xcodeproj \
  -scheme Harvous_macOS \
  -configuration Release \
  -destination 'platform=macOS' \
  -derivedDataPath "$DERIVED_DATA" \
  clean build

APP_PATH="$DERIVED_DATA/Build/Products/Release/Harvous.app"
if [ ! -d "$APP_PATH" ]; then
  echo "✗ Expected ${APP_PATH} not found."
  exit 1
fi

DMG_NAME="Harvous-${VERSION}.dmg"
rm -f "$DMG_NAME"
echo "→ Creating ${DMG_NAME}…"

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
  VOLICON_ARGS=()
  if [ -f "$APP_PATH/Contents/Resources/AppIcon.icns" ]; then
    VOLICON_ARGS=(--volicon "$APP_PATH/Contents/Resources/AppIcon.icns")
  fi
  create-dmg \
    --volname "Harvous" \
    "${VOLICON_ARGS[@]}" \
    --window-pos 200 120 \
    --window-size 660 400 \
    --icon-size 100 \
    --icon "Harvous.app" 180 185 \
    --hide-extension "Harvous.app" \
    --app-drop-link 480 185 \
    "$DMG_NAME" \
    "$APP_PATH"
fi

echo "→ Committing version files (if changed)…"
git -C "$REPO_ROOT" add native/Harvous/project.yml native/Harvous/Harvous.xcodeproj/project.pbxproj
if git -C "$REPO_ROOT" diff --cached --quiet; then
  echo " (nothing to commit)"
else
  git -C "$REPO_ROOT" commit -m "Bump Harvous Mac preview to v${VERSION}"
fi

echo "→ Pushing branch…"
git -C "$REPO_ROOT" push origin HEAD

echo "→ Tagging v${VERSION}…"
git -C "$REPO_ROOT" tag "v${VERSION}"
git -C "$REPO_ROOT" push origin "v${VERSION}"

NOTES_FILE=$(mktemp)
{
  echo "## Harvous Mac ${VERSION} (preview, unsigned)"
  echo ""
  echo "DMG for testing and feedback. **Not notarized.**"
  echo ""
  echo "### Install help"
  echo ""
  echo "See [mac-native-app.md](https://github.com/harvouscom/harvous/blob/main/help/mac-native-app.md) for first-launch and Gatekeeper steps."
  echo ""
  if [ -n "$PREV_GIT_TAG" ]; then
    echo "### Changes since ${PREV_GIT_TAG}"
    echo ""
    git -C "$REPO_ROOT" log --no-merges "$PREV_GIT_TAG"..HEAD --pretty=format:'- %s' --reverse | grep -Fv "Bump Harvous Mac preview to v${VERSION}" || true
  else
    echo "### Changes"
    echo ""
    echo "- Initial tagged Mac preview release."
  fi
} > "$NOTES_FILE"

gh release create "v${VERSION}" \
  "$SCRIPT_DIR/$DMG_NAME" \
  --title "Harvous Mac ${VERSION} (preview)" \
  --notes-file "$NOTES_FILE" \
  --verify-tag

rm -f "$NOTES_FILE"

echo ""
echo "✓ Harvous Mac v${VERSION} released."
echo "  https://github.com/harvouscom/harvous/releases/tag/v${VERSION}"
echo ""
echo "Gatekeeper / quarantine (unsigned preview): after installing to Applications, testers can run:"
echo "  xattr -dr com.apple.quarantine /Applications/Harvous.app"
echo "  # or, to clear all extended attributes on the app bundle:"
echo "  xattr -cr /Applications/Harvous.app"
echo "Prefer Control-click → Open or Privacy & Security → Open Anyway first; see help/mac-native-app.md."
