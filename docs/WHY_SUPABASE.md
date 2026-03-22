# Why Harvous Switched from Turso to Supabase

**Date:** March 2026
**Version:** 1.195.0

---

## The Short Version

Harvous migrated its database from Turso (SQLite) to Supabase (Postgres) to unlock Postgres-native features — full-text search, real-time subscriptions, and a path to collaboration — while keeping Clerk for auth and billing.

---

## What Was Turso?

Turso is a distributed SQLite service built on libSQL. Harvous used it from the start because:
- SQLite is simple and fast for single-user workloads
- Turso offered edge replicas for low-latency reads
- Drizzle ORM made it easy to get started quickly

It worked well for the early stages of the product.

## Why We Moved

### 1. Postgres Full-Text Search

The biggest immediate win. With Turso/SQLite, search used `LIKE '%query%'` — unindexed, no stemming, and degrading as data grows. Postgres gives us:

- **GIN-indexed full-text search** via `to_tsvector` / `plainto_tsquery`
- **Relevance ranking** with `ts_rank` so the best matches appear first
- **English stemming** — searching "running" finds notes containing "run"
- **10-50x faster** than LIKE on larger datasets

This was implemented on day one of the migration. See `server/routes/search.ts`.

### 2. Future Real-Time Sync

Harvous currently syncs via 5-minute polling (`src/utils/sync-manager.ts`). Supabase Realtime can push changes to clients instantly via WebSocket subscriptions on Postgres tables. This becomes critical when we add:

- Shared spaces with multiple editors
- Church organization features (Clerk Organizations)
- Live collaboration on notes

### 3. Supabase Storage for Media

The Tiptap editor roadmap includes embedded images, videos, PDFs, and link previews. Supabase Storage provides:

- S3-compatible object storage with CDN
- Signed URLs for private content
- Image transformations (resize, crop) built in
- No need for a separate file hosting service

### 4. Unified Platform

With Supabase handling database + storage + realtime, the infrastructure simplifies:

| Before | After |
|--------|-------|
| Turso for database | Supabase Postgres |
| Netlify Blobs for admin exports | Supabase Storage |
| Custom polling for sync | Supabase Realtime (future) |
| No search indexing | Postgres GIN indices |

### 5. Better Query Capabilities

Postgres unlocks patterns that SQLite couldn't do well:
- Window functions for analytics (streak calculations, usage stats)
- `jsonb` columns for flexible metadata
- Materialized views for expensive aggregations
- Proper `EXPLAIN ANALYZE` for query optimization

## What Didn't Change

- **Clerk** remains the auth and billing provider — it's deeply integrated with checkout flows, subscription management, JWT feature flags, and the planned Organizations feature for churches
- **Drizzle ORM** stayed as the query builder — we just swapped `drizzle-orm/libsql` for `drizzle-orm/postgres-js`
- **Hono** server framework — unchanged
- **All existing API routes** — same endpoints, same behavior, better performance

## Connection Architecture

```
App Runtime  →  Supabase Connection Pooler (port 6543, transaction mode)
Drizzle Kit  →  Supabase Direct Connection (port 5432, session mode)
```

The pooler handles connection multiplexing for serverless (Netlify Functions), while direct connections are used only for schema migrations.

## Migration Stats

- **77 new tests** added alongside the migration (scripture detector + rate limiter)
- **CSRF protection** added as part of the security hardening pass
- **Structured JSON logging** for Netlify function log aggregation
- **Zero downtime** — cut over by updating environment variables

## Lessons Learned

1. **Drizzle `mode: 'date'`** means timestamp columns expect `Date` objects in comparisons, not ISO strings. This tripped us up on the sync endpoint.
2. **Pooler vs Direct URLs matter** — using the direct URL (port 5432) from serverless functions causes connection timeouts. Always use the pooler for runtime.
3. **FTS for short queries needs care** — Postgres stemming can over-reduce short words like "Go", so we fall back to ILIKE for queries under 3 characters.
4. **The actual migration was straightforward** — Drizzle's abstraction meant most route code didn't change at all. The schema translated cleanly from SQLite to Postgres.
