/**
 * The Cloudflare Worker fronting app.harvous.com / new.harvous.com.
 *
 * Replaces five things Netlify used to do (docs/CLOUDFLARE_MIGRATION.md):
 *   1. reverse-proxy /api/* to the Hono API on Fly
 *   2. the crawler-UA rewrite on /shared/* (was netlify/edge-functions/shared-og.ts)
 *   3. the stale-hashed-asset 404 guard (was a rule in public/_redirects)
 *   4. the legacy 301/302 redirects (were [[redirects]] blocks in netlify.toml)
 *   5. SPA fallback + static hosting (the `assets` binding in wrangler.jsonc)
 *
 * Everything else — Fly, Supabase, Clerk, Polar — is untouched. The SPA, the native
 * app, and the offline queue keep calling app.harvous.com and must not be able to
 * tell the difference.
 */

interface Env {
  ASSETS: Fetcher;
  /** https://harvous.fly.dev — set in wrangler.jsonc, per-env. */
  API_ORIGIN: string;
}

/**
 * Case-insensitive substrings matched against User-Agent.
 * Ported verbatim from netlify/edge-functions/shared-og.ts — keep the two in sync
 * until that file is deleted in cleanup.
 *
 * Note what does NOT come across: Netlify's declaration-level `config` matchers, which
 * existed as a *billing gate* (Aug 2026 bot floods burned ~772K of 1M free invocations
 * because a bare path glob invoked the function for every hit). Cloudflare's
 * `run_worker_first` has no UA filter, so this list is now only a behavioural check —
 * the cost question is handled by the plan tier instead.
 */
const CRAWLER_UA_SNIPPETS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Slack-ImgProxy',
  'Discordbot',
  'TelegramBot',
  'WhatsApp',
  'Applebot',
  'facebookcatalog',
  'meta-externalagent',
  'Pinterestbot',
  'Embedly',
  'Quora Link Preview',
  'outbrain',
  'vkShare',
  'W3C_Validator',
  'redditbot',
  'SkypeUriPreview',
  'Iframely',
  'Googlebot',
  'bingbot',
  'Baiduspider',
  'DuckDuckBot',
  'YandexBot',
  'ia_archiver',
];

const SHARE_PATH = /^\/shared\/(note|thread)\/([A-Za-z0-9]{12})\/?$/;

/**
 * Mirrors DEDICATED_PROTOTYPE_HOSTS in src/lib/prototype-path.ts. Keep the two in sync:
 * the app decides whether `/prototype` is a live route from this same set, and the
 * /prototype strip below is only correct on hosts that are in it.
 *
 * `localhost` is omitted deliberately — it is in the app's set for dev, but this Worker
 * never serves it.
 */
const DEDICATED_PROTOTYPE_HOSTS = new Set(['app.harvous.com', 'new.harvous.com']);

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_UA_SNIPPETS.some((snippet) => ua.includes(snippet.toLowerCase()));
}

/**
 * The [[redirects]] blocks from netlify.toml.
 *
 * THE ONE PLACE THIS WORKER IS NOT BYTE-FAITHFUL TO TODAY'S PRODUCTION — read before
 * assuming it is a regression. Verified against app.harvous.com on 2026-08-30: every one of
 * these rules is currently DEAD. `public/_redirects` ends in a `/* -> /index.html 200`
 * catch-all which Netlify evaluates first, so /thread_abc123 and /prototype/dashboard both
 * return the SPA shell at 200 and these [[redirects]] never fire. The Worker runs before the
 * asset lookup, so implementing them here makes them work for the first time.
 *
 * Kept deliberately, because the alternative is porting known-dead config into a fresh
 * implementation to preserve an ordering accident:
 *   - /thread_ /note_ /space_ (301): pure legacy-bookmark repair. Today those URLs reach the
 *     SPA's not-found state (router.tsx has no matching route — only a legacy `?space=`
 *     query-param reader). Cannot collide with the live /thread/$threadId etc. routes,
 *     which take a slash rather than an underscore.
 *   - /prototype/* (302): safe on exactly the two hosts this Worker serves. Both
 *     app.harvous.com and new.harvous.com are in DEDICATED_PROTOTYPE_HOSTS
 *     (src/lib/prototype-path.ts), where /prototype is never a live route and the SPA
 *     already strips the prefix client-side (spa/src/router.tsx:114). This just does it a
 *     round-trip earlier. On any OTHER host /prototype IS a live route — which is why the
 *     netlify.toml version was host-scoped, and why this must not be reused elsewhere.
 *
 * If either is unwanted, deleting this function is a safe no-op against current behaviour.
 *
 * The /prototype strip was host-scoped in netlify.toml (one block per host). It is
 * host-agnostic here for the reason above, and `new URL(path, url)` preserves whichever
 * host the request arrived on.
 */
