#!/usr/bin/env bash
# Regenerate native/Harvous/Harvous.xcodeproj from project.yml (XcodeGen).
# Run from anywhere; cwd does not matter.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/native/Harvous"
exec xcodegen generate "$@"
