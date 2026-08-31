#!/usr/bin/env bash
# Cloudflare parity matrix — the gate for Phase A (docs/CLOUDFLARE_MIGRATION.md).
#
# Re-run at three points:
#   stage 2  against https://harvous-app.<account>.workers.dev   (before any DNS moves)
#   stage 4  against https://app.harvous.com                     (after custom domain attach)
#   stage 5  against https://app.harvous.com                     (during the soak)
#
# Usage:  scripts/cf-parity-check.sh <base-url> [share-token]
#   e.g.  scripts/cf-parity-check.sh https://harvous-app.example.workers.dev
#         scripts/cf-parity-check.sh https://app.harvous.com AbCdEf123456
#
# Exit code is the gate: non-zero means do not proceed to the next stage.

set -uo pipefail

BASE="${1:-}"
SHARE_TOKEN="${2:-${SHARE_TOKEN:-}}"

if [ -z "$BASE" ]; then
  echo "usage: $0 <base-url> [share-token]" >&2
  exit 2
fi
BASE="${BASE%/}"

PASS=0; FAIL=0
ok()   { printf '  \033[32mPASS\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; printf '        expected: %s\n        actual:   %s\n' "$2" "$3"; FAIL=$((FAIL+1)); }
skip() { printf '  \033[33mSKIP\033[0m  %s (%s)\n' "$1" "$2"; }
# Cloudflare's TEMPORARY preview accounts (wrangler deploy --temporary) throttle bursts and
# answer a random ~20% of requests with a bare 403 — same URL, same second, interleaved with
# 200s. That is an account-tier artifact, not the Worker. Retry those so the matrix measures
# configuration; the retry count is reported at the end so a genuine 403 pattern still shows.
RETRY_LOG="$(mktemp)"
trap 'rm -f "$RETRY_LOG"' EXIT
_curl_retry() { # $1 = "head"|"status"|"body", rest = curl args
  local mode="$1"; shift
  local attempt out code
  for attempt in 1 2 3; do
    case "$mode" in
      head)   out=$(curl -sS -o /dev/null -D - --max-time 20 "$@" 2>/dev/null)
              code=$(printf '%s' "$out" | head -1 | awk '{print $2}') ;;
      status) out=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$@" 2>/dev/null)
              code="$out" ;;
      body)   code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$@" 2>/dev/null)
              out=$(curl -sS --max-time 20 "$@" 2>/dev/null) ;;
    esac
    [ "$code" != "403" ] && { printf '%s' "$out"; return 0; }
    echo x >> "$RETRY_LOG"
    sleep 2
  done
  printf '%s' "$out"
}
head_of() { _curl_retry head "$@"; }
# Header value, lowercased name, first match, trimmed.
hdr() { head_of "$2" ${3:+-H "$3"} | tr -d '\r' | grep -i "^$1:" | head -1 | sed "s/^[^:]*: *//"; }
status_of() { _curl_retry status "$@"; }
# CDNs normalise Cache-Control spacing differently (Netlify strips the space after commas,
# Cloudflare may not). Compare on content, not whitespace.
norm() { printf '%s' "$1" | tr -d ' '; }
same() { [ "$(norm "$1")" = "$(norm "$2")" ]; }

echo "Cloudflare parity matrix against $BASE"
echo

# ── Settle gate ──────────────────────────────────────────────────────────────────
# _headers rules take up to ~30-60s to propagate across the edge after a deploy, and
# requests inside that window come back WITHOUT them. Observed on three separate
# deploys (2026-08-30): runs started seconds after `wrangler deploy` reported random
# subsets of missing cache-control / HSTS that were all correct a minute later. Poll
# until the rules are actually live, so the matrix measures configuration rather than
# propagation. This is the difference between a trustworthy gate and a flaky one.
printf 'Waiting for _headers rules to propagate'
SETTLED=no
for _ in $(seq 1 30); do
  if curl -sS -o /dev/null -D - --max-time 10 "$BASE/" 2>/dev/null | tr -d '\r' \
       | grep -qi '^strict-transport-security:'; then SETTLED=yes; break; fi
  printf '.'; sleep 3
