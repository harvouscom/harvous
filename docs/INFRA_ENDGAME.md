# Infra Endgame: Cloudflare + Fly + Clerk + Polar

**Status: PLANNED — no phase executed yet.** Drafted 2026-08-27.

This is the strategy doc for retiring Netlify and Supabase without rewriting the
application. It exists because two separate investigations converged on the same
conclusion in August 2026:

1. A serious look at migrating to Laravel Cloud + Inertia found the backend rewrite
   disproportionate (see "Roads not taken" below).
2. The August bandwidth overage made Netlify's role — a CDN and reverse proxy —
   the least reliable and now most expensive layer in the stack.

The four phase docs are the runbooks. This doc is the map: why, in what order, and
what the end state looks like.

| Phase | Doc | What moves | Depends on |
|---|---|---|---|
| A | [CLOUDFLARE_MIGRATION.md](CLOUDFLARE_MIGRATION.md) | Static SPA, `/api/*` proxy, headers, crawler OG rewrite, DNS | nothing |
| B | [REALTIME_DURABLE_OBJECTS.md](REALTIME_DURABLE_OBJECTS.md) | Supabase Realtime → Durable Objects | A |
| C | [STORAGE_R2_MIGRATION.md](STORAGE_R2_MIGRATION.md) | Supabase Storage buckets → R2 | A |
| D | [POSTGRES_EXIT.md](POSTGRES_EXIT.md) | Supabase Postgres → Fly Managed Postgres or Neon | B and C |

Each phase is independently shippable, independently reversible, and worth doing
even if the later ones never happen.

---

## Where the stack actually is (verified 2026-08-27)

Production is a React 19 SPA (Vite + TanStack Router, `spa/` → `dist-spa/`) plus a
Hono API (`server/app.ts`, ~45 route modules, ~359 endpoints) running on an
always-on Fly machine in `iad` ([FLY_MIGRATION.md](FLY_MIGRATION.md)). Astro is
gone. Auth is Clerk end to end. Billing is Polar. A first-party SwiftUI app
(`native/Harvous/`) and the Capacitor wrappers consume the same HTTP API at
`app.harvous.com` and never learn where it's hosted.

**Netlify's five remaining roles** — all of them CDN-layer, none of them compute:

1. Static host/CDN for `dist-spa/`
2. Domain fronting + TLS for `app.harvous.com` and `new.harvous.com`
3. Reverse proxy `/api/*` → `https://harvous.fly.dev` (`public/_redirects`)
4. Headers: CSP, HSTS, and the cache tiering in `netlify.toml`
5. One edge function: crawler-UA rewrite on `/shared/*` (`netlify/edge-functions/shared-og.ts`)

**Supabase's three roles** — only one of which is "a database provider":

1. Postgres, accessed as plain Postgres via Drizzle + postgres.js (only 5 files
   import the Supabase SDK)
2. Realtime broadcast + presence (3 channel families; best-effort by design —
   "HTTP sync is authoritative")
3. Storage: `note-attachments` (public), `library-files` (private),
   `user-exports` (private)

## Why Netlify goes first

The incident record, all from `docs/FLY_MIGRATION.md`, `docs/` history, and the
August billing event:

- **The proxy duplicates headers** ("v, v"), which is why CSRF protection is
  *commented out* in `server/app.ts` (`server/middleware/csrf.ts`, disabled after
  false 403s) and why the Clerk/Svix webhook handler carries a first-comma-value
  workaround. A security control is off because of the CDN.
- **The proxy has a ~28s timeout.** The nightly backup returned 504 through
  Netlify while succeeding on Fly; `backup-user-exports.yml` now special-cases
  `https://harvous.fly.dev` to bypass its own CDN.
- **Edge invocations nearly hit the billing cap** (Aug 2026: bot floods on
  `/shared/*` burned ~772K of 1M free invocations in three weeks) and were saved
  only by declaration-level UA/pattern matchers — a billing gate, not a design.
- **The August 2026 bandwidth overage (151.7 GB vs 100 GB) paused every site on
  the account, including app.harvous.com.** The app was down because of other
  sites' bandwidth. The response — upgrading to Netlify Pro at $19/mo — bought
  headroom, not a fix: bandwidth is still metered.

