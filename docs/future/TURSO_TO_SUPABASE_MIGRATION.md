# Turso to Supabase Migration Plan

## Context

Harvous currently uses Turso (SQLite) for its database and Clerk for auth + billing. This plan documents migrating the **database only** from Turso to Supabase Postgres, while keeping Clerk for auth, billing, and future Organizations.

**Why keep Clerk:**
- Billing is deeply integrated via Clerk's native billing platform (checkout UI, subscription management, JWT feature flags) — no direct Stripe setup exists
- Organizations feature is planned for churches and built around Clerk Orgs
- Supabase Auth has no built-in billing or organizations equivalent
- Replacing Clerk billing would require building a full Stripe integration from scratch

**Why move the database:**
- Postgres benefits (real-time via Supabase Realtime, better querying, RLS)
- Cost/scalability improvements
- Unified data platform (DB + storage + realtime in one place)

This is a reference document for future execution, not for immediate implementation.

---

## Current Architecture

| Layer | Current | Target |
|-------|---------|--------|
| Database | Turso (SQLite via `@libsql/client`) | Supabase Postgres |
| ORM | Drizzle (`drizzle-orm/libsql`) | Drizzle (`drizzle-orm/postgres-js`) |
| Auth | Clerk | **No change** (keep Clerk) |
| Billing | Clerk native billing | **No change** (keep Clerk) |
| Storage | Netlify Blobs (admin exports only) | Supabase Storage (optional) |
| Real-time | Polling-based sync (5min intervals) | Supabase Realtime |
| Hosting | Netlify Functions + SPA | No change |

- **21 database tables**, **75+ API endpoints**, **15 route files**, **21 utility files**
- All dates stored as ISO 8601 text strings
- Booleans stored as SQLite integers (0/1)
- Billing uses Clerk JWT feature flags (`unlimited_notes` in `fea` claim)
- Spaces/Members are a custom DB system (not Clerk Orgs)

---

## Phase 1: Database Migration (Turso SQLite -> Supabase Postgres)

### Schema conversion (`server/db/schema.ts`)
- Convert all 21 tables from `sqliteTable()` to `pgTable()` (import from `drizzle-orm/pg-core`)
- Convert `integer('col', { mode: 'boolean' })` -> `boolean('col')` for ~10 boolean columns
- Keep dates as `text()` initially to avoid timezone bugs; convert to `timestamp` later
- Index definitions are structurally compatible between sqlite-core and pg-core

### Client swap (`server/db/client.ts`)
- Replace `@libsql/client` + `drizzle-orm/libsql` with `postgres` + `drizzle-orm/postgres-js`
- Lazy singleton pattern stays the same
- Use Supabase's connection pooler (pgBouncer, port 6543) for serverless compatibility

### Drizzle config (`drizzle.config.ts`)
- Change `dialect: 'turso'` to `dialect: 'postgresql'`
- Update `dbCredentials` to use `SUPABASE_DATABASE_URL`

### Critical API change: `.get()` method
- **139 occurrences across 10+ files** — Drizzle's Postgres driver has no `.get()` method
- Replace with array access `[0]` or create a `getOne()` helper
- `.all()` can be removed — Postgres driver returns arrays by default
- `.returning().get()` becomes `.returning()` + `[0]`
- This is the highest-effort mechanical change

### Build config (`package.json`)
- Remove esbuild alias `--alias:@libsql/client=@libsql/client/web` (Postgres driver is pure JS)

### Data migration
1. Export all tables from Turso as JSON
2. Transform: integer booleans (0/1) -> true/false
3. Import into Supabase via `postgres` client or Supabase SQL editor
4. Verify: row counts, spot-check records, FK relationships

### Files impacted (database layer)
- `server/db/schema.ts` — all 21 table definitions
- `server/db/client.ts` — connection setup
- `server/db/index.ts` — re-exports (may need import path updates)
- `drizzle.config.ts` — dialect and credentials
- All 15 `server/routes/*.ts` files — `.get()` calls
- All 21 `server/utils/*.ts` files — `.get()` calls
- `server/utils/dashboard-data.ts` — largest file (78 query calls, 13 raw SQL)

---

## Phase 2: Clerk + Supabase Integration

Since Clerk stays, configure it to work with Supabase:

