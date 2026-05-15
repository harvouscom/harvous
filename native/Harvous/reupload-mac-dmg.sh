#!/usr/bin/env bash
# Rebuild the Mac preview DMG and replace the same-named asset on an existing GitHub release.
# Use when MARKETING_VERSION is unchanged but you need a new binary (e.g. icon or bugfix).
#
# Prerequisites: same as package-dmg.sh, plus gh (authenticated).
# Usage (from native/Harvous/):
#   ./reupload-mac-dmg.sh
#
# Optional: HARVOUS_VERSION=0.2.5 ./reupload-mac-dmg.sh  (defaults to MARKETING_VERSION in project.yml)

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
cd "$SCRIPT_DIR"

if ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh (GitHub CLI) is required."
  exit 1
fi

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  echo "✗ Working tree is not clean. Commit or stash before uploading a release asset."
  git -C "$REPO_ROOT" status -sb
  exit 1
fi

./package-dmg.sh

VERSION="${HARVOUS_VERSION:-}"
if [ -z "$VERSION" ]; then
  VERSION=$(grep 'MARKETING_VERSION:' project.yml | head -1 | sed -n 's/.*"\([^"]*\)".*/\1/p')
fi

DMG_NAME="Harvous-${VERSION}.dmg"
TAG="v${VERSION}"

cd "$REPO_ROOT"
if ! gh release view "$TAG" >/dev/null 2>&1; then
  echo "✗ GitHub release ${TAG} not found for this repo."
  echo "  Create it first (e.g. ./release.sh ${VERSION}) or fix the version / remote."
  exit 1
fi

echo "→ gh release upload ${TAG} ${DMG_NAME} --clobber…"
gh release upload "$TAG" "$SCRIPT_DIR/$DMG_NAME" --clobber

echo ""
echo "✓ Replaced ${DMG_NAME} on release ${TAG}."
