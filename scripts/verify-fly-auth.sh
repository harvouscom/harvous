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
spa_mode=""
case "$spa_key" in
  pk_live_*) spa_mode="live" ;;
  pk_test_*) spa_mode="test" ;;
esac
echo "  SPA issues tokens from:  ${spa_key:-?}  → ${spa_mode:-unknown}"

# Fly's secrets are write-only, so ask the server. This reports the key's mode
# AND whether Clerk actually accepts it — a prefix alone is not enough, since a
# truncated or wrong-application key still reads sk_live_ and still fails every
# session. That exact case shipped twice.
cfg="$(curl -s "${FLY_HOST}/api/debug/auth-config" --max-time 45)"
fly_mode="$(printf '%s' "$cfg" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('clerkMode','?'))
except Exception: print('?')
")"
key_valid="$(printf '%s' "$cfg" | python3 -c "
import json,sys
try: print(str(json.load(sys.stdin).get('clerkKeyValid')).lower())
except Exception: print('?')
")"
key_detail="$(printf '%s' "$cfg" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('clerkKeyDetail',''))
except Exception: print('')
")"
echo "  Fly verifies against:    ${fly_mode}"
echo "  Clerk accepts the key:   ${key_valid}"

if [[ "$key_valid" != "true" ]]; then
  echo "  FAIL — Clerk rejects Fly's secret key: ${key_detail}"
  echo "  Every signed-in request will 401. Do NOT cut over."
  fail=1
elif [[ -n "$spa_mode" && "$fly_mode" != "?" ]]; then
  if [[ "$spa_mode" == "$fly_mode" ]]; then
    echo "  PASS — same instance, and Clerk accepts the key."
  else
    echo "  MISMATCH — the SPA issues ${spa_mode} tokens and Fly verifies"
    echo "  against ${fly_mode}. Every signed-in request will 401. Do NOT cut over."
    fail=1
  fi
fi
echo
echo "── Does Fly accept a token the live SPA would issue? ──────────────"
echo "  This needs a real session cookie. Sign in at app.harvous.com, copy the"
echo "  __session cookie from DevTools → Application → Cookies, and run:"
echo
echo "    SESSION='<paste>' bash scripts/verify-fly-auth.sh"
echo

if [[ -z "${SESSION:-}" || "$SESSION" == *"<"* ]]; then
  echo "  SKIPPED — optional. The instance-match check above catches the"
  echo "  failure that actually took production down, without a credential."
  echo "  Supply SESSION only if you want end-to-end proof."
else
  # /api/debug/me answers 200 either way and reports auth state in the body, so
  # a rejected session is distinguishable from a route that simply errored.
  body=$(curl -s "${FLY_HOST}/api/debug/me" \
    -H "Cookie: __session=${SESSION}" --max-time 60)
  case "$body" in
    *'"hasUserId":true'*)
      echo "  PASS — Fly resolved a live session to a real user."
      echo "  Its Clerk key matches the SPA's instance. Safe to cut over."
      ;;
    *'"hasUserId":false'*)
      echo "  FAIL — Fly could not resolve this session."
      echo "  Either the cookie is stale/wrong, or CLERK_SECRET_KEY still"
      echo "  belongs to a different Clerk instance. Do NOT cut over."
      fail=1
      ;;
    *)
      echo "  FAIL — unexpected response: $(printf '%s' "$body" | head -c 200)"
      fail=1
      ;;
  esac

  # Same call against production, as a control: if this also says false, the
  # cookie is the problem rather than Fly.
  ctl=$(curl -s "${NETLIFY_HOST:-https://app.harvous.com}/api/debug/me" \
    -H "Cookie: __session=${SESSION}" --max-time 60)
  case "$ctl" in
    *'"hasUserId":true'*)  echo "  (control: production accepted the same cookie)" ;;
    *) echo "  (control: production ALSO rejected it — the cookie is stale, grab a fresh one)" ;;
  esac
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
