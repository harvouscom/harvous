-- Web push reminders: schedule + timezone on UserMetadata, PushSubscriptions, ReminderDeliveries
--
-- Read the header of `add-series-published-thread.sql` before using this file —
-- usually the answer is `npm run db:push`, not hand-written SQL. The additive,
-- idempotent version of this lives in server/scripts/add-push-reminders-schema.ts:
--
--   npm run push:schema          # dry run
--   npm run push:schema:apply    # apply (also enables RLS on the two new tables)
--
-- Kept here so the change is greppable next to its siblings. Same statements.
--
-- Apply this BEFORE deploying the branch. Drizzle's full-row `select()` expands to every
-- column in the schema file, so until these four columns exist, /api/user/get-profile,
-- /api/navigation/data and /api/user/update-onboarding return 500 for every signed-in user.

ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "timezone" text;
ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "reminderSettings" text;
ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "lastActiveAt" timestamptz;
ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "lastReminderSentOn" text;

CREATE TABLE IF NOT EXISTS "PushSubscriptions" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL,
  "lastSuccessAt" timestamptz,
  "failCount" integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscriptions_endpoint_unique" ON "PushSubscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscriptions_userIdIndex" ON "PushSubscriptions" ("userId");
ALTER TABLE "PushSubscriptions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ReminderDeliveries" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "kind" text NOT NULL,
  "variant" text NOT NULL,
  "sentAt" timestamptz NOT NULL,
  "localDate" text NOT NULL,
  "localHour" integer NOT NULL,
  "deviceCount" integer NOT NULL DEFAULT 0,
  "outcome" text,
  "outcomeAt" timestamptz,
  "outcomeSource" text
);
CREATE INDEX IF NOT EXISTS "ReminderDeliveries_userId_sentAtIndex" ON "ReminderDeliveries" ("userId", "sentAt");
CREATE INDEX IF NOT EXISTS "ReminderDeliveries_outcome_sentAtIndex" ON "ReminderDeliveries" ("outcome", "sentAt");
ALTER TABLE "ReminderDeliveries" ENABLE ROW LEVEL SECURITY;
