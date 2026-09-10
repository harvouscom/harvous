#!/usr/bin/env bash
# DNS migration helper — snapshot a zone before moving it to Cloudflare, then diff
# Cloudflare's answers against the current registrar BEFORE changing nameservers.
#
# Built after harvous.com, where Cloudflare's zone scan silently missed SEVEN records
# — both Clerk auth CNAMEs, three Clerk mail/DKIM records, HEY's DKIM, and an
# ownership TXT — and defaulted six more to Proxied including `mail`. Switching on
# that import would have broken authentication and email.
#
#   snapshot <domain>              capture what the registrar currently serves
#   verify   <domain> <cf-ns-host> diff Cloudflare's answers against the registrar
#
# THE LIMIT, STATED UP FRONT: dig can only find record names it is told to guess.
# This is a safety net, never a zone dump. The registrar's own control panel is the
# authoritative list — on harvous.com it was the panel, not this script, that caught
# HEY's DKIM (the selector was `heymail`, not the `hey1`/`hey2` that were probed).

set -uo pipefail

TYPES="A AAAA MX TXT NS SOA CAA"
SUBS="www mail smtp imap pop webmail ftp app api cdn static assets img images media
      blog docs help support status dashboard admin portal shop store news
      autodiscover autoconfig _dmarc _domainkey _atproto _webflow _acme-challenge
      clerk accounts clkmail clk._domainkey clk2._domainkey heymail._domainkey
      hey1._domainkey hey2._domainkey google._domainkey k1._domainkey k2._domainkey
      s1._domainkey s2._domainkey selector1._domainkey selector2._domainkey
      fm1._domainkey fm2._domainkey fm3._domainkey mailgun._domainkey
      subdomain-owner-verification _github-pages-challenge _gh-pages"

registrar_ns() { dig +short NS "$1" @1.1.1.1 2>/dev/null | head -1 | sed 's/\.$//'; }

snapshot() {
  local d="$1" ns; ns="$(registrar_ns "$d")"
  [ -z "$ns" ] && { echo "no nameservers found for $d" >&2; return 1; }
  echo "# DNS snapshot — $d"
  echo "# captured $(date -u '+%Y-%m-%dT%H:%M:%SZ') via $ns"
  echo "# Diff Cloudflare's import against BOTH this file and the registrar's panel."
  echo
  for t in $TYPES; do
    local v; v="$(dig +short "$t" "$d" @"$ns" 2>/dev/null | sort)"
    [ -n "$v" ] && printf '%s\t@\t%s\n' "$t" "$(echo "$v" | tr '\n' '|')"
  done
  for s in $SUBS; do
    for t in A CNAME TXT MX; do
      local v; v="$(dig +short "$t" "$s.$d" @"$ns" 2>/dev/null | grep -v '^;;' | sort)"
      [ -n "$v" ] && printf '%s\t%s\t%s\n' "$t" "$s" "$(echo "$v" | tr '\n' '|')"
    done
  done
}

verify() {
  local d="$1" cfns="$2" reg; reg="$(registrar_ns "$d")"
  [ -z "$reg" ] && { echo "no registrar nameservers for $d" >&2; return 1; }
  case "$reg" in *cloudflare*) echo "NOTE: $d already delegated to Cloudflare — comparing CF to itself proves nothing." >&2;; esac
  local pass=0 fail=0
  echo "Diffing $d — registrar ($reg) vs Cloudflare ($cfns)"
  echo
  cmp_one() { # type name
    local t="$1" n="$2" fq r c
    [ "$n" = "@" ] && fq="$d" || fq="$n.$d"
    r="$(dig +short +time=5 +tries=2 "$t" "$fq" @"$reg"  2>/dev/null | sort | tr '\n' '|')"
    c="$(dig +short +time=5 +tries=2 "$t" "$fq" @"$cfns" 2>/dev/null | sort | tr '\n' '|')"
    [ -z "$r" ] && return 0
    if [ "$r" = "$c" ]; then
      printf '  \033[32mOK\033[0m    %-6s %-28s %s\n' "$t" "$n" "$(echo "$r" | tr '|' ' ' | head -c 46)"
      pass=$((pass+1))
    else
      printf '  \033[31mMISSING/DIFF\033[0m %-6s %-24s\n     registrar : %s\n     cloudflare: %s\n' \
        "$t" "$n" "$r" "${c:-<<EMPTY>>}"
      fail=$((fail+1))
    fi
  }
  for t in A AAAA MX TXT CAA; do cmp_one "$t" "@"; done
  for s in $SUBS; do for t in A CNAME TXT MX; do cmp_one "$t" "$s"; done; done
  echo
  printf '  %d matching, %d missing/different\n' "$pass" "$fail"
  if [ "$fail" -gt 0 ]; then
    echo "  DO NOT CHANGE NAMESERVERS. Add the missing records in Cloudflare first."
    return 1
  fi
  echo "  Registrar and Cloudflare agree. Still compare against the registrar's own"
  echo "  panel — dig only finds names this script guesses."
}

case "${1:-}" in
  snapshot) shift; snapshot "$@" ;;
  verify)   shift; [ $# -eq 2 ] || { echo "usage: $0 verify <domain> <cf-nameserver>" >&2; exit 2; }; verify "$@" ;;
  *) echo "usage: $0 snapshot <domain> | $0 verify <domain> <cf-nameserver>" >&2; exit 2 ;;
esac
