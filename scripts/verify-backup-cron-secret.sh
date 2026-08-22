#!/usr/bin/env bash
#
# Verify the nightly backup job actually runs.
#
# This CANNOT be done by reading the secret and calling the endpoint yourself:
# Netlify returns a 20-character mask for secret-marked variables via
# `netlify env:get`, and an earlier version of this script did exactly that and
# reported two false 401s. GitHub and Fly are write-only, so no copy is readable.
#
# The only honest test is to let a party that holds the real value make the call.
# GitHub Actions does, so this triggers the workflow and reports its outcome.
#
# Usage:  bash scripts/verify-backup-cron-secret.sh

set -uo pipefail

REPO="${REPO:-harvouscom/harvous}"
WORKFLOW="${WORKFLOW:-backup-user-exports.yml}"

echo "Triggering ${WORKFLOW}…"
gh workflow run "$WORKFLOW" --repo "$REPO" >/dev/null || {
  echo "Could not trigger the workflow." >&2
  exit 1
}

echo "Waiting for the run to start…"
sleep 8
RUN_ID="$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --limit 1 --json databaseId --jq '.[0].databaseId')"
if [[ -z "$RUN_ID" ]]; then
  echo "Could not find the run." >&2
  exit 1
fi
echo "Run ${RUN_ID} — waiting for it to finish…"

while true; do
  state="$(gh run view "$RUN_ID" --repo "$REPO" --json status,conclusion \
            --jq '.status+" "+(.conclusion // "")' 2>/dev/null)"
  [[ "$state" == completed* ]] && break
  sleep 10
done
echo "Result: ${state}"
echo

gh run view "$RUN_ID" --repo "$REPO" --log 2>/dev/null \
  | grep -iE "skipping backup|exported|usersWithNotes|HTTP [0-9]{3}|Unauthorized|not configured" \
  | head -5

cat <<'EOF'

Reading the result:
  "exported": N            the job ran and wrote to the user-exports bucket
  "skipping backup"        BACKUP_CRON_SECRET is missing from GitHub
  HTTP 401                 GitHub's value and the server's do not match. If you
                           only just changed it, Netlify Functions capture env
                           vars at DEPLOY time — redeploy, then retry.
  HTTP 503                 secret matched, but storage is unconfigured: check
                           the private user-exports bucket exists in Supabase
EOF