### Clerk-Supabase JWT integration
- Configure Clerk to issue Supabase-compatible JWTs (Clerk has a built-in Supabase JWT template)
- This allows RLS policies to use `auth.uid()` which maps to the Clerk user ID
- No middleware changes needed — Clerk continues to handle auth, Supabase just needs the JWT for RLS

### Key files (minor updates only)
- `server/middleware/auth.ts` — no changes, Clerk verification stays
- `server/utils/subscription.ts` — no changes, `auth.has()` still reads Clerk JWT
- `server/utils/tier-limits.ts` — no changes, still calls Clerk billing API

### Supabase client setup (new)
- Add a Supabase client for real-time subscriptions and storage (frontend only)
- Pass Clerk's session token to Supabase client for RLS: `supabase.auth.setSession({ access_token: clerkToken })`
- Backend continues using Drizzle directly (no Supabase client needed server-side)

---

## Phase 3: Storage Migration (Netlify Blobs -> Supabase Storage) — Optional

- **Minimal scope**: only `server/routes/admin.ts` uses Netlify Blobs for CSV backup exports
- Create `user-exports` bucket in Supabase Storage
- Replace `getStore()` calls with `supabase.storage.from('user-exports')`
- Can skip this phase entirely if Netlify Blobs is working fine

---

## Phase 4: Real-time (Polling -> Supabase Realtime)

### Current sync system (`server/routes/sync.ts`)
- `POST /api/sync/push` — client sends mutations
- `GET /api/sync/bootstrap` — initial full load
- `GET /api/sync/changes` — incremental sync via `updatedAt` cursor
- Client polls every 5 minutes + on tab visibility change

### Tables that benefit from real-time
- **High**: Notes, Comments, Members, Threads, NoteThreads (collaborative)
- **Medium**: Tags, NoteTags, UserMetadata (cross-device)
- **Low**: XP, Streaks, Analytics, Inbox (polling is fine)

### RLS policies
- Required for Supabase Realtime to filter events per user
- Use Clerk-issued Supabase JWT so `auth.uid()` returns the Clerk user ID
- Write policies like: `userId = auth.uid()` for user-owned tables
- For shared spaces: policy checks membership via `Members` table

### Implementation strategy
1. Enable RLS on high-value tables, write per-user policies
2. Add Supabase Realtime subscriptions alongside existing polling
3. Reduce polling to 30-minute fallback
4. After confidence period, remove polling
5. `POST /api/sync/push` stays — real-time is server-to-client only

---

## Phase 5: Environment & Dependencies

### Remove packages
`@libsql/client`

### Add packages
`@supabase/supabase-js` (for real-time + optional storage), `postgres` (for Drizzle)

### Keep packages (no change)
`@clerk/backend`, `@clerk/clerk-react`, `@netlify/blobs` (if not migrating storage)

### Environment variables
- Remove: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN`
- Add: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DATABASE_URL` (direct Postgres connection string)
- Keep: All `CLERK_*` env vars unchanged

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data loss during migration | Critical | Full Turso backup, row count verification, 30-day parallel run |
| `.get()` API incompatibility (139 calls) | High | Helper function + automated replacement |
| Supabase connection pooling limits | Medium | Use pgBouncer (port 6543) for serverless |
| RLS policies block legitimate queries | High | Start with RLS disabled, enable table-by-table |
| Raw SQL incompatibility | Low | All current raw SQL is ANSI-standard (verified) |

### Rollback strategy
- Keep Turso running 30+ days post-migration
- Feature-flag database client via env var (`DATABASE_PROVIDER=supabase|turso`) in `client.ts`
- Consider dual-write during first week for zero-data-loss rollback

---

## Execution Order

| Phase | Scope | Est. Duration | Dependencies |
|-------|-------|---------------|-------------|
| 1. Database | Schema, client, queries, data migration | 2 weeks | None |
| 2. Clerk+Supabase | JWT template, Supabase client setup | 2-3 days | Phase 1 |
| 3. Storage | Admin exports bucket swap (optional) | 1 day | Phase 1 |
| 4. Real-time | RLS, subscriptions, sync system update | 2 weeks | Phase 1 + 2 |
| 5. Cleanup | Remove `@libsql/client`, delete Turso | 1 day | All phases |

Total estimated scope: ~5 weeks (down from 7, since auth stays on Clerk).
