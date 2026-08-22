#!/usr/bin/env bash
#
# Push the server-side secrets from .env into the Fly app.
#
# Only the variables the API actually reads are sent — VITE_* are build-time SPA
# values that belong in Netlify, and anything not on this list is either unused
# by the server or set declaratively in fly.toml (NODE_ENV, API_PORT,
# PUBLIC_APP_ORIGIN, CHROME_EXECUTABLE_PATH).
#
# Usage:  bash scripts/fly-secrets-import.sh [path-to-env]   # default: .env
#         DRY_RUN=1 bash scripts/fly-secrets-import.sh       # list names only
#
# Safe to re-run: `fly secrets import` upserts. It restarts the machine once for
# the whole batch rather than once per secret.
#
# IMPORTANT: .env is NOT the full production environment. Several variables —
# notably the cron secrets the GitHub scheduled workflows authenticate with
# (VOTD_CRON_SECRET, BACKUP_CRON_SECRET, HMC_SYNC_CRON_SECRET,
# AUTO_ARCHIVE_SECRET_TOKEN, INBOX_RESET_SECRET_TOKEN, SUPPORT_NOTIFY_SECRET_TOKEN)
# — are set only in the Netlify dashboard. This script reports what it could not
# find; copy those from Netlify → Site settings → Environment variables and set
# them with `fly secrets set NAME=value` before cutover, or those jobs 401.

set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# Every process.env.* the server reads, minus the ones fly.toml sets.
SERVER_VARS=(
  ANTHROPIC_API_KEY
  AUDIENCEFUL_API_KEY
  AUTO_ARCHIVE_SECRET_TOKEN
  BACKUP_CRON_SECRET
  BACKUP_RETENTION_DAYS
  BETTERSTACK_STATUS_JSON_URL
  BILLING_TIER_DB_ONLY
  CLERK_AUTHORIZED_PARTIES
  CLERK_SECRET_KEY
  CLERK_WEBHOOK_SECRET
  HARVOUS_ADMIN_EMAILS
  HARVOUS_ADMIN_SECRET
  HARVOUS_ADMIN_USER_IDS
  HARVOUS_SYSTEM_USER_ID
  HERESMYCHURCH_ANON_KEY
  HERESMYCHURCH_API_BASE
  HERESMYCHURCH_PARTNER_API_KEY
  HMC_SYNC_CRON_SECRET
  INBOX_RESET_SECRET_TOKEN
  LOG_LEVEL
  MIGRATION_KEY
  POLAR_ACCESS_TOKEN
  POLAR_ENV
  POLAR_WEBHOOK_SECRET
  POLAR_WEBHOOK_URL
  SUBJECTS_BIBLE
  SUBJECTS_MODEL
  SUPABASE_DATABASE_URL
  SUPABASE_DIRECT_URL
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_URL
  SUPPORT_NOTIFY_SECRET_TOKEN
  SUPPORT_SLACK_WEBHOOK_URL
  VOTD_CRON_SECRET
)

payload=""
found=0
missing=()

for name in "${SERVER_VARS[@]}"; do
  # Last definition wins, matching dotenv; strip optional surrounding quotes.
  line="$(grep -E "^${name}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    missing+=("$name")
    continue
  fi
  value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  payload+="${name}=${value}"$'\n'
  found=$((found + 1))
done

echo "Found ${found}/${#SERVER_VARS[@]} server variables in ${ENV_FILE}."
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Not set locally (skipped): ${missing[*]}"
fi

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN=1 — names only, no values sent:"
  printf '%s\n' "$payload" | cut -d= -f1 | sed '/^$/d' | sed 's/^/  /'
  exit 0
fi

printf '%s' "$payload" | fly secrets import
echo "Done. Verify with: fly secrets list"
