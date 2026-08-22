#!/usr/bin/env bash
#
# Rotate one shared secret to a fresh value everywhere it is used.
#
# A "shared secret" here is a bearer token a caller sends and a server checks —
# the GitHub scheduled workflows and the /api/admin/* endpoints they hit. Every
# copy must be byte-identical or the call 401s.
#
# Rotation, rather than copying, is the only option for Netlify variables marked
# secret: `netlify env:list --json` reports them empty and `netlify env:get`
# returns a 20-character MASK rather than the value, with no error. Nobody can
# read them back, so a new value is the only way to make all sides agree.
#
# Generated once into a shell variable and pushed to each target, so no manual
# copy/paste can make them disagree. The value is never printed.
#
# Usage:
#   bash scripts/rotate-shared-secret.sh VOTD_CRON_SECRET
#   bash scripts/rotate-shared-secret.sh VOTD_CRON_SECRET --no-github
#
# Requires gh, netlify and fly CLIs, all authenticated.

set -euo pipefail

NAME="${1:-}"
if [[ -z "$NAME" ]]; then
  echo "usage: bash scripts/rotate-shared-secret.sh <SECRET_NAME> [--no-github]" >&2
  exit 1
fi

REPO="${REPO:-harvouscom/harvous}"
FLY_APP="${FLY_APP:-harvous}"
WITH_GITHUB=1
[[ "${2:-}" == "--no-github" ]] && WITH_GITHUB=0

SECRET="$(openssl rand -hex 32)"

echo "Rotating ${NAME} to a fresh 64-character value…"

if [[ "$WITH_GITHUB" == "1" ]]; then
  echo "  GitHub Actions…"
  gh secret set "$NAME" --repo "$REPO" --body "$SECRET"
else
  echo "  GitHub… skipped (--no-github)"
fi

# Output is never suppressed: netlify env:set prompts before overwriting, and
# hiding that makes this look hung.
echo "  Netlify (production context)…"
netlify env:set "$NAME" "$SECRET" --context production --force

echo "  Fly (restarts the machine, ~40s)…"
fly secrets set "${NAME}=${SECRET}" --app "$FLY_APP"

unset SECRET

echo
echo "Done. ${NAME} now holds the same fresh value in each target."
echo
echo "Netlify Functions capture env vars at deploy time, so the live site keeps"
echo "the OLD value until its next deploy. Fly picked this up on restart."
