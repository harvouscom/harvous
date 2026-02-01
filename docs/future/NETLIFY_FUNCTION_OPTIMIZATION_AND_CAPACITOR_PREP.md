# Netlify Function Optimization and Capacitor Prep

**Status:** Implemented (Phases 1–3)  
**Last Updated:** January 2026

Reducing serverless function usage while aligning the web app with the architecture required for native apps (Capacitor) later.

**Implementation:** `output: "static"` with `prerender = false` on SSR pages and all API routes; sign-in/sign-up/dashboard/space are static with client-side redirect; Cache-Control increased on index and [id]; centralized API client documented in safe-fetch.ts and safe-url.ts.

---

## Why this matters

**Netlify limits:** Function invocations (SSR page requests + API routes) count toward the account limit; hitting 75%+ risks overage or throttling.

**Current behavior:** With `output: "server"` ([astro.config.mjs](../../astro.config.mjs)), every HTML request (/, /[id], /sign-in, etc.) is a serverless function invocation. API routes under `src/pages/api/` are also functions.

**Capacitor alignment:** The same changes that reduce function usage (more static pages, data from API, centralized API client) are the same direction as the Capacitor approach (static shell + remote API, JWT auth). So optimizing for Netlify now sets up the codebase for native later.

---

## Current state (brief)

- **Astro:** `output: "server"` ([astro.config.mjs](../../astro.config.mjs) line 104); Netlify adapter, `edgeMiddleware: false`.
- **Pages that invoke the function:** All non-API routes (index, [id], sign-in, sign-up, profile, find, new-space, upgrade, shared/*) are server-rendered; each request = one function invocation.
- **Caching:** [src/pages/index.astro](../../src/pages/index.astro) sets `Cache-Control: private, max-age=10, must-revalidate` (line 93)—short cache, so repeat visits still hit the function often.
- **Prefetch:** Astro prefetch (tap strategy, prefetchAll) can cause the same URL to be requested twice (prefetch + navigation), doubling invocations for those navigations.
- **API:** All `/api/*` calls are serverless functions; total usage = SSR + API.

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

## Suggested order of implementation

1. **Quick wins (no architectural change):** Increase caching for index and [id]; optionally tune prefetch. Reduces usage immediately.
2. **Hybrid (aligns with Capacitor):** Switch to `output: "hybrid"`; make sign-in/sign-up static with client-side redirect; add `prerender = false` only where needed.
3. **Ongoing:** Keep API calls centralized (safeFetch/buildAPIUrl or single apiClient) so that when you add Capacitor, only that layer needs to branch on `PUBLIC_API_URL` and Bearer token.

---

## References

- [CAPACITOR_STRATEGIC_ANALYSIS.md](CAPACITOR_STRATEGIC_ANALYSIS.md) – Option B (Hybrid Static + Remote API), static build requirement, dynamic routes.
- [CAPACITOR_IMPLEMENTATION_GUIDE.md](../CAPACITOR_IMPLEMENTATION_GUIDE.md) – Static build for Capacitor, authentication for Capacitor (JWT, dual-mode).
- [astro.config.mjs](../../astro.config.mjs) – Current output and adapter.
- [src/utils/safe-fetch.ts](../../src/utils/safe-fetch.ts), [src/utils/safe-url.ts](../../src/utils/safe-url.ts) – Centralized API client; future Capacitor branch goes here.
