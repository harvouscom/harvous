#!/usr/bin/env bash
#
# Copy the server secrets that live only in Netlify straight into the Fly app.
#
# Values come from `netlify env:list --json`, which returns the real value for
# variables Netlify will disclose.
#
# Do NOT use `netlify env:get` here. For secret-marked variables it returns a
# 20-character masked stand-in rather than the value, with no error and no
# visible difference — an earlier version of this script used it and wrote
# masks into Fly. Anything env:list reports as empty is genuinely unreadable and
# must be rotated instead of copied; this script reports those rather than
# writing a placeholder.
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

payload="$(
  netlify env:list --json 2>/dev/null | NAMES="${NETLIFY_ONLY_VARS[*]}" python3 -c '
import json, os, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
readable, unreadable = [], []
lines = []
for name in os.environ["NAMES"].split():
    v = d.get(name)
    if isinstance(v, str) and v:
        lines.append(f"{name}={v}")
        readable.append(name)
    else:
        unreadable.append(name)
sys.stderr.write("READABLE=" + " ".join(readable) + "\n")
sys.stderr.write("UNREADABLE=" + " ".join(unreadable) + "\n")
sys.stdout.write("\n".join(lines) + ("\n" if lines else ""))
' 2>/tmp/fly-secrets-report.txt
)"

readable="$(grep '^READABLE=' /tmp/fly-secrets-report.txt 2>/dev/null | cut -d= -f2-)"
unreadable="$(grep '^UNREADABLE=' /tmp/fly-secrets-report.txt 2>/dev/null | cut -d= -f2-)"
rm -f /tmp/fly-secrets-report.txt

echo "Fly app: ${FLY_APP}"
echo "Readable from Netlify: ${readable:-none}"
echo "NOT readable:          ${unreadable:-none}"

if [[ -n "${unreadable// }" ]]; then
  echo
  echo "Those are write-only in Netlify — the real value cannot be retrieved by"
  echo "anyone, so they cannot be copied. Rotate each one instead: generate a new"
  echo "value and set it in every place that uses it (GitHub if a workflow sends"
  echo "it, Netlify, and Fly), the way scripts/set-backup-cron-secret.sh does."
fi

if [[ -z "${payload// }" ]]; then
  echo
  echo "Nothing readable to copy."
  exit 0
fi

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo
  echo "DRY_RUN=1 — nothing sent."
  exit 0
fi

printf '%s' "$payload" | fly secrets import --app "$FLY_APP"
echo "Done. Verify with: fly secrets list --app ${FLY_APP}"
