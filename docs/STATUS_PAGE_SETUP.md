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
   - **Authentication (Clerk)** — Clerk status or sign-in probe
3. Note the **native Better Stack status URL** (not the custom domain) for `BETTERSTACK_STATUS_JSON_URL`.
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
