-- Full-text index over verse text, for GET /api/scripture/search (the Library panel's
-- "In the Bible" results). See server/utils/scripture-verse-search.ts.
--
-- Usage: psql $SUPABASE_DIRECT_URL -f server/db/manual/add-bibleverses-fts.sql
-- (or paste into the Supabase SQL Editor — but CONCURRENTLY cannot run inside a transaction,
-- so run it as a single statement there, not wrapped in BEGIN/COMMIT).
--
-- One index across every translation: the query filters `translationId` alongside the text
-- match, and the expression has to be byte-for-byte the one the query uses —
-- to_tsvector('english', text) — or the planner will not pick it up.
--
-- CONCURRENTLY because BibleVerses is read by every chapter the reader opens; a plain
-- CREATE INDEX would block those reads for the minute or so the build takes (~340k rows).
-- Not in the Drizzle schema, for the same reason the Notes/Threads FTS indexes are not
-- (scripts/add-fts-indices.sql): an expression GIN index is out of drizzle-kit's reach.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bibleverses_fts
  ON "BibleVerses"
  USING GIN (to_tsvector('english', text));
