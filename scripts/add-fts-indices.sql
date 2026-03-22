-- Full-Text Search Indices for Postgres
-- Run this against your Supabase database to enable FTS on Notes and Threads.
--
-- Usage: psql $SUPABASE_DIRECT_URL -f scripts/add-fts-indices.sql
--
-- These GIN indices power the to_tsvector/plainto_tsquery search in search.ts.
-- They use the 'english' text search configuration for stemming ("running" matches "run").

-- Notes: search across title and content
-- COALESCE handles NULL titles; content is NOT NULL per schema
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notes_fts
  ON "Notes"
  USING GIN (to_tsvector('english', COALESCE(title, '') || ' ' || content));

-- Threads: search on title only (title is NOT NULL per schema)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_threads_fts
  ON "Threads"
  USING GIN (to_tsvector('english', title));
