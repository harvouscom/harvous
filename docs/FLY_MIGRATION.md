# Moving the API to Fly.io

The Hono API leaves Netlify Functions and runs as one always-on process on Fly.
Netlify keeps everything else — the SPA, redirects, headers, and the `shared-og`
edge function — and rewrites `/api/*` to Fly. Clients never learn about it: the
origin they call is still `app.harvous.com`, so the web SPA, the native Swift
app, and the offline mutation queue are unchanged.

## Why

Netlify's free plan is a single hard-capped pool of 300 credits/month covering
deploys (15 each), bandwidth (20/GB), and function compute (10/GB-hour).
Exceeding it does not throttle — the site goes offline until the 1st of the next
month. The `og-image` function ran at `memory = 3008` / `timeout = 26`, about
0.21 credits per full-length render, so roughly 1,400 crawler-triggered renders
would have consumed the entire month. That is the same traffic shape as the
August 2026 bot flood.

One `shared-cpu-1x` 1GB machine is ~$5.70/month flat, has no per-request billing
to weaponize, no invocation cap, no execution-time ceiling, a Postgres pool that
stays warm, and real Chromium instead of `@sparticuz/chromium`.

**This does not make the app feel faster to tap.** Optimistic mutations and the
offline queue already paint before the network. Server latency shows up in
first-load data readiness, offline-queue replay, and cold-start tail latency.

## What changed in the repo

| File | Purpose |
|---|---|
| `server/fly.ts` | Production entry point. Serves `server/app.ts` via `@hono/node-server`, warms the pool, starts the scheduler, drains on SIGTERM. |
| `server/scheduler.ts` | Runs the two `@daily` jobs in-process, replacing the Netlify scheduled functions. Calls their already-exported inner functions. |
| `server/utils/user-export-backup-store.ts` | Supabase Storage replacement for `@netlify/blobs` (which only has a context inside a Netlify Function). |
| `Dockerfile` / `.dockerignore` | Two-stage build: esbuild produces one self-contained bundle; the runtime image is Node + Chromium + `api.cjs`, no `node_modules`. |
| `fly.toml` | One always-on machine in `iad` (colocated with Supabase `aws-1-us-east-1`). |
| `.github/workflows/fly-deploy.yml` | `flyctl deploy --remote-only` on pushes to `main` that touch server code. |
| `scripts/fly-secrets-import.sh` | Pushes the server-side subset of `.env` into Fly. |

Behavior fixes that were latent Netlify couplings:

- `server/routes/og.ts` — all five origins now come from `getPublicAppOrigin()`
  instead of the request URL. Behind the proxy the request host is the API's, so
  canonical/image URLs and screenshot targets would otherwise point at a host
  with no app on it. `PUBLIC_APP_ORIGIN` in `fly.toml` pins it.
- `server/routes/notes.ts` — the dev note-save trail was gated on
  `process.env.NETLIFY`, which is unset on Fly; it would have appended a line to
  the container filesystem on every note save. Now gated on
  `isDeployedProductionLike()`.
- `server/constants/dev-featured-samples.ts` — `isDeployedProductionLike()` also
  recognizes `FLY_APP_NAME`, and `isTestRoutesForbidden()` now delegates to it
  rather than repeating the checks.

## Phase 2 — the app (done 2026-08-21)

App **`harvous`** in org `testament-made`, region `iad`, one `shared-cpu-1x`
machine with 1GB, live at **https://harvous.fly.dev**. Nothing in production
points at it yet.

Deployed from the working directory (`fly deploy --remote-only`) rather than
through Fly's GitHub launch flow — that flow clones the repo's default branch,
which has no Dockerfile until this branch merges. Deploying locally is also the
right order of operations: prove the image, then cut over, then let CI take it.

Verified on the deployed machine:

| Check | Result |
|---|---|
| `/api/health` | 200 in ~100ms (Netlify production measured 250-280ms) |
| `/api/votd/today` | 200 with real data — Postgres reachable |
| Scheduler | `[scheduler] next run in 155m` at boot |
| SIGTERM/SIGINT drain | `draining` → `drained cleanly` when a machine was destroyed |
| OG screenshot | 200, real 1200×630 PNG, `x-og-source: screenshot` |
| Image size | 319 MB |

Two things worth knowing:

- **Fly auto-creates a second machine for HA on first deploy**, doubling the
  cost. Scaled back with `fly scale count 1`. Reverse it with `fly scale count 2`
  if zero-downtime deploys become worth ~$5.70/mo.
