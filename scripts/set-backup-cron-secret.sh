#!/usr/bin/env bash
#
# Set BACKUP_CRON_SECRET to one fresh value in all three places that must agree:
#
#   GitHub  — the nightly workflow that SENDS it
#   Netlify — the server that CHECKS it today
#   Fly     — the server that CHECKS it after the /api/* cutover
#
# Generated once into a shell variable and pushed to all three, so no manual
# copy/paste can make them disagree. The value is never printed.
#
# Requires gh, netlify and fly CLIs, all authenticated.
# Usage:  bash scripts/set-backup-cron-secret.sh

set -euo pipefail

REPO="${REPO:-harvouscom/harvous}"
FLY_APP="${FLY_APP:-harvous}"

SECRET="$(openssl rand -hex 32)"

echo "Generated a 64-character secret. Setting it in three places…"

echo "  1/3 GitHub Actions…"
gh secret set BACKUP_CRON_SECRET --repo "$REPO" --body "$SECRET"

echo "  2/3 Netlify (production context)…"
netlify env:set BACKUP_CRON_SECRET "$SECRET" --context production >/dev/null

echo "  3/3 Fly (restarts the machine)…"
fly secrets set "BACKUP_CRON_SECRET=$SECRET" --app "$FLY_APP" >/dev/null

unset SECRET

echo
echo "Done — all three now hold the same value."
echo
echo "NOTE: Netlify Functions read env vars captured at deploy time, so the live"
echo "site keeps the OLD value until the next deploy. Trigger one, or wait for"
echo "your next push, before expecting the nightly job to succeed against Netlify."
echo
echo "Verify against Fly (already live, no redeploy needed):"
echo "  bash scripts/verify-backup-cron-secret.sh"