done
if [ "$SETTLED" = yes ]; then echo " live."; else echo " TIMED OUT after 90s — results below may be propagation noise, not config."; fi
echo

# ── 1. Security + cache headers on the HTML shell ────────────────────────────────
echo "[1] Document headers"
cc=$(hdr cache-control "$BASE/")
same "$cc" "no-cache, must-revalidate" && ok "/ cache-control" || bad "/ cache-control" "no-cache, must-revalidate" "$cc"
csp=$(hdr content-security-policy "$BASE/")
case "$csp" in
  "default-src 'self'"*"challenges.cloudflare.com"*) ok "/ content-security-policy present" ;;
  *) bad "/ content-security-policy" "default-src 'self' ... challenges.cloudflare.com ..." "${csp:-<missing>}" ;;
esac
hsts=$(hdr strict-transport-security "$BASE/")
same "$hsts" "max-age=31536000; includeSubDomains; preload" && ok "/ strict-transport-security" || bad "/ strict-transport-security" "max-age=31536000; includeSubDomains; preload" "${hsts:-<missing>}"
for h in "x-frame-options:DENY" "x-content-type-options:nosniff" "referrer-policy:strict-origin-when-cross-origin"; do
  name="${h%%:*}"; want="${h#*:}"; got=$(hdr "$name" "$BASE/")
  [ "$got" = "$want" ] && ok "/ $name" || bad "/ $name" "$want" "${got:-<missing>}"
done

# ── 2. THE most important check: hashed assets must be immutable ─────────────────
echo
echo "[2] Cache tiers"
asset=$(_curl_retry body "$BASE/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ -n "$asset" ]; then
  cc=$(hdr cache-control "$BASE$asset")
  if same "$cc" "public, max-age=31536000, immutable"; then
    ok "$asset immutable"
  else
    bad "$asset immutable  <-- THE load-bearing line (~703.7 KB re-downloaded per visit if wrong)" \
        "public, max-age=31536000, immutable" "${cc:-<missing>}"
  fi
else
  bad "discover hashed asset from /" "an /assets/index-<hash>.js reference in the HTML" "none found"
fi
for pair in "fonts:/fonts/Roundo-Variable.ttf" "images:/images/harvous-2-icon.png" "icons:/icons/app-icon.png"; do
  label="${pair%%:*}"; path="${pair#*:}"
  st=$(status_of "$BASE$path")
  if [ "$st" != "200" ]; then skip "/$label/* cache tier" "$path -> HTTP $st"; continue; fi
  cc=$(hdr cache-control "$BASE$path")
  same "$cc" "public, max-age=2592000" && ok "/$label/* 30-day cache" || bad "/$label/* 30-day cache" "public, max-age=2592000" "${cc:-<missing>}"
done

# ── 3. The /api/* proxy to Fly ───────────────────────────────────────────────────
echo
echo "[3] API proxy -> Fly"
st=$(status_of "$BASE/api/health")
[ "$st" = "200" ] && ok "/api/health 200" || bad "/api/health 200" "200" "$st"
cc=$(hdr cache-control "$BASE/api/health")
case "$cc" in
  *no-store*) ok "/api/* no-store passes through from Fly" ;;
  *) bad "/api/* no-store from Fly" "contains no-store" "${cc:-<missing>}" ;;
esac
# n=6 warm latency — gate is "<= Netlify's 250-280ms baseline" (engineer.context.md).
lat=$(for _ in 1 2 3 4 5 6; do curl -sS -o /dev/null -w '%{time_total}\n' --max-time 20 "$BASE/api/health"; done \
      | awk '{s+=$1; n++} END {if (n) printf "%.0f", (s/n)*1000}')
echo "  INFO  /api/health mean of 6: ${lat}ms  (Netlify baseline 250-280ms; Fly direct ~100ms)"