- **OG renders take ~6s warm and ~36s cold.** The cold case would have exceeded
  Netlify's `timeout = 26` and returned nothing, so that path was likely already
  failing there intermittently. 6s is still slow for a crawler; each render boots
  a fresh Chromium and loads the full SPA bundle. Reusing a browser instance
  across renders is the obvious fix — tracked separately, not a blocker.

### Still to do before cutover

1. **The 13 Netlify-only secrets.** `DRY_RUN=1 bash scripts/fly-secrets-import.sh`
   reports them. 21 of 34 came from `.env`; the rest — including every cron secret
   the GitHub scheduled workflows authenticate with (`VOTD_CRON_SECRET`,
   `BACKUP_CRON_SECRET`, `HMC_SYNC_CRON_SECRET`, `INBOX_RESET_SECRET_TOKEN`,
   `SUPPORT_NOTIFY_SECRET_TOKEN`) — live only in the Netlify dashboard under Site
   settings → Environment variables. Copy them there, then re-run the script
   without `DRY_RUN`. Those endpoints 401 after cutover otherwise.
2. **A private `user-exports` bucket** in Supabase (Storage → New bucket, not
   public), or the nightly backup job returns 503.
3. **`FLY_API_TOKEN`** as a GitHub repository secret, so `fly-deploy.yml` can
   deploy once this merges: `fly tokens create deploy --name github-actions`.

## Phase 3 — bake before cutover

Nothing points at Fly yet, so this is all non-destructive.

```bash
curl -s -w " | %{http_code} %{time_total}s\n" https://harvous.fly.dev/api/health
```

Run the real SPA against it — the Vite proxy keeps it same-origin, so auth and
cookies behave as in production:

```bash
VITE_API_PROXY_TARGET=https://harvous.fly.dev npm run dev:spa
```

Exercise sign-in, note create/edit with scripture pills, spaces, billing pages,
and an OG render (`/api/og/image/note/<token>`). Watch `fly logs` for the
scheduler line — it prints `[scheduler] next run in Nm` at boot and logs each
job's result at 00:00 UTC.

Worth confirming specifically: webhook signature verification still passes.
`server/routes/webhooks.ts` carries workarounds for Netlify duplicating headers
into `"v, v"`; Fly does not do this, and the workarounds take the first
comma-split value, so they are inert rather than wrong — but this is the code
path that silently disabled CSRF for months, so verify rather than assume.

## Phase 4 — cutover

One commit, reverting cleanly. In `public/_redirects`, point the two API rules at
Fly, keeping their order and the `/assets/*` rule below them:

```
/api/og/image/*  https://harvous.fly.dev/api/og/image/:splat  200
/api/*           https://harvous.fly.dev/api/:splat           200
/assets/*        /assets/:splat                               404
/*               /index.html                                  200
```

The `/assets/* → 404` rule is load-bearing: hashed chunks from a previous deploy
must 404 rather than fall through to `index.html`, or the service worker caches
HTML under a `.js` URL permanently.

Merge, let Netlify deploy, then smoke production: sign in, save a note, and
unfurl a share link with a crawler user-agent. The GitHub cron workflows keep
calling `app.harvous.com/api/...` and are proxied through transparently.

Rollback is `git revert` of that commit.

## Phase 5 — Netlify cleanup (after a quiet week)

- Drop `build:api` from the `netlify.toml` build command.
- Remove `[functions]`, both `schedule` entries, and the entire `og-image`
  `included_files` block.
- Delete `server/netlify.ts`, `server/og-image-function.ts`,
  `server/netlify-purge-shared-spaces.ts`,
  `server/netlify-audienceful-activity-sync.ts` (the scheduler imports their
  inner functions — move those first), and the `netlify/functions/*` outputs.
- Drop `@netlify/blobs` and `@sparticuz/chromium` from dependencies.
- Consider re-enabling the CSRF middleware in `server/app.ts` — it was disabled
  because Netlify's proxy headers caused false 403s. The proxy is still in the
  path until the SPA calls `api.harvous.com` directly, so this is not yet a free
  win.

## Not doing (yet)

Pointing the SPA at `api.harvous.com` directly would remove the Netlify proxy
entirely (and with it the duplicate-header quirk), but it needs CORS
configuration, Clerk cross-origin token handling, and a native-app base-URL
change. The proxy keeps this migration invisible to all three clients, which is
worth more than the extra hop.
