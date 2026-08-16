# Custom status page (status.harvous.com)

Harvous serves a branded public status page from the SPA while **Better Stack** remains the source of truth for monitors, incidents, and email/RSS subscriptions.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `BETTERSTACK_STATUS_JSON_URL` | Production | Better Stack public JSON endpoint. For Harvous: `https://harvous.betteruptime.com/index.json`. **Do not** use `https://status.harvous.com/index.json` — that host redirects to marketing HTML once the custom domain is removed from Better Stack. |

Local dev falls back to `https://harvous.betteruptime.com/index.json` when the env var is unset.

### Env format

```env
# Harvous native Better Stack URL (always use this, not status.harvous.com)
BETTERSTACK_STATUS_JSON_URL=https://harvous.betteruptime.com/index.json
```

**Do not** use a bare hostname after `status.harvous.com` DNS points at Netlify — that would loop. Use Better Stack's native URL from the dashboard instead.

### Troubleshooting "Status unavailable" / HTTP 502

1. Restart the API dev server after changing `.env` (`npm run dev` picks up env on start).
2. Confirm the URL returns JSON: `curl -sI 'https://YOUR-URL/index.json'` should show `content-type: application/json`, not a redirect to `betterstack.com/uptime`.
3. If `status.harvous.com/index.json` redirects away, the custom domain was removed from Better Stack or the page is unpublished. In Better Stack → **Status pages** → your page, copy the **native** page URL (not the custom domain) and set `BETTERSTACK_STATUS_JSON_URL` to `{that-url}/index.json`.
4. Keep the Better Stack custom domain active until Netlify serves `status.harvous.com`, then switch the env var to the native URL before removing the custom domain from Better Stack.

## Better Stack dashboard

1. **Link monitors** to the status page (Status pages → Resources). Without linked monitors, the UI shows aggregate state only.
2. Suggested monitors:
   - **Web app** — `https://app.harvous.com/`
   - **API** — `https://app.harvous.com/api/health?warm=db`
   - **Sign in & auth (Clerk)** — `https://clerk.harvous.com/.well-known/jwks.json`, monitor type
     **"URL doesn't contain a keyword"**, keyword `"keys"` (with quotes), **HTTP method GET**
3. Note the **native Better Stack status URL** (not the custom domain) for `BETTERSTACK_STATUS_JSON_URL`.

### Do not monitor Clerk's `/v1/client`

`clerk.harvous.com` sits behind Clerk's Cloudflare, and `/v1/client` is the endpoint its bot
rules guard hardest — it's what credential-stuffing and signup-abuse traffic hits. An
unauthenticated, cookie-less, no-JS GET on a fixed interval from datacenter IPs looks exactly
like that traffic, so Cloudflare periodically challenges it and the monitor reports `403` from
every region at once, then recovers on its own a few minutes later once the IP score decays.
That's the signature of an IP-reputation flip, not a Clerk outage. It is also **not fixable from
our side** — that's Clerk's Cloudflare account, not ours.

`/v1/client` is stateful on top of that: an unauthenticated GET mints a new client record, so
every probe from every region writes junk into the instance.

Endpoint behaviour, verified Aug 2026:

| Endpoint | GET | HEAD | Notes |
|---|---|---|---|
| `/v1/health` | `200` | `200` | `{"status":"healthy"}`; Clerk edge only, not instance-specific |
| `/.well-known/jwks.json` | `200` | `405` | Instance-specific (`ins_…` key); `cf-cache-status: DYNAMIC`, so it's a real check |
| `/v1/client` | `200` | — | Bot-challenged; **mints a client record per call** |
| `/v1/environment` | `200` | — | 7.9 KB; same bot-rule exposure as `/v1/client` |

### Why jwks alone, and not a second `/v1/health` monitor

A valid jwks response proves `/v1/health` would pass — you cannot get `200` with the instance's
signing keys in the body if Clerk's edge is down, DNS is broken, or the cert expired. A health
monitor is a strict subset, so running both would double the paging surface for one signal.

jwks also catches what `/v1/health` can't: instance suspended for a billing lapse, instance
misconfigured or deleted, keys not serving. Those are the ones that matter most here, because
Clerk-wide outages already show on Clerk's own status page — the unique value of our monitor is
catching what's wrong with *our* instance.

The keyword check (rather than a plain status-code monitor) is what makes it assert the body
actually contains the keys; a status-only check would go green on any `200`, including a
Cloudflare error page. Keep it on **GET** — HEAD returns `405` and would pin the monitor red.

Accepted tradeoff: the alert alone won't distinguish "Clerk is down" from "our instance is
broken." That distinction earns its keep when alerts route to different teams; it doesn't for a
solo operator who opens the dashboard anyway.
4. **Subscribe / RSS** links on the custom page point at the Better Stack hosted URL (`/rss` for feed).

## DNS cutover (Netlify)

1. In Better Stack: copy the native JSON URL; optionally remove `status.harvous.com` custom domain when ready.
2. In Netlify (app site): **Domain management** → add `status.harvous.com` as a domain alias.
3. DNS: CNAME `status.harvous.com` → your Netlify site (replace Better Stack CNAME).
4. Set `BETTERSTACK_STATUS_JSON_URL` in Netlify environment variables.
5. Deploy; verify `https://status.harvous.com` shows the Harvous-styled page and `https://app.harvous.com/api/status/public` returns JSON.

## Local verification

```bash
# API (with dev server running)
curl -s http://localhost:3001/api/status/public | jq .

# UI
open http://localhost:4322/status
```
