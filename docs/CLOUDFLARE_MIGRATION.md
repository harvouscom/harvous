# Phase A: Netlify → Cloudflare (app.harvous.com)

**Status: STAGE 4 COMPLETE — all three hosts (app, new, status) serve the Worker; authenticated smoke test passed; Netlify serves nothing. Next: freeze Netlify auto-publish, soak one week, then cleanup (CSRF first).** Drafted 2026-08-27. Part of [INFRA_ENDGAME.md](INFRA_ENDGAME.md).

Moves everything Netlify still does for app.harvous.com onto Cloudflare Workers:
static SPA hosting, the `/api/*` → Fly proxy, headers/CSP, the crawler OG rewrite,
and DNS/TLS for the zone. Fly, Supabase, Clerk, and Polar are untouched. The web
app, the native app, and the offline queue keep calling `app.harvous.com` and must
not be able to tell the difference.

This is the seventh sibling of the "Six Sites to Cloudflare" runbook (the other
Netlify properties, which use Cloudflare Pages). This one cannot use Pages — see
the architecture decision — but the five-phase cutover shape is the same.

---

## Architecture decision: Workers with static assets, not Pages

Verified against Cloudflare docs (2026-08-27):

- Cloudflare's `_redirects` **cannot 200-proxy to an external domain** ("Proxying
  will only support relative URLs on your site. You cannot proxy external
  domains."). The `/api/*` → `harvous.fly.dev` proxy therefore requires code.
- Workers static assets supports `run_worker_first` with path patterns
  (e.g. `"/api/*"`, negations like `"!/api/docs/*"`), and
  `not_found_handling: "single-page-application"` for SPA fallback.
- Pages is in maintenance mode; Workers is the platform's recommended target for
  new projects, and the only one where DOs (Phase B) attach directly.

One Worker serves everything: assets from `dist-spa/`, Worker code first for the
paths that need logic.

### Plan tier: Workers Paid ($5/mo) from day one

Netlify's edge function survives bot floods via *declaration-level* UA/pattern
matchers — requests that don't match never bill. `run_worker_first` has no UA
filter: **every** `/api/*` and `/shared/*` request invokes the Worker. The Aug
2026 bot flood ran ~772K invocations in three weeks (~37K/day average, spikier at
peak). Stacked on normal API traffic, the Workers **Free tier's 100K requests/day
cap is plausibly reachable — and Free-cap overrun drops requests rather than
billing them.** A dropped `/api/sync/push` is data-loss-adjacent; $5/mo
(10M included requests) is the correct insurance and still $14/mo under Netlify
Pro. `public/robots.txt` (exists; disallows most of the app host) remains the
first line of defense against crawl volume.

---

## Repo changes

### 1. `wrangler.jsonc` (new, repo root)

```jsonc
{
  "name": "harvous-app",
  "main": "cloudflare/worker.ts",
  "compatibility_date": "2026-08-01",
  "assets": {
    "directory": "./dist-spa",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": [
      "/api/*",
      "/shared/note/*",
      "/shared/thread/*",
      "/assets/*"
    ]
  },
  "vars": { "API_ORIGIN": "https://harvous.fly.dev" },
  "routes": [
    { "pattern": "app.harvous.com", "custom_domain": true }
  ],
  "env": {
    "staging": {
      "name": "harvous-app-staging",
      "vars": { "API_ORIGIN": "https://harvous.fly.dev" },
      "routes": [
        { "pattern": "new.harvous.com", "custom_domain": true }
      ]
    }
  }
}
```

Notes:
- Staging (`new.harvous.com`) mirrors Netlify's `[context.staging]`: **dev Clerk
  publishable key, production DB.** The Clerk split happens at build time
  (`VITE_CLERK_PUBLISHABLE_KEY`), so staging is a *separate build* of `dist-spa`,
  not just a separate env var — the deploy workflow below builds per-target.
- `status.harvous.com` is currently a Netlify domain alias (see
  `docs/STATUS_PAGE_SETUP.md`) — carry it as an additional route or leave it on
  Netlify until the status page is revisited; decide during execution and note it
  in the status log.

### 2. `cloudflare/worker.ts` (new)

Skeleton — the real file ports the constants verbatim from
`netlify/edge-functions/shared-og.ts` (26 UA snippets, listed below) and keeps
the comments explaining each rule:

