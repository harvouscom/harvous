-- Add friendly ticket numbers + client environment to SupportTickets.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set.
-- Run manually when drizzle-kit prompts block non-interactive push.

ALTER TABLE "SupportTickets" ADD COLUMN IF NOT EXISTS "ticketNumber" integer;
ALTER TABLE "SupportTickets" ADD COLUMN IF NOT EXISTS "clientEnvironment" text;

-- Backfill legacy rows with sequential numbers (order by createdAt).
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS num
  FROM "SupportTickets"
  WHERE "ticketNumber" IS NULL
)
UPDATE "SupportTickets" t
SET "ticketNumber" = numbered.num
FROM numbered
WHERE t.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS "SupportTickets_ticketNumber_unique"
  ON "SupportTickets" ("ticketNumber");
