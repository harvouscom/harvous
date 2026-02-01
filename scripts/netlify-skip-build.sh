#!/usr/bin/env bash
# Netlify "ignore" command: exit 0 = skip build, exit 1 = run build.
# Skip the build only when ALL changed files are in doc-only paths (no app/source changes).

set -e

# If there's no previous deploy to compare against, run the build (e.g. first deploy of branch).
if [ -z "${CACHED_COMMIT_REF}" ] || [ "${CACHED_COMMIT_REF}" = "${COMMIT_REF}" ]; then
  exit 1
fi

# Paths that don't affect the app build; if every changed file is under these, we skip.
DOC_ONLY_PATTERN='^(docs/|Changelog/|help/|release-notes/)'

CHANGED="$(git diff --name-only "${CACHED_COMMIT_REF}" "${COMMIT_REF}" 2>/dev/null || true)"
if [ -z "${CHANGED}" ]; then
  # No changes (e.g. rebuild same commit) — skip to save time
  exit 0
fi

# If any changed file is outside doc-only paths, we must build.
if echo "${CHANGED}" | grep -qvE "${DOC_ONLY_PATTERN}"; then
  exit 1
fi

# All changes are doc-only — skip build
exit 0