```ts
interface Env {
  ASSETS: Fetcher;
  API_ORIGIN: string; // https://harvous.fly.dev
}

// Verbatim from netlify/edge-functions/shared-og.ts — keep in sync until that
// file is deleted in cleanup. Case-insensitive substring match.
const CRAWLER_UA_SNIPPETS = [
  'facebookexternalhit', 'Facebot', 'Twitterbot', 'LinkedInBot', 'Slackbot',
  'Slack-ImgProxy', 'Discordbot', 'TelegramBot', 'WhatsApp', 'Applebot',
  'facebookcatalog', 'meta-externalagent', 'Pinterestbot', 'Embedly',
  'Quora Link Preview', 'outbrain', 'vkShare', 'W3C_Validator', 'redditbot',
  'SkypeUriPreview', 'Iframely', 'Googlebot', 'bingbot', 'Baiduspider',
  'DuckDuckBot', 'YandexBot', 'ia_archiver',
];

const SHARE_PATH = /^\/shared\/(note|thread)\/([A-Za-z0-9]{12})\/?$/;

// Legacy 301s from netlify.toml. /prototype strip is host-agnostic here because
// this Worker only ever serves app.harvous.com / new.harvous.com.
function legacyRedirect(url: URL): Response | null {
  const p = url.pathname;
  if (p.startsWith('/prototype/')) {
    return Response.redirect(new URL(p.slice('/prototype'.length) + url.search, url), 302);
  }
  for (const [prefix, target] of [
    ['/thread_', '/thread/'], ['/note_', '/note/'], ['/space_', '/space/'],
  ] as const) {
    if (p.startsWith(prefix)) {
      return Response.redirect(new URL(target + p.slice(prefix.length) + url.search, url), 301);
    }
  }
  return null;
}

function isCrawler(ua: string | null): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return CRAWLER_UA_SNIPPETS.some((s) => lower.includes(s.toLowerCase()));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── /api/* → Fly, streamed both directions. No Netlify-style timeout;
    // no header duplication. Both the old /api/og/image/* rule and the /api/*
    // rule in public/_redirects pointed at the same origin, so one rule here.
    if (url.pathname.startsWith('/api/')) {
      const upstream = new URL(url.pathname + url.search, env.API_ORIGIN);
      return fetch(upstream, request);
    }

    // ── Crawlers on share URLs get server-rendered OG meta HTML from Fly;
    // humans fall through to the SPA shell.
    const share = url.pathname.match(SHARE_PATH);
    if (share && isCrawler(request.headers.get('user-agent'))) {
      const [, kind, token] = share;
      return fetch(new URL(`/api/og/share/${kind}/${token}`, env.API_ORIGIN), request);
    }

    // ── Hashed build assets must NEVER fall through to the SPA shell. A stale
    // /assets/*-<hash>.js answered with index.html gets cached by the service
    // worker under the .js URL, permanently. 404 is the honest answer.
    // (Same reasoning as the load-bearing rule in public/_redirects.)
    if (url.pathname.startsWith('/assets/')) {
      const res = await env.ASSETS.fetch(request);
      const isHtmlFallback = res.ok &&
        (res.headers.get('content-type') ?? '').includes('text/html');
      if (isHtmlFallback) return new Response('Not found', { status: 404 });
      return res;
    }

    // ── Legacy redirects, then assets (with SPA fallback).
    return legacyRedirect(url) ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

Implementation notes for the executing session:
- **Verify the `/assets/*` guard empirically.** With
  `not_found_handling: "single-page-application"`, confirm what `ASSETS.fetch`
  returns for a missing asset (it may serve `index.html` at 200). The
  content-type check above handles that shape; if the binding instead honors
  404s for non-navigation requests, simplify the guard. Either way the gate is
  the curl test below, not the assumption.
- The `/.well-known/web-app-origin-association` → `/well-known/...` 200 rewrite
  (Chrome fetches the dotted path; the file lives at the undotted one) can go in
  a `_redirects` file (it's same-site, which Cloudflare supports) or as two
  lines in the Worker. Prefer `_redirects` to keep the Worker minimal.

### 3. `public/_headers` (new — ships into `dist-spa/` via Vite's public dir)

Transcribed from `netlify.toml` (verified 2026-08-27). Cloudflare `_headers` has
its own specificity semantics, **not** Netlify's "later rule wins" ordering —
which is exactly the trap that once made `/assets/*` lose its `immutable` and
re-download the full bundle every visit. The gate below (curl matrix) is
mandatory before DNS changes; if Cloudflare's semantics can't reproduce the
tiering exactly, move headers into Worker code where order is explicit.

```
/*
  Cache-Control: no-cache, must-revalidate
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.com https://clerk.harvous.com https://*.js.stripe.com https://js.stripe.com https://*.posthog.com https://*.us.posthog.com https://challenges.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https://*.clerk.com https://clerk.harvous.com https://*.clerk.accounts.dev https://api.stripe.com https://*.posthog.com https://*.us.posthog.com https://api.bible.org; frame-src 'self' https://*.clerk.com https://clerk.harvous.com https://challenges.cloudflare.com https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  X-XSS-Protection: 1; mode=block
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  ! Cache-Control
  Cache-Control: public, max-age=2592000

/images/*
  ! Cache-Control
  Cache-Control: public, max-age=2592000

/icons/*
  ! Cache-Control
  Cache-Control: public, max-age=2592000
```

- The CSP already allowlists `challenges.cloudflare.com` (Clerk's Turnstile), so
  no CSP change is required by the move.
- `/api/*` headers (`no-store, no-cache, must-revalidate`; `/api/og/*` public
  1-day) are **not** in `_headers` — API responses come from the Worker's proxy
  branch, so Fly's response headers pass through. Verify Fly actually sets them
  (it does — `server/app.ts` sets Cache-Control defaults; the OG routes set
  their own); add explicit overrides in the proxy branch only if the curl matrix
  shows a gap.
- The `! Cache-Control` detach lines are the Cloudflare mechanism for "this rule
  replaces, not appends"; confirm exact syntax against current docs when
  executing.

### 4. `public/_redirects` (modified)

The Fly proxy lines are Worker code now. What remains (all same-site, supported
by Cloudflare):

```
/.well-known/web-app-origin-association  /well-known/web-app-origin-association  200
```

The `/assets/* 404` and SPA-catch-all rules are handled by the Worker/assets
config. **Keep a Netlify-compatible copy of the current file until cleanup** —
Netlify keeps deploying `main` as the rollback during the soak week, so the
executing session should stage the Cloudflare variants without breaking the
Netlify build (e.g. keep `public/_redirects` as-is for Netlify and generate the
Cloudflare `_redirects` in the deploy workflow, or cut over the file in the same
commit that changes DNS — decide at execution, note in the status log).

### 5. `.github/workflows/cloudflare-deploy.yml` (new)

```yaml
name: Deploy to Cloudflare
on:
  push:
    branches: [main, staging]
    paths:
      - 'spa/**'
      - 'src/**'
      - 'shared/**'
      - 'public/**'
      - 'cloudflare/**'
      - 'wrangler.jsonc'
      - 'package*.json'
      - 'vite.config.ts'
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci --prefer-offline --no-audit
      - run: node scripts/inject-sw-cache-version.js
      - run: npm run build:spa
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ github.ref_name == 'main' && secrets.VITE_CLERK_PUBLISHABLE_KEY_LIVE || secrets.VITE_CLERK_PUBLISHABLE_KEY_DEV }}
          # …plus the VITE_POLAR_* / PUBLIC_POSTHOG_* vars currently set in the
          # Netlify build environment (see netlify.toml SECRETS_SCAN_OMIT_KEYS
          # for the full VITE_ list — they are public identifiers, not secrets).
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy ${{ github.ref_name == 'staging' && '--env staging' || '' }}
```

- `build:api` (the Netlify Functions bundle) is **not** part of this build — it
  exists only for the Netlify rollback path and dies in cleanup.
- The `paths:` filter replaces `scripts/netlify-skip-build.sh` (docs-only pushes
  don't deploy).
- `NODE_VERSION=22` and `NPM_FLAGS` from `netlify.toml` are reproduced by
  `setup-node` and the `npm ci` flags.
- Wrangler's non-interactive auth needs a `CLOUDFLARE_API_TOKEN` with
  Workers Scripts:Edit on the account — create it during execution.

---

## Full netlify.toml → Cloudflare mapping (verified against source 2026-08-27)

| Netlify | Cloudflare home |
|---|---|
| `[build]` command (`npm ci && inject-sw-cache-version && build:api && build:spa`) | GH Actions workflow above (minus `build:api`) |
| `ignore = netlify-skip-build.sh` | workflow `paths:` filter |
| `[functions]` api.cjs / og-image.cjs (bypassed since Fly) | dead — cleanup deletes |
| Scheduled fns `purge-shared-spaces`, `audienceful-activity-sync` `@daily` | already duplicated by Fly's in-process `server/scheduler.ts` (00:00 UTC) — Netlify copies die in cleanup, nothing to port |
| `[build.environment]` NODE_VERSION / NPM_FLAGS / SECRETS_SCAN_OMIT_KEYS | workflow env; secrets-scan allowance is Netlify-only, drops |
| 302 host-scoped `/prototype/*` strips (app + new) | Worker `legacyRedirect` |
| 301 `/thread_*`, `/note_*`, `/space_*` | Worker `legacyRedirect` |
| 200 `/.well-known/web-app-origin-association` rewrite | `_redirects` |
| 200 `/api/og/image/*` → og-image function (dead; `_redirects` sends it to Fly first) | folded into the `/api/*` proxy branch |
| `/api/*` + `/api/og/*` header blocks | pass-through from Fly via proxy branch |
| `/*` security/CSP block + cache tiers | `public/_headers` above |
| `[context.staging]` → new.harvous.com, dev Clerk | wrangler `env.staging` + per-branch build env |
| Edge function `shared-og.ts` (UA + pattern matchers as billing gate) | Worker crawler branch; billing gate replaced by Workers Paid tier |
| `public/_redirects` Fly proxy + `/assets/*` 404 + SPA catch-all | Worker proxy branch + assets guard + `single-page-application` fallback |

---

## Cutover runbook (five phases, matching the Six Sites artifact)

### 1. Build it on Cloudflare, change no DNS

Deploy the Worker (production env) and hit the `*.workers.dev` URL. Run the
**parity matrix** (script it — it re-runs in phases 2, 4, and 5):

```bash
BASE=https://harvous-app.<account>.workers.dev   # then https://app.harvous.com post-cutover
# Headers per path class
curl -sI $BASE/ | grep -iE 'cache-control|content-security|strict-transport'
curl -sI $BASE/assets/$(curl -s $BASE/ | grep -o 'assets/index-[^"]*\.js' | head -1 | cut -d/ -f2)
#   → MUST be: cache-control: public, max-age=31536000, immutable
curl -sI $BASE/fonts/anything.woff2 ; curl -sI $BASE/images/x.webp ; curl -sI $BASE/icons/x.png
curl -sI $BASE/api/health            # → no-store from Fly, 200, ~100ms from iad-adjacent
# Redirect statuses
curl -sI $BASE/prototype/dashboard   # → 302 /dashboard
curl -sI $BASE/thread_abc123         # → 301 /thread/abc123
curl -sI $BASE/.well-known/web-app-origin-association  # → 200, JSON body
# Stale-asset honesty
curl -sI $BASE/assets/index-DOESNOTEXIST.js   # → 404, NOT 200 text/html
# Crawler vs human on share URLs (use a real 12-char token)
curl -s -A "Twitterbot/1.0" $BASE/shared/note/AAAAAAAAAAAA | grep og:title   # → meta HTML
curl -s -A "Mozilla/5.0"    $BASE/shared/note/AAAAAAAAAAAA | grep -c '<div id="root"'  # → SPA shell
```

The `/assets/*` immutable line is the single most important check in this
document. Regression cost is quantified: ~703.7 KB gzipped `index.js`
re-downloaded on every visit (see `docs/performance/PERF_BASELINE.md`; the
identical mistake shipped once before on Netlify and is documented in
`netlify.toml`'s header-order comment).

### 2. Port config + staging

`_headers`/`_redirects` verified by the matrix; deploy `--env staging` and
confirm the staging build carries the **dev** Clerk key (view-source for
`pk_test_`), then sign in on the staging workers.dev URL.

### 3. Move harvous.com DNS to Cloudflare

The zone carries more than this app: the marketing site (separate repo, staying
on Netlify), possibly `status.harvous.com`, and any mail records.

1. `dig MX harvous.com`, `dig TXT harvous.com`, `dig +nostats ANY harvous.com` —
   save the output. Email breaks silently; check first.
2. Cloudflare → Add a site → harvous.com → Free plan. Diff the imported records
   against the dig output; add anything missing **before** touching nameservers.
3. Records pointing at Netlify (apex/`www` for the marketing site, `status`)
   stay **DNS-only** (grey cloud) so Netlify's TLS keeps working.
4. At Hover: replace nameservers with Cloudflare's pair. Propagation is minutes.
5. Nothing about app.harvous.com changes yet — its record still points at
   Netlify. This phase is pure DNS hosting.

### 4. Attach custom domains

Add `app.harvous.com` to the production Worker and `new.harvous.com` to staging
(Workers custom domains create the records and certs). Then the gates, in order:

1. Parity matrix against `https://app.harvous.com` (all lines).
2. **Authenticated Clerk smoke test** — sign in on the real domain and exercise a
   protected endpoint (e.g. load the dashboard, create + delete a note). All
   three Fly cutovers failed on exactly this class of error; a 200 from
   `/api/health` proves nothing about auth.
3. Webhooks through the new path: Clerk dashboard → send test event →
   `/api/webhooks/clerk` 2xx; Polar sandbox event → `/api/webhooks/polar` 2xx.
   Watch for the Svix header workaround (first-comma-value split) behaving with
   *clean* headers — it should, since first-of-one is the value itself.
4. PWA: `https://app.harvous.com/.well-known/web-app-origin-association`
   resolves; installed-PWA launch still routes.
5. Offline round-trip: airplane-mode a note edit, reconnect, confirm the queue
   drains (`/api/sync/push`) and no 4xx in the network log.
6. Native: a Debug-Prod build (`HARVOUS_API_BASE_URL = https://app.harvous.com`)
   syncs — the native app never knew about Netlify or Cloudflare, so this is
   pure proxy-fidelity verification.
7. Latency matrix: n=6 curl `time_total` on `GET /api/health` warm. Baseline
   through Netlify: 250–280 ms (2026-08-21, `.claude/agents/engineer.context.md`);
   Fly direct ~100 ms. Cloudflare must be ≤ Netlify; record both sides in
   `engineer.context.md`.

### 5. Soak, then retire

One week minimum with Netlify untouched (it keeps building `main`; rollback is
re-pointing the `app`/`new` DNS records — minutes, since the zone is on
Cloudflare either way now). Watch:

- Workers request count/day (dashboard) — record the daily average in the status
  log; sanity-check the Paid-tier decision.
- Error rate on the Worker; Fly logs for anything new.
- Service-worker update behavior for returning clients (the SW cache-version
  inject step still ran, so returning clients should update normally; a spike in
  "Failed to fetch dynamically imported module" means the `/assets/*` 404 guard
  is wrong — fix before proceeding).
- The nightly backup workflow — the historical 504 canary.

Then cleanup, each its own commit:

1. **Re-enable CSRF**: uncomment `csrfProtection` in `server/app.ts` (line ~70)
   — the duplicated-header cause of the false 403s left with Netlify. Verify
   sign-in, note save, and both webhooks after enabling. This is its own
   verified change, not a drive-by.
2. Point `backup-user-exports.yml` back at `app.harvous.com` (the ~28s proxy
   timeout is gone) — or leave it direct-to-Fly and delete the comment; either
   is fine, pick one and say so.
3. Delete: `netlify.toml`, `netlify/` (edge function + functions),
   `server/netlify.ts`, `server/netlify-purge-shared-spaces.ts` +
   `server/netlify-audienceful-activity-sync.ts` *wrappers only if Fly's
   scheduler imports the underlying logic directly — check imports first*,
   `scripts/netlify-skip-build.sh`, `npm run build:api`, and the `@netlify/*` +
   `@sparticuz/chromium` + `puppeteer-core` dependencies **only after confirming
   the Fly OG path uses the Debian chromium binary, not @sparticuz** (it does —
   `CHROME_EXECUTABLE_PATH=/usr/bin/chromium` in the Dockerfile — but verify the
   import graph before removing the package).
4. Delete the Netlify site; cancel Netlify Pro once the six sibling sites have
   also migrated (their runbook is the "Six Sites to Cloudflare" artifact).

## Measurement summary (what this phase must hold)

| Number | Baseline | Gate |
|---|---|---|
| `/assets/*` cache header | `public, max-age=31536000, immutable` | identical, pre- and post-DNS |
| `GET /api/health` warm, n=6 | 250–280 ms via Netlify; ~100 ms direct | ≤ Netlify; record in engineer context |
| Worker requests/day | unknown (est. <100K) | record during soak; validates tier |
| `npm run perf:check` | 1078.4 KB gzip initial payload | stays green (no frontend change expected) |

## How to execute

One session per numbered cutover phase is comfortable; 1–2 can share. Bring this
doc, `netlify.toml`, `public/_redirects`, and `netlify/edge-functions/shared-og.ts`
into context. Update the **status log** below and
`.claude/agents/engineer.context.md` (latency + the stale "Netlify free plan"
section — the account has been on Pro since the Aug 2026 pause) as you go.

## Status log

- 2026-08-27 — Doc drafted; nothing executed. All Netlify/repo facts verified
  against source this date; Cloudflare platform behaviors (`_headers` detach
  syntax, assets-binding 404 shape) flagged inline for empirical verification at
  execution time.

- 2026-08-30 — **Stage 1 built and verified locally. No Cloudflare account, no deploy, no DNS
  change yet.** Added `wrangler.jsonc`, `cloudflare/worker.ts`, `cloudflare/_headers`,
  `cloudflare/_redirects`, `scripts/cf-parity-check.sh`,
  `.github/workflows/cloudflare-deploy.yml`; `wrangler` + `@cloudflare/workers-types` as
  devDeps. `scripts/cf-parity-check.sh` reports **20/20 against `wrangler dev`**, and 16/20
  against production Netlify (the four gaps being the legacy redirects — see below).
  `npm run perf:check` green (1117.2 KB, 0.3 KB under baseline; the doc's 1078.4 KB figure
  had already moved).

  Five findings that change the runbook as drafted:

  1. **`scripts/inject-sw-cache-version.js` read only `COMMIT_REF`/`DEPLOY_ID`, both
     Netlify-only.** On GitHub Actions the build id fell back to empty, which ships a
     byte-identical `sw.js` for every deploy between two version bumps — returning clients
     then keep serving the previous deploy's `index.html` with dead chunk hashes. Fixed by
     adding `GITHUB_SHA` to the fallback chain. This would have been a soak-week mystery.
  2. **The `/assets/*` guard is REQUIRED — the tier question is settled against us.** With
     `/assets/*` removed from `run_worker_first`, local workerd answers a missing hashed asset
     with `200 text/html`; `not_found_handling: "single-page-application"` does not exempt
     extension-bearing paths. So every hashed chunk bills an invocation (~7 per cold load from
     the initial document alone, 90 built asset files in total). The drafted
     Workers-Paid-from-day-one recommendation stands, now on evidence rather than estimate.
  3. **Every legacy redirect in `netlify.toml` is dead in production.** Verified against
     app.harvous.com: `public/_redirects` ends in a `/* -> /index.html 200` catch-all that
     Netlify evaluates first, so `/thread_abc123` and `/prototype/dashboard` both return the
     SPA shell at 200 and the `[[redirects]]` blocks never fire. The Worker hits the same trap
     unless the paths are listed in `run_worker_first` — they now are, so these work for the
     first time. Deleting those four strings is the clean opt-out back to strict parity.
  4. **Cloudflare's `_headers` reproduced the cache tiering exactly**, `!` detach syntax and
     all — the ordering risk the doc flags as the #1 regression did not materialise. The files
     live at `cloudflare/` rather than `public/` so Vite does not also ship them to Netlify
     during the soak, keeping the rollback target byte-identical.
  5. **`public/.well-known/web-app-origin-association` now exists as a real file** and Vite
     copies the dotfile directory into `dist-spa`. The 200-rewrite is kept anyway to match
     current behaviour; revisit in cleanup.

  Also corrected in `.claude/agents/engineer.context.md`: the stale "Netlify free plan is a
  hard cap" section (the account is on Pro — 5,000 credits, measured 2,628.4 consumed in 9
  days), and the `/api/health` baseline (**182 ms** re-measured 2026-08-30, vs the 250-280 ms
  row that predates the Fly cutover).

- 2026-08-30 (later) — **Verified against REAL Cloudflare edge** via
  `wrangler deploy --temporary`, which spins up a throwaway preview account with no
  signup, no payment and no DNS (`https://harvous-app-preview.<temp>.workers.dev`).
  Every one of the 20 parity checks passed on real infrastructure. Three things this
  caught that local `wrangler dev` could not:

  1. **A hard deploy blocker the runbook never anticipated.** Workers assets reject any
     single file over **5 MiB**, and `dist-spa/assets/index-*.js.map` is ~10 MB, so the
     first upload failed outright (`code: 10304`). Fixed with `cloudflare/.assetsignore`
     excluding `*.map` — 14 MB across 34 files, **37% of a 38 MB deploy**, with no
     consumer: `vite.config.ts` sets `sourcemap: 'hidden'` so no `sourceMappingURL` is
     emitted, and no workflow uploads them to an error tracker. The deploy workflow now
     copies `.assetsignore` alongside `_headers`/`_redirects` and fails the build on any
     non-map asset over the limit.
  2. **Sourcemaps are publicly served on Netlify today** —
     `GET /assets/index-<hash>.js.map` returns **200 and 10.4 MB**, which makes the
     minified bundle trivially reconstructable. Closed on Cloudflare by the above; closing
     it on Netlify would mean changing the shared build, deliberately frozen until cleanup.
  3. **`_headers` specificity reproduces the Netlify tiering exactly on real edge** —
     `/assets/*` immutable, `/fonts|images|icons/*` at 30 days, `/*` no-cache, all seven
     security headers, and `/api/*` `no-store` passing through untouched from Fly. The
     ordering risk the doc calls the #1 regression did not materialise in either engine.

  Two caveats on the method, both about the throwaway account rather than the config:
  **temporary preview accounts challenge automated traffic** — roughly 20% of rapid
  requests come back as a bare 403, and some as Cloudflare's "Just a moment..."
  interstitial, on the same URL within the same second. `scripts/cf-parity-check.sh` now
  retries transient 403s and reports the count, since retries are expected on a temporary
  account and a red flag on a real one. A clean single-shot 20/20 therefore needs a real
  account. Latency measured 149-192 ms through Cloudflare to Fly against 182 ms through
  Netlify to Fly, but the challenge traffic makes that provisional — re-measure at stage 4.

- 2026-08-30 (stage 2) — **Deployed to the real account and the gate is CLEAR: 20/20, zero
  retries.** Account `Testament Made` / `ec934baa29eb81459ffeaf18ba044b9e`, authenticated
  by `wrangler login` (browser OAuth — no API token ever entered the working session).
  Worker live at `https://harvous-app.harvous.workers.dev`; `app.harvous.com` untouched and
  still entirely on Netlify. Latency 126-152 ms mean of 6 vs **182 ms** through Netlify, so
  the "≤ Netlify" gate is met with margin.

  Three things stage 2 changed:

  1. **`wrangler.jsonc` cannot carry the custom-domain route before stage 3.** harvous.com
     is not a zone on the account yet, so wrangler cannot resolve `app.harvous.com` and
     *every* deploy fails. Both `routes` blocks are now commented with a STAGE 4 marker and
     `workers_dev: true` added, which is what stages 1-2 test against. Uncomment at stage 4;
     that is the moment traffic actually moves.
  2. **`_headers` rules take ~30-60s to propagate after a deploy.** Runs started immediately
     after `wrangler deploy` reported random subsets of missing `cache-control` / HSTS that
     were all correct a minute later — seen on three separate deploys, and it is what made
     the earlier temporary-account runs look worse than they were.
     `scripts/cf-parity-check.sh` now polls for HSTS on `/` before running anything and says
     so, which is the difference between a trustworthy gate and a flaky one.
  3. **The deployed bundle is unauthenticated and cannot boot.** There is no `.env` in the
     worktree, so the local `build:spa` inlined no `VITE_CLERK_PUBLISHABLE_KEY` and no
     Supabase config; the page renders its theme background and React then throws
     `Missing VITE_CLERK_PUBLISHABLE_KEY env var`. **This does not affect the parity result** —
     the matrix exercises the Worker layer (routing, headers, proxy, redirects, crawler
     rewrite), all of which is what Phase A migrates. But it means the **authenticated Clerk
     smoke test cannot be run against this build**, and that is the single check that caught
     all three failed Fly cutovers. It needs a CI build carrying the real secrets — set the
     GitHub secrets, let `cloudflare-deploy.yml` build, then smoke-test that artifact
     *before* stage 3.

- 2026-08-30 (status host) — **`status.harvous.com` resolved, and it was hiding a bug.**
  The runbook left it as "decide during execution". Decision: it belongs on the **production
  Worker**, because it is a Netlify *domain alias of the same site* today — same `dist-spa`,
  with `isStatusHost()` (`src/lib/status-page-host.ts`) making the SPA render the status page
  at `/`. Putting it anywhere else would mean keeping the Netlify site alive purely for one
  alias, which blocks the "delete the Netlify site" cleanup step.

  The bug it exposed: `status.harvous.com` is **not** in `DEDICATED_PROTOTYPE_HOSTS`, so
  `/prototype` is a **live route** there — `spa/src/router.tsx` states it directly
  ("status.harvous.com owns `/` for the public status page — never send it to /prototype").
  `legacyRedirect()` stripped `/prototype/*` on every host, so attaching the status domain
  would have broken it. It is now gated on a mirror of `DEDICATED_PROTOTYPE_HOSTS`
  (app/new only — `localhost` omitted, this Worker never serves it); keep the two in sync.

  Consequence for the gate: the `/prototype` strip is **unverifiable on a `*.workers.dev`
  URL**, where the correct behaviour is *not* to redirect. `scripts/cf-parity-check.sh` now
  asserts both directions and picks which by hostname. Re-verified 20/20 after the change.

  Status-page data path is unaffected: it reads `/api/status/public` on Fly through the
  Worker proxy, and `BETTERSTACK_STATUS_JSON_URL` is a Fly env var that does not move. Per
  `docs/STATUS_PAGE_SETUP.md`, it must not point at `status.harvous.com/index.json` (loops).

  So **three** custom domains attach at stage 4, not one: `app.harvous.com` and
  `status.harvous.com` on production, `new.harvous.com` on `--env staging`.

- 2026-09-02 (**stage 4, staging half — new.harvous.com is on Cloudflare**) — Attached to
  `harvous-app-staging`. Verified on the real domain: `server: cloudflare`, HSTS, the
  `_headers` cache tiers, staging bundle `index-OS4t3bEc.js` carrying **pk_test_**, the
  `clerk.accounts.dev` CSP widening, `/api/health` 200 through the proxy, stale asset 404,
  and `/prototype/dashboard` → **302** `/dashboard`. That last one confirms the host-gated
  redirect works in both directions — no strip on `*.workers.dev`, strip on a dedicated host.

  **The rehearsal paid for itself: the attach failed the first time.**
  `Hostname 'new.harvous.com' already has externally managed DNS records ... Delete them
  first [code: 100117]` — Cloudflare will not overwrite a DNS record you manage. The existing
  `new → harvous-new.netlify.app` CNAME had to be deleted first.

  **This will happen again on `app.harvous.com`, and there it matters.** The sequence is
  *delete the CNAME, then attach*, and between those two steps the hostname does not resolve.
  On `new` that is nothing; on `app` it is a live outage window measured in however long the
  deploy takes. Do them back-to-back, with the rollback CNAME value in hand
  (`app → harvouscom.netlify.app`), and do not start unless able to finish.

- 2026-09-02 (**STAGE 4 COMPLETE — app.harvous.com is on Cloudflare**) — Traffic moved.
  Cloudflare serves `index-BzUzz5zc.js`, byte-identical to what Netlify was serving at the
  moment of the switch, with the live Clerk key. Verified on the real domain: HSTS,
  `/assets/*` immutable, `/api/health` 200 through the proxy to Fly,
  `/prototype/dashboard` → 302, stale asset → 404, and the site-inspired sign-in rendering
  with zero console errors. **The authenticated gate passed: signed in and created a note.**
  That is the check that failed all three Fly cutovers, and it passed first attempt here —
  because the artifact was already proven byte-identical to production before it was routed.

  **The dashboard could not do this, and that is worth recording.** Workers → Domains →
  "Connect domain" reported *"No zones match app.harvous.com"* while the zone was demonstrably
  live and serving; "Find similar" then opened a domain **purchase** screen offering
  `appharvous.com` and `app-harvous.com`. The attach succeeded from the CLI:

      npx wrangler triggers deploy

  which applies route/domain changes **without rebuilding**. That property was not a
  convenience — it was the safety requirement. A local `wrangler deploy` from this worktree
  would have rebuilt with no `.env`, inlined no Clerk key, and pushed a bundle that cannot
  boot straight to production at the exact moment traffic was moving.

  **The outage window is real and was measured.** Between deleting the `app` CNAME and the
  attach, public resolvers returned NO RECORD on both 1.1.1.1 and 8.8.8.8 while a stale local
  cache still answered 200 — which is exactly how this looks fine from the operator's machine
  and broken for everyone else. Verify a cutover with `dig @1.1.1.1` and `--resolve`, never
  with a plain `curl` from the machine that has been hitting the old host all day. Recovery
  is asymmetric too: the NXDOMAIN negative cache outlived the record's own 300s TTL.

  Remaining: `status.harvous.com` is still on Netlify (separate attach, and the last thing
  pinning the Netlify site).


  Also worth expecting: local resolvers cache the old CNAME for its TTL (15 min here), so the
  domain can appear to still serve Netlify well after the cutover succeeded. Verify with
  `curl --resolve` against the Cloudflare IP rather than trusting a stale local answer.


- 2026-09-01 (stage 2 complete, one gate re-ordered) — **CI now builds and deploys the real
  artifact, and it is byte-identical to Netlify's.** `harvous-app.harvous.workers.dev` serves
  `/assets/index-DTnuXr7O.js` at 2,718,358 bytes — the *same content hash and same bytes* as
  app.harvous.com. That is the strongest available proof the env reconciliation is right: had
  any of `VITE_SUPABASE_*`, `VITE_API_BASE_URL` or the rest been set, the hash would differ.
  Live Clerk key inlined (6 occurrences), zero Supabase project URLs, `sw.js` cache name now
  carries its commit sha (`harvous-cache-v2-87-2-5c3aeaec`), parity 20/20.

  **Two CI bugs found by checking rather than trusting the green tick:**

  1. The first run went green and deployed **nothing to production**. `deploy --env staging`
     executed on `main`, putting a live-Clerk build on the staging Worker while production
     kept serving a manual upload. Cause: GitHub's `A && B || C` is short-circuiting, not a
     ternary — an empty-string true-branch is falsy and falls through, so
     `ref_name == 'main' && '' || '--env staging'` sends *every* ref to staging. The
     non-empty value must sit in the TRUE position. Fixed by negating the condition.
  2. `wrangler.jsonc` cannot carry the custom-domain routes before the zone exists (already
     recorded above) — worth restating because it is the same class: config that reads
     correctly and behaves otherwise.

  **GATE RE-ORDERED — the authenticated smoke test cannot run on `*.workers.dev`.** Clerk
  production instances are domain-locked: loading the deployed app there fails with
  *"Production Keys are only allowed for domain harvous.com"*, and the page stays blank. The
  plan's ordering (smoke-test on workers.dev, then move DNS) is therefore impossible as
  written. Revised:

  - The **wrong-key failure mode that killed all three Fly cutovers is structurally ruled
    out here**, in a way it never was on Fly: the bundle is byte-identical to the one
    production serves today, so the key inside it is definitionally the working one. What
    remains untested is not the credential but whether Clerk works *through the Worker* —
    an Origin/proxy question, not a secrets question.
  - Exercise that on **staging with the dev Clerk key**: development instances are not
    domain-locked, so `harvous-app-staging.harvous.workers.dev` can be signed into and will
    exercise Clerk → Worker proxy → Fly → DB end to end. Do this before stage 3.
  - The live-key sign-in necessarily happens at **stage 4, immediately after attaching
    app.harvous.com**, with the DNS rollback standing by. Treat it as the first action after
    attach, not a later step.

- 2026-09-02 (**stage 3 complete — zone is on Cloudflare**) — Nameservers moved from
  `ns1/ns2.hover.com` to `lennox.ns.cloudflare.com` / `sara.ns.cloudflare.com`. Delegation
  propagated within minutes; Google, Cloudflare and Quad9 resolvers all see the new pair.
  Every record verified through 1.1.1.1 afterwards, and the live surfaces are unchanged:
  `app.harvous.com` 200 (still Netlify), `/api/health` 200 (still proxying to Fly),
  `clerk.harvous.com` 200, `www` 301. **No app traffic moved.**

  **Cloudflare's zone scan missed SEVEN records.** Switching on its import alone would have
  broken authentication and email:

  - `clerk`, `accounts` — auth. `clerk.harvous.com` failing to resolve takes down sign-in
    for every user, on Netlify, instantly.
  - `clkmail`, `clk._domainkey`, `clk2._domainkey` — Clerk transactional mail + DKIM.
  - `heymail._domainkey` — **HEY's DKIM.** Outbound mail from @harvous.com would have failed
    DKIM; with DMARC at `p=none` nothing bounces, deliverability just quietly degrades.
  - `subdomain-owner-verification` TXT — purpose unidentified, preserved anyway.

  It also defaulted **six** records to Proxied that had to be forced back to DNS-only: the
  apex A, `www`, `app`, `new`, `status`, and `mail` — the last of which would have put
  Hover's IMAP/SMTP behind an HTTP proxy.

  **The method lesson, worth more than the record list.** The `dig` snapshot committed the
  day before asserted "no hey1/hey2 DKIM selectors exist — HEY signs via the SPF include."
  That was wrong: the selector is `heymail`, and the conclusion came from probing *guessed*
  names and treating their absence as evidence. The first verification pass then reported
  "16 of 16 match, zero differences" — true, but comparing Cloudflare against the same
  incomplete list, so both sides agreed while both were missing the same records. **The
  registrar's own panel caught it.** A zone diff is only as good as its more complete side;
  compare against the registrar, never against your own capture.

  Final gate before the switch: 18 records diffed against **both** Cloudflare nameservers,
  0 failing.






- 2026-09-02 (**status.harvous.com attached — Netlify now serves nothing**) — All three hosts
  are on the Worker. `/api/status/public` proxies to Fly correctly, so the status page's data
  path is intact.

  **The host gate is now proven live, on the host that motivated it:**

  | path | `app.harvous.com` (dedicated) | `status.harvous.com` (not) |
  |---|---|---|
  | `/prototype/dashboard` | **302** → `/dashboard` | **200** — correctly not stripped |
  | `/thread_abc123` | **301** → `/thread/abc123` | **301** → `/thread/abc123` |

  Without the gate, `/prototype` — a live route on the status host — would have been stripped
  and broken it the moment the domain attached.

  **A false alarm worth recording, because this file already warned about it.** Right after
  the attach, a plain `curl https://app.harvous.com/thread_abc123` returned 200 instead of 301
  and looked like a regression. The response carried `server: Netlify`: this machine's
  resolver still held the pre-cutover CNAME, and the checks that had passed minutes earlier
  used `--resolve` while these did not. The stale-DNS caveat in the stage-4 entry above was
  written and then walked into within the hour. **Never verify a cutover with a plain curl
  from the machine that has been hitting the old host all day** — pin the IP, every time.

- 2026-09-03 (**a DEV MODE badge on an installed PWA — audited clean, then guarded**) — An
  installed home-screen app, added from `app.harvous.com` and never from staging, came up
  showing DEV MODE and authenticating against the Clerk **development** instance. Deleting
  and re-adding the install cleared it.

  **Every server-side path was audited and none of them served that bundle.** Netlify's
  production context has published nothing but `main` since Aug 4 and its production
  `VITE_CLERK_PUBLISHABLE_KEY` is `pk_live_`; Cloudflare's own deployment list for
  `harvous-app` shows two local uploads on Aug 31 — *before any domain was attached* — and
  CI-only deploys since; all four manual `workflow_dispatch` runs went to
  `harvous-app-staging`, whose logs say `deploy --env staging` every time. The live host,
  pinned through 1.1.1.1, serves the bundle the latest CI run built, carrying `pk_live_`
  and no dev key. **The exact moment that device acquired a dev build was not reconstructed**
  and is recorded as unexplained rather than guessed at.

  **What is not in doubt is why it persisted.** `public/sw.js` serves `/`
  stale-while-revalidate and `/assets/*` **cache-first with no revalidation at all**, and
  `service-worker-manager.js` shows a notice rather than reloading on the app shell,
  throttled further on iOS standalone. Whatever a device caches once, it keeps. The Clerk
  key is inlined at build time, so a cached bundle *is* a cached identity provider.

  Two guards were added, on the theory that "we could not reproduce it" is not a fix:

  - **`src/utils/production-clerk-key-guard.ts`**, called from `spa/src/main.tsx` before
    anything mounts. A `pk_test_` key on `app.harvous.com` or `status.harvous.com` now
    unregisters every worker, drops every cache and reloads **once**; a second failure shows
    a plain reload screen instead of looping or signing the user into the wrong instance.
    This only helps devices that have already picked up a build containing it — code cannot
    be retrofitted into a bundle that is already cached.
  - **A post-deploy step in `cloudflare-deploy.yml`** that fetches the real host through a
    public resolver and asserts the served bundle carries the right Clerk key, that it is
    *this* build's bundle, and that `/sw.js` carries this build's id. Deploy logs said
    "success" throughout the window in question; nothing checked what the world received.

  Two things worth keeping from building it. The key-matching pattern requires **20+ trailing
  key characters**, because the DEV MODE badge's own `startsWith("pk_test_")` literal ships
  in *every* build and a naive `grep pk_test_` flags production. And `curl … | grep -q`
  under `pipefail` **fails intermittently**: grep exits at the first match, curl takes
  SIGPIPE, and a passing check reports as a failure. Fetch to a file, then grep it. That one
  cost a debugging cycle and looked exactly like a real regression.

  Also fixed in passing: the recovery screens' "Reload App" button rendered dark-on-dark.
  `global.css` carries `button { color: var(--color-deep-grey) !important }`, which beats a
  plain inline colour — the pre-existing chunk-error screen in `main.tsx` had the same defect.
