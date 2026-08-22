#!/usr/bin/env bash
#
# Check that Fly's Clerk configuration matches the SPA's, BEFORE cutting over.
#
# This exists because the first cutover passed every check that was run —
# /api/health, a public DB read, an OG render — and still took production down.
# None of those need a signed-in user. Clerk had a test secret key while the SPA
# issued live tokens, so every authenticated route 401'd and nothing else showed
# it.
#
# An unauthenticated caller cannot prove auth works. What it CAN prove is that
# the two sides are on the same Clerk instance, which is what actually broke.
#
# Usage:  bash scripts/verify-fly-auth.sh

set -uo pipefail

FLY_HOST="${FLY_HOST:-https://harvous.fly.dev}"
FLY_APP="${FLY_APP:-harvous}"
fail=0

echo "── Clerk instance match ───────────────────────────────────────────"

spa_key="$(netlify env:list --json --context production 2>/dev/null | python3 -c "
import json,sys
try: print((json.load(sys.stdin).get('VITE_CLERK_PUBLISHABLE_KEY') or '')[:8])
except Exception: print('')
")"
if [[ -z "$spa_key" ]]; then
  echo "  ?  could not read VITE_CLERK_PUBLISHABLE_KEY from Netlify"
else
  echo "  SPA issues tokens from:  ${spa_key}…"
fi

# Fly secrets are write-only, so ask the server what it loaded instead of
# reading the value back. /api/health does not expose this, so use the digest
# comparison as a weak signal and rely on the live probe below for the real one.
echo
echo "── Does Fly accept a token the live SPA would issue? ──────────────"
echo "  This needs a real session cookie. Sign in at app.harvous.com, copy the"
echo "  __session cookie from DevTools → Application → Cookies, and run:"
echo
echo "    SESSION='<paste>' bash scripts/verify-fly-auth.sh"
echo

if [[ -n "${SESSION:-}" ]]; then
  code=$(curl -s -o /tmp/flyauth.json -w "%{http_code}" \
    "${FLY_HOST}/api/user/get-profile" \
    -H "Cookie: __session=${SESSION}" --max-time 60)
  case "$code" in
    200) echo "  200 — Fly accepted a live session. Safe to cut over." ;;
    401) echo "  401 — Fly REJECTED a live session. Its Clerk key is for a"
         echo "        different instance. Do NOT cut over."; fail=1 ;;
    *)   echo "  $code — unexpected: $(head -c 200 /tmp/flyauth.json)"; fail=1 ;;
  esac
  rm -f /tmp/flyauth.json
else
  echo "  SKIPPED — no SESSION provided. This is the check that matters;"
  echo "  a cutover verified without it is not verified."
  fail=1
fi

echo
echo "── Netlify-only values not yet on Fly ─────────────────────────────"
netlify env:list --json --context production 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
watch=['CLERK_SECRET_KEY','CLERK_WEBHOOK_SECRET','POLAR_ACCESS_TOKEN',
       'SUPABASE_DATABASE_URL','HARVOUS_SYSTEM_USER_ID']
for k in watch:
    v=d.get(k)
    state='readable — compare it' if isinstance(v,str) and v and len(v)>20 else 'write-only in Netlify'
    print(f'  {k:28} {state}')
" 2>/dev/null

exit $fail
