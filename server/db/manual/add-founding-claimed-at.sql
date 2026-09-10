-- Founding-price claim stamp on UserMetadata.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/add-founding-claimed-at.sql
--   (no RLS run needed — this adds a column, not a table)
--
-- Nullable and additive. `null` means the account never claimed the founding
-- price, which is the state every account is in until it does.
--
-- Not an entitlement: founding grants no capability a normal Plus subscription
-- does not. It is identity, which is why it sits on UserMetadata beside `tier`
-- rather than being derived at the entitlement layer.
--
-- Added to `server/db/schema.ts` in c5be15008 without this file, which is why
-- every `/api/user/get-profile` on a branch carrying that commit 500s against a
-- database that has not had it applied. Harmless on `main`, whose schema does
-- not name the column at all.

ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "foundingClaimedAt" timestamp with time zone;
