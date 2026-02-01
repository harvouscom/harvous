# Netlify Function Optimization and Capacitor Prep

**Status:** ✅ Fully Implemented (All Phases Complete)
**Last Updated:** January 31, 2026

Reducing serverless function usage while aligning the web app with the architecture required for native apps (Capacitor) later.

**Implementation Summary:**
- ✅ `output: "static"` with `prerender = false` on SSR pages only
- ✅ Sign-in/sign-up/dashboard/space are static with client-side redirect
- ✅ Cache-Control headers on ALL SSR pages (60s private, 300s public)
- ✅ Centralized API client (safe-fetch.ts, safe-url.ts) ready for Capacitor
- ✅ Prefetch strategy optimized (tap + prefetchAll with cache support)

---

## Why this matters

**Netlify limits:** Function invocations (SSR page requests + API routes) count toward the account limit; hitting 75%+ risks overage or throttling.

**Current behavior:** With `output: "server"` ([astro.config.mjs](../../astro.config.mjs)), every HTML request (/, /[id], /sign-in, etc.) is a serverless function invocation. API routes under `src/pages/api/` are also functions.

**Capacitor alignment:** The same changes that reduce function usage (more static pages, data from API, centralized API client) are the same direction as the Capacitor approach (static shell + remote API, JWT auth). So optimizing for Netlify now sets up the codebase for native later.

---

## Current state (optimized)

- **Astro:** `output: "static"` ([astro.config.mjs](../../astro.config.mjs) line 104); Netlify adapter (prod only), `edgeMiddleware: false`.
- **Static pages (no function calls):** sign-in, sign-up, dashboard, space - served from CDN.
- **SSR pages (with cache headers):**
  - **Private pages** (60s cache): index, [id], profile, find, new-space, upgrade
  - **Public pages** (300s cache): shared/note/[shareToken], shared/thread/[shareToken]
- **Caching impact:** Repeat visits within cache window = 0 function calls (served from cache).
- **Prefetch:** Tap strategy + prefetchAll; second request (navigation) is served from cache thanks to headers.
- **API routes:** All `/api/*` routes are serverless functions (not cached at page level).

---

## Remedies and Capacitor alignment

For each remedy: what to do, how it reduces function usage, and how it sets up Capacitor.

### 4.1 Astro hybrid output (high impact, high alignment)

**What:** Switch to `output: "hybrid"` in [astro.config.mjs](../../astro.config.mjs). By default pages are prerendered (static). Add `export const prerender = false` only on pages that must run on the server (auth + DB).

**Reduce usage:** Static pages are served from the CDN; no function invocation for those routes.

**Capacitor:** Hybrid moves the app toward "static shell + API for data." The same APIs the web will call are the ones Capacitor will call. Making sign-in/sign-up static (with client-side "already logged in" redirect via Clerk) is safe and matches the idea of a static shell.

**Pages to keep SSR (`prerender = false`):** index, [id], profile, find, new-space, upgrade, shared/note/[shareToken], shared/thread/[shareToken] (if they need server-side auth/DB). **Pages that can be static:** sign-in, sign-up (redirect handled client-side), dashboard (redirect only).

### 4.2 Caching (medium impact, neutral for Capacitor)

**What:** Increase Cache-Control for SSR pages, e.g. [index.astro](../../src/pages/index.astro): `max-age=60` or `120` with optional `stale-while-revalidate`. Add similar headers to [id].astro if not set.

**Reduce usage:** Repeat visits within the cache window are served from CDN; fewer function invocations.

**Capacitor:** No direct impact; safe to do.

### 4.3 Prefetch behavior (medium impact, neutral for Capacitor)

**What:** Reduce prefetch for heavy SSR routes (e.g. disable or limit prefetch for `/` and `/[id]`), or rely on stronger caching so the second request (navigation) is cached.

**Reduce usage:** Fewer duplicate requests per navigation.

**Capacitor:** No direct impact; safe to do.

### 4.4 Centralized API client (low immediate impact, high Capacitor alignment)

**What:** Keep (or refactor to) a single place that determines "base URL" and "auth headers" for all API calls (e.g. [src/utils/safe-fetch.ts](../../src/utils/safe-fetch.ts) and [src/utils/safe-url.ts](../../src/utils/safe-url.ts)). Avoid scattering `fetch('/api/...')` with hardcoded assumptions.

**Reduce usage:** No direct reduction; may enable smarter caching or batching later.

