#!/usr/bin/env bash
#
# Copy the server secrets that live only in Netlify straight into the Fly app.
#
# Netlify's dashboard masks these (last 4 characters only) and `netlify
# env:list` reports them empty, but `netlify env:get NAME --context production`
# returns the real value — they are scoped to the production context, and the
# CLI's default context does not carry them.
#
# Values are piped from one CLI to the other and never printed. The script
# reports names and outcomes only.
#
# Usage:  bash scripts/fly-secrets-from-netlify.sh            # copy them
#         DRY_RUN=1 bash scripts/fly-secrets-from-netlify.sh  # report only
#
# Requires: netlify + fly CLIs, both authenticated. Safe to re-run.

set -uo pipefail

CONTEXT="${NETLIFY_CONTEXT:-production}"
FLY_APP="${FLY_APP:-harvous}"

# Server variables that were NOT found in .env — see scripts/fly-secrets-import.sh.
NETLIFY_ONLY_VARS=(
  VOTD_CRON_SECRET
  HMC_SYNC_CRON_SECRET
  SUPPORT_NOTIFY_SECRET_TOKEN
  INBOX_RESET_SECRET_TOKEN
  BACKUP_CRON_SECRET
  CLERK_AUTHORIZED_PARTIES
  MIGRATION_KEY
  SUPPORT_SLACK_WEBHOOK_URL
  BILLING_TIER_DB_ONLY
  BACKUP_RETENTION_DAYS
  LOG_LEVEL
)

payload=""
copied=()
absent=()

for name in "${NETLIFY_ONLY_VARS[@]}"; do
  value="$(netlify env:get "$name" --context "$CONTEXT" 2>/dev/null | tail -n 1)"

  # A miss prints a sentence ("No value set in the ... context for ..."), so a
  # real value is distinguished by containing no whitespace and being non-empty.
  if [[ -z "$value" || "$value" == *" "* ]]; then
    absent+=("$name")
    continue
  fi

  payload+="${name}=${value}"$'\n'
  copied+=("$name")
done

echo "Context: ${CONTEXT}   Fly app: ${FLY_APP}"
echo "Found in Netlify (${#copied[@]}): ${copied[*]:-none}"
echo "Not set in Netlify (${#absent[@]}): ${absent[*]:-none}"

if [[ ${#absent[@]} -gt 0 ]]; then
  echo
  echo "Those are not in Netlify either — they exist nowhere. If a job depends on"
  echo "one (BACKUP_CRON_SECRET does), generate a value and set it on BOTH sides:"
  echo "  openssl rand -hex 32"
  echo "  fly secrets set NAME=value --app ${FLY_APP}"
  echo "  ...and the same value as a GitHub Actions repository secret."
fi

if [[ ${#copied[@]} -eq 0 ]]; then
  echo
  echo "Nothing to copy."
  exit 0
fi

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo
  echo "DRY_RUN=1 — nothing sent."
  exit 0
fi

printf '%s' "$payload" | fly secrets import --app "$FLY_APP"
echo "Done. Verify with: fly secrets list --app ${FLY_APP}"
