-- Index ScriptureMetadata by passage, for "which of my notes cite this verse / chapter".
--
-- Review asks it for every verse and chapter it builds a question about (the "Cited in" framing,
-- the linked rung's answers), and the table had only a `noteId` index, so each ask scanned every
-- account's citations. Small today; linear in every user's notes as the product grows.
--
-- CONCURRENTLY so it can run against production without locking writes to the table. It cannot
-- run inside a transaction block — run it on its own.
--
-- `db:push` also creates it from `server/db/schema.ts` (`ScriptureMetadata_passageIndex`); running
-- this first just means the push finds it already there.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ScriptureMetadata_passageIndex"
  ON "ScriptureMetadata" ("book", "chapter", "verse");