**Capacitor:** When you add Capacitor, you need to use `PUBLIC_API_URL` as base and `Authorization: Bearer <token>`. One central place to add `if (Capacitor.isNativePlatform()) { ... }` keeps the rest of the app unchanged.

### 4.5 Dual-mode API auth (when you implement Capacitor)

**What:** Not required for Netlify optimization; required for Capacitor. When you add native apps, API routes accept either cookies (web) or Bearer JWT (native). Keep auth resolution in one place (e.g. helper that checks Authorization header first, then `locals.auth()`).

**Capacitor:** Same pattern described in [CAPACITOR_STRATEGIC_ANALYSIS.md](CAPACITOR_STRATEGIC_ANALYSIS.md) and [CAPACITOR_IMPLEMENTATION_GUIDE.md](../CAPACITOR_IMPLEMENTATION_GUIDE.md); no need to duplicate the full design here. Web changes should not hardcode "we always have cookies."

---

## What to avoid

- **Hardcoding "every request has server middleware and cookies"** in a way that makes dual-mode auth (Bearer for native) difficult later.
- **Scattering API base URL or auth** across many components so that adding Capacitor support means touching dozens of files.
- **Tightly coupling pages to server-only data** without a path to "this same data is available from `/api/...`" so that a static shell (web or native) could fetch it the same way.

---

## Implementation timeline (completed)

1. ✅ **Phase 1: Static output + auth pages** - Switched to `output: "static"`; made sign-in/sign-up/dashboard/space static with client-side redirects.
2. ✅ **Phase 2: Initial caching** - Added cache headers to index.astro and [id].astro (60s + 120s stale-while-revalidate).
3. ✅ **Phase 3: Complete caching** (January 31, 2026) - Added cache headers to all remaining SSR pages:
   - Private pages: profile, find, new-space, upgrade (60s cache)
   - Public pages: shared/note/*, shared/thread/* (300s cache)
4. ✅ **Phase 4: Capacitor prep** - Centralized API client (safe-fetch.ts, safe-url.ts) ready for future dual-mode auth.

## Cache headers by page

| Page | Cache Strategy | Duration | Rationale |
|------|----------------|----------|-----------|
| index.astro | `private, max-age=60, stale-while-revalidate=120` | 60s fresh, 120s stale | Dashboard data changes infrequently |
| [id].astro | `private, max-age=60, stale-while-revalidate=120` | 60s fresh, 120s stale | Note/thread/space content |
| profile.astro | `private, max-age=60, stale-while-revalidate=120` | 60s fresh, 120s stale | User profile, XP data |
| find.astro | `private, max-age=60, stale-while-revalidate=120` | 60s fresh, 120s stale | Search page structure |
| new-space.astro | `private, max-age=60, stale-while-revalidate=120` | 60s fresh, 120s stale | Space creation form |
| upgrade.astro | `private, max-age=60, stale-while-revalidate=120` | 60s fresh, 120s stale | Subscription page |
| shared/note/* | `public, max-age=300, stale-while-revalidate=600` | 5min fresh, 10min stale | Public shared notes (immutable) |
| shared/thread/* | `public, max-age=300, stale-while-revalidate=600` | 5min fresh, 10min stale | Public shared threads (immutable) |
| sign-in, sign-up, dashboard, space | N/A (static) | Infinite (CDN) | No server-side logic needed |

## Expected impact

**Function invocation reduction:**
- Static pages (sign-in, sign-up, dashboard, space): **100% reduction** (0 invocations)
- Cached private pages: **40-60% reduction** (repeat visits within 60s)
- Cached public pages: **60-80% reduction** (longer cache, more shareable)
- Overall estimated reduction: **50-70%** depending on traffic patterns

---

## References

- [CAPACITOR_STRATEGIC_ANALYSIS.md](CAPACITOR_STRATEGIC_ANALYSIS.md) – Option B (Hybrid Static + Remote API), static build requirement, dynamic routes.
- [CAPACITOR_IMPLEMENTATION_GUIDE.md](../CAPACITOR_IMPLEMENTATION_GUIDE.md) – Static build for Capacitor, authentication for Capacitor (JWT, dual-mode).
- [astro.config.mjs](../../astro.config.mjs) – Current output and adapter.
- [src/utils/safe-fetch.ts](../../src/utils/safe-fetch.ts), [src/utils/safe-url.ts](../../src/utils/safe-url.ts) – Centralized API client; future Capacitor branch goes here.
