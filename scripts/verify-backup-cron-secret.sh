#!/usr/bin/env bash
#
# Check that BACKUP_CRON_SECRET actually works, without printing it.
#
# Reads the value from Netlify (the one place it is readable) and calls both
# backup endpoints with it. 401 means that host holds a different value; 200
# means it matches and the job ran.
#
# Usage:  bash scripts/verify-backup-cron-secret.sh

set -uo pipefail

FLY_HOST="${FLY_HOST:-https://harvous.fly.dev}"
NETLIFY_HOST="${NETLIFY_HOST:-https://app.harvous.com}"

value="$(netlify env:get BACKUP_CRON_SECRET --context production 2>/dev/null | tail -n 1)"
if [[ -z "$value" || "$value" == *" "* ]]; then
  echo "BACKUP_CRON_SECRET is not set in Netlify's production context — nothing to test."
  exit 1
fi
echo "Read the value from Netlify (${#value} chars). Testing both hosts…"

for host in "$FLY_HOST" "$NETLIFY_HOST"; do
  body=$(mktemp)
  code=$(curl -s -o "$body" -w "%{http_code}" -X POST "${host}/api/admin/backup-exports" \
    -H "Authorization: Bearer $value" --max-time 300)
  case "$code" in
    200) echo "  $host → 200 OK: $(head -c 200 "$body")" ;;
    401) echo "  $host → 401: this host holds a DIFFERENT value (Netlify Functions need a redeploy to pick up env changes)" ;;
    503) echo "  $host → 503: secret matched, but storage is unconfigured — check the private user-exports bucket" ;;
    *)   echo "  $host → $code: $(head -c 200 "$body")" ;;
  esac
  rm -f "$body"
done