function legacyRedirect(url: URL): Response | null {
  const p = url.pathname;

  // 302 — legacy bookmarks from when the prototype lived under /prototype/.
  //
  // HOST-GATED, and it must stay that way. `/prototype` is only a dead prefix on hosts in
  // DEDICATED_PROTOTYPE_HOSTS; everywhere else it is a LIVE route
  // (getPrototypeBasePath() returns '/prototype' when the host is not dedicated), so
  // stripping it there would break the app. status.harvous.com is exactly such a host —
  // it is served by this same build and this same Worker, and spa/src/router.tsx carries
  // the matching rule in so many words: "status.harvous.com owns `/` for the public status
  // page — never send it to /prototype."
  if (DEDICATED_PROTOTYPE_HOSTS.has(url.hostname) && p.startsWith('/prototype/')) {
    return Response.redirect(new URL(p.slice('/prototype'.length) + url.search, url).toString(), 302);
  }

  // 301 — old underscore URL format (/thread_ID) to the current one (/thread/ID).
  for (const [prefix, target] of [
    ['/thread_', '/thread/'],
    ['/note_', '/note/'],
    ['/space_', '/space/'],
  ] as const) {
    if (p.startsWith(prefix)) {
      return Response.redirect(new URL(target + p.slice(prefix.length) + url.search, url).toString(), 301);
    }
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── /api/* → the Hono API on Fly, streamed both directions.
    //
    // No Netlify-style ~28s proxy ceiling and no duplicated request headers, which is
    // what let CSRF be re-enabled in server/app.ts. Both public/_redirects rules
    // (/api/og/image/* and /api/*) pointed at the same origin, so one branch covers them.
    if (url.pathname.startsWith('/api/')) {
      const upstream = new URL(url.pathname + url.search, env.API_ORIGIN);
      return fetch(new Request(upstream.toString(), request));
    }

    // ── Crawlers on share URLs get server-rendered OG meta HTML from Fly so unfurls
    // carry og:title/og:description/og:image. Humans fall through to the SPA shell.
    const share = url.pathname.match(SHARE_PATH);
    if (share && isCrawler(request.headers.get('user-agent'))) {
      const [, kind, token] = share;
      const og = new URL(`/api/og/share/${kind}/${token}`, env.API_ORIGIN);
      return fetch(new Request(og.toString(), request));
    }

    // ── Hashed build assets must NEVER fall through to the SPA shell.
    //
    // Each deploy publishes a fresh dist-spa, so the previous deploy's
    // /assets/*-<hash>.js are gone. Answering those with index.html at 200 text/html
    // (a) fails the module MIME check as "Failed to fetch dynamically imported module"
    // and (b) gets cached by the service worker under the .js URL, making the failure
    // permanent. 404 is the honest answer. Same reasoning as the load-bearing rule this
    // replaces in public/_redirects.
    //
    // VERIFIED 2026-08-30 (wrangler dev, local workerd): this branch is REQUIRED. With
    // /assets/* removed from `run_worker_first`, a missing hashed asset returns
    // `200 text/html` — the SPA shell — which is exactly the poisoning case above.
    // `not_found_handling: "single-page-application"` does NOT exempt extension-bearing
    // paths. Re-confirm once against the deployed workers.dev URL at stage 2, then treat
    // it as settled: /assets/* stays in run_worker_first, and every hashed chunk therefore
    // bills a Worker invocation. That is what the plan-tier decision has to price in.
    if (url.pathname.startsWith('/assets/')) {
      const res = await env.ASSETS.fetch(request);
      const servedHtmlInstead =
        res.ok && (res.headers.get('content-type') ?? '').includes('text/html');
      if (servedHtmlInstead) return new Response('Not found', { status: 404 });
      return res;
    }

    // ── Legacy redirects, then static assets with SPA fallback.
    return legacyRedirect(url) ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