# ── 4. Legacy redirects ──────────────────────────────────────────────────────────
echo
echo "[4] Legacy redirects"
check_redirect() {
  local path="$1" want_status="$2" want_loc="$3"
  local out st loc
  out=$(head_of "$BASE$path" | tr -d '\r')
  st=$(printf '%s' "$out" | head -1 | awk '{print $2}')
  loc=$(printf '%s' "$out" | grep -i '^location:' | head -1 | sed 's/^[^:]*: *//')
  loc="${loc#"$BASE"}"
  if [ "$st" = "$want_status" ] && [ "$loc" = "$want_loc" ]; then
    ok "$path -> $want_status $want_loc"
  else
    bad "$path" "$want_status $want_loc" "$st ${loc:-<no location>}"
  fi
}
check_redirect "/prototype/dashboard" 302 "/dashboard"
check_redirect "/thread_abc123" 301 "/thread/abc123"
check_redirect "/note_abc123" 301 "/note/abc123"
check_redirect "/space_abc123" 301 "/space/abc123"

# ── 5. PWA origin association ────────────────────────────────────────────────────
echo
echo "[5] PWA"
body=$(_curl_retry body "$BASE/.well-known/web-app-origin-association")
case "$body" in
  *'"web_apps"'*'manifest.json'*) ok "/.well-known/web-app-origin-association serves JSON" ;;
  *) bad "/.well-known/web-app-origin-association" 'JSON containing "web_apps" and manifest.json' "${body:0:80}" ;;
esac

# ── 6. Stale-asset honesty — a 200 text/html here is the permanent-SW-cache bug ───
echo
echo "[6] Stale asset guard"
out=$(head_of "$BASE/assets/index-DOESNOTEXIST.js" | tr -d '\r')
st=$(printf '%s' "$out" | head -1 | awk '{print $2}')
ct=$(printf '%s' "$out" | grep -i '^content-type:' | head -1 | sed 's/^[^:]*: *//')
if [ "$st" = "404" ]; then
  ok "missing hashed asset -> 404 (not an index.html fallback)"
else
  bad "missing hashed asset -> 404  <-- a 200 text/html here poisons the service-worker cache permanently" \
      "404" "$st ${ct:-}"
fi

# ── 7. Crawler vs human on share URLs ────────────────────────────────────────────
echo
echo "[7] Share-URL crawler rewrite"
TOKEN="${SHARE_TOKEN:-AAAAAAAAAAAA}"
human=$(_curl_retry body -A "Mozilla/5.0" "$BASE/shared/note/$TOKEN")
crawler=$(_curl_retry body -A "Twitterbot/1.0" "$BASE/shared/note/$TOKEN")
case "$human" in
  *'<div id="root"'*) ok "human UA gets the SPA shell" ;;
  *) bad "human UA gets the SPA shell" '<div id="root">' "${human:0:80}" ;;
esac
if [ -n "$SHARE_TOKEN" ]; then
  case "$crawler" in
    *"og:title"*) ok "crawler UA gets server-rendered OG meta" ;;
    *) bad "crawler UA gets server-rendered OG meta" "HTML containing og:title" "${crawler:0:80}" ;;
  esac
else
  if [ "$crawler" != "$human" ]; then
    ok "crawler UA routes differently from human (pass a real token to assert og:title)"
  else
    bad "crawler UA routes differently from human" "a different response from the SPA shell" "identical to human response"
  fi
fi

echo
echo "────────────────────────────────────────"
printf '  %d passed, %d failed\n' "$PASS" "$FAIL"
RETRIES=$(wc -l < "$RETRY_LOG" | tr -d ' ')
if [ "${RETRIES:-0}" -gt 0 ]; then
  printf '  %s transient 403s retried — expected on a --temporary preview account,\n' "$RETRIES"
  printf '  and a red flag on a real one.\n'
fi
if [ "$FAIL" -gt 0 ]; then
  echo "  GATE: do not proceed to the next stage."
  exit 1
fi
echo "  GATE: clear."
