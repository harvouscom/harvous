# Phase D: Supabase Postgres → Fly Managed Postgres or Neon

**Status: PLANNED — decision doc + playbook.** Drafted 2026-08-27. Part of
[INFRA_ENDGAME.md](INFRA_ENDGAME.md). Prerequisites: [Phase B](REALTIME_DURABLE_OBJECTS.md)
and [Phase C](STORAGE_R2_MIGRATION.md) complete, so Supabase is *only* Postgres
by the time this runs — no SDK imports, no Realtime RLS, no storage buckets.

This phase is optional in a way A–C are not: after B and C, Supabase Pro is a
$25/mo managed Postgres with PITR and a dashboard, which is a fair price. Do
this phase for consolidation (two infra vendors) and latency (colocate with the
API), not out of urgency. **Do not start it until B and C have soaked.**

---

## Portability audit (verified via full schema/code sweep, 2026-08-27)

The schema is unusually portable — a legacy of the SQLite/Turso origin
(`docs/WHY_SUPABASE.md`):

- **73 `pgTable` definitions** in one file, `server/db/schema.ts` (~2,400 lines).
- Column types: ~486 `text`, ~68 `integer`, ~28 `boolean`, 5 `real`,
  timestamps via the `ts()` helper (`timestamptz`, mode date). **Zero** jsonb,
  enums, uuid columns, arrays, generated columns, triggers, extensions,
  materialized views.
- **Quoted mixed-case identifiers** throughout (`"Notes"`, `"userId"`) — any
  tooling that lowercases unquoted identifiers will corrupt the schema; always
  quote.
- Postgres features actually in use:
  - **Full-text search** — `to_tsvector('english', …)` / `plainto_tsquery` /
    `ts_rank` / `@@` at ~10 sites in `server/routes/search.ts` and
    `server/routes/spaces.ts`, with GIN indexes from
    `scripts/add-fts-indices.sql`. Ports verbatim to any Postgres; this is why
    the target must be Postgres, not MySQL/SQLite.
  - Upserts: ~27 `onConflictDoNothing`, ~14 `onConflictDoUpdate`.
  - ~146 raw `` sql`…` `` fragments (coalesce, casts, ordering) — standard PG.
  - `harvous_realtime_topic_allowed` plpgsql — **gone after Phase B.**
- App-table RLS is enabled with **zero policies** (blanket lockout; the server's
  connection bypasses it) via `scripts/run-enable-rls.ts`. Nothing depends on it
  for authorization. On the new host: either re-run the same script for the same
  defense-in-depth or drop the concept — decide and document.
- **No migration history exists.** `drizzle.config.ts` points at `./drizzle`,
  which doesn't exist; the workflow is `drizzle-kit push` + hand-written scripts
  in `server/db/manual/` and `server/scripts/add-*-schema.ts`, guarded by
  `server/db/validate-schema.ts` (`npm run db:check`). The migration therefore
  moves **the live database**, not a migration chain. (Opportunity: introspect
  the new DB into a checked-in baseline migration afterward.)

## Connection surface

- Runtime: `server/db/client.ts` — postgres.js pool on `SUPABASE_DATABASE_URL`
  (Supavisor pooler, port 6543).
- Migrations/DDL: `SUPABASE_DIRECT_URL` (5432).
- ~80 maintenance scripts in `scripts/` + `server/scripts/` read the same env
  vars. The swap is env-var-shaped; consider renaming to `DATABASE_URL` /
  `DIRECT_DATABASE_URL` during the move so the names stop lying, with the old
  names accepted as fallbacks for one release.

## Decision: Fly Managed Postgres vs Neon

| | Fly MPG | Neon |
|---|---|---|
| Latency to API | **colocated in `iad`, sub-ms** — every query today crosses to Supabase's `aws-1-us-east-1` | good (also us-east) but cross-provider |
| Ops model | same dashboard/CLI as the API | separate vendor (defeats half the consolidation point) |
| PITR/backups | verify current MPG guarantees at execution time — this is the make-or-break check | strong (branching, PITR) |
| Scale-to-zero | n/a (always-on app anyway) | irrelevant here — the API keeps the pool warm |
| Price @ ~current size | ~$10–15/mo | ~$19/mo tier |

**Lean Fly MPG** for colocation + vendor count, **contingent on its
backup/PITR story passing inspection at execution time** — that story has been
the youngest part of Fly's platform. If it doesn't convince, Neon is the safe
choice and still retires Supabase. Whichever wins must have: automated daily
backups, PITR ≥ 7 days, and a tested restore *before* cutover day.

## Playbook (precedent: `scripts/migrate-turso-to-supabase.ts` — read it first)

1. **Rehearse on a copy.** `pg_dump` production → restore to the new host →
   `npm run db:check` (schema validator) passes → point a local dev server at
   it → smoke the app, exercise search (FTS + GIN indexes present —
   `scripts/add-fts-indices.sql` re-applied), run the Playwright suite against
   it (the disposable-DB suite that deliberately never runs in CI).
2. **Row-count + checksum parity script** across all 73 tables; save output.
3. **Cutover** (the app has an offline queue — a short write freeze is safe for
   clients, they queue and drain):
   - announce a maintenance window; stop the Fly machine (clients go offline
     gracefully — this is the designed degradation);
   - final dump/restore (or logical replication catch-up if rehearsal showed
     the dump window too long);
   - parity script again;
   - update Fly secrets to the new URLs; start the machine;
   - authenticated smoke test + a sync round-trip from web and native.
4. **Watch the sync watermarks.** `updatedAt` values migrate byte-identical
   with dump/restore, so `/api/sync/changes?since=` cursors held by clients
   remain valid — verify with a device that was offline across the cutover:
   its delta pull must return exactly the writes it missed, and
   `SyncDeletedEntities` tombstones must be intact (count parity).
5. Supabase Pro stays alive, untouched, for **30 days** as rollback, then
   export a final archival dump to R2 (`user-exports` bucket pattern) and close
   the project.

## Verification

- `npm run db:check` green against the new host.
- FTS: a search query returns ranked results and `EXPLAIN` shows the GIN index.
- Sync integrity: offline-across-cutover device converges; tombstone counts
  match; no 409 storm in Fly logs.
- Nightly jobs (scheduler + the six GitHub Actions crons) all green on their
  next scheduled run.
- Latency: re-run the n=6 `/api/health?warm=db`-style matrix; colocated MPG
  should shave measurable ms off data-bearing endpoints — record in
  `.claude/agents/engineer.context.md` (per its own note: sell this as
  first-load data readiness, not interaction speed).

## How to execute

Two sessions: (1) rehearsal — provision, restore, validate, decide MPG vs Neon
on evidence; (2) cutover night with the runbook above open. Read the data-agent
context first; the sync watermark semantics are its invariants.