Cloudflare doesn't meter bandwidth. That single fact retires the incident class
that actually took the app offline.

## Target architecture

```
                    ┌────────────────────────────────────────────┐
                    │  Cloudflare (zone: harvous.com)            │
   app.harvous.com  │  Worker: static assets (dist-spa) + SPA    │
   new.harvous.com  │  fallback, /api/* proxy, crawler OG        │
                    │  rewrite, headers                          │
                    │  Phase B: Durable Objects (realtime)       │
                    │  Phase C: R2 (attachments/files/exports)   │
                    └───────────────┬────────────────────────────┘
                                    │ /api/*
                    ┌───────────────▼────────────────────────────┐
                    │  Fly.io (iad)                              │
                    │  Hono API + in-process scheduler + OG      │
                    │  Phase D option: Fly Managed Postgres      │
                    └───────────────┬────────────────────────────┘
                                    │
                       Clerk (auth) · Polar (billing)
```

harvous.com (marketing, separate repo) and heresmychurch.com keep their own
hosting; only their DNS records ride along when the zone moves in Phase A.

## Cost

| | Today | After A | Endgame (A–D) |
|---|---|---|---|
| Netlify Pro | $19 | — | — |
| Cloudflare Workers Paid | — | $5 | $5 |
| Fly API (1 GB) | ~$6 | ~$6 | ~$6 |
| Supabase Pro | $25 | $25 | — |
| Fly MPG / Neon Postgres | — | — | ~$10–15 |
| R2 / DO storage | — | — | ~$0–1 |
| **Total** | **~$50/mo** | **~$36/mo** | **~$21–27/mo** |

Cost is the smaller half of the argument. The larger half: two infra vendors
instead of four, no bandwidth metering, CSRF re-enabled, no proxy timeout, and
every stateful Supabase dependency replaced by something either portable
(Postgres anywhere) or first-class on the platform already serving the app
(DOs, R2).

## Roads not taken

- **Laravel Cloud + Inertia (assessed Aug 2026, declined).** The premise dated
  from the Astro era. In reality it meant rewriting ~359 Hono endpoints and ~150
  server utils in PHP, porting shared TS logic (scripture detection is used on
  both client and server), hand-rolling Clerk JWT auth in a stack with no
  first-party SDK, and freezing the native/offline API contract through a
  cross-language rewrite — while the cost math *rose* (always-warm compute +
  per-active-second Postgres). Full Inertia additionally conflicts with the
  TanStack Query data layer, the Dexie offline queue, and the static bundle the
  native/Capacitor builds need. The proportionate fix was replacing the CDN
  layer; that is Phase A.
- **Cloudflare D1 for the database.** D1 is SQLite — Harvous already left SQLite
  (Turso) partly for Postgres full-text search — and it's only reachable from
  Workers while the API lives on Fly. Not considered further.
- **api.harvous.com direct-to-Fly split.** Deferred in FLY_MIGRATION ("not doing
  yet": CORS + Clerk cross-origin + native base-URL change). Phase A makes it
  cheap later (a DNS record on a zone we control), but the Worker proxy makes it
  unnecessary: same-origin is simpler for cookies, CSP, and the native app.

## Non-goals

- No backend rewrite, no Inertia, no framework change.
- Clerk and Polar are untouched in every phase.
- No behavior change visible to the SPA, the native app, or the offline queue —
  every phase must be invisible at the API contract level.

## Sequencing rules

- **A before everything.** B needs the Worker as a home for DOs; C wants
  attachments served behind `app.harvous.com` (a Worker route).
- **B and C are independent of each other** and can run in either order.
- **D goes last, deliberately.** After B kills the plpgsql Realtime authz
  function and C kills the storage buckets, Supabase is *only* Postgres — the
  move becomes a pure database migration with zero SDK remnants, executed with
  the playbook precedent of `scripts/migrate-turso-to-supabase.ts`.
- Between phases: soak, measure (each runbook names its numbers), then clean up.
  No phase's cleanup starts until its measurements hold.

## How to execute

Each phase doc ends with its own "How to execute" section. Start with
[CLOUDFLARE_MIGRATION.md](CLOUDFLARE_MIGRATION.md); nothing else is actionable
until it lands.
