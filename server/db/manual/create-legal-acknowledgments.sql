-- Creates LegalAcknowledgments when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- Append-only record of which version of the Privacy Policy and Terms each account was shown and
-- acknowledged, and where (sign-up, the in-app notice, Settings). The current versions live in
-- src/utils/legal-versions.ts. Rows are never updated; the latest per (userId, document) is the
-- account's standing.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

CREATE TABLE IF NOT EXISTS "LegalAcknowledgments" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "document" text NOT NULL,
  "version" text NOT NULL,
  "surface" text NOT NULL,
  "acknowledgedAt" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "LegalAcknowledgments_userId_documentIndex"
  ON "LegalAcknowledgments" ("userId", "document");
