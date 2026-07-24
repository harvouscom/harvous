-- Creates Churches + UserMetadata church-connection columns when Drizzle push
-- has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "Churches" (
  "id" text PRIMARY KEY NOT NULL,
  "orgId" text NOT NULL,
  "name" text NOT NULL,
  "city" text,
  "state" text,
  "country" text,
  "createdBy" text NOT NULL,
  "billingPlan" text,
  "billingPlanUpdatedAt" timestamp with time zone,
  "isActive" boolean DEFAULT true NOT NULL,
  "deletedAt" timestamp with time zone,
  "recoveryUntil" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "Churches_orgId_unique" ON "Churches" ("orgId");
CREATE INDEX IF NOT EXISTS "Churches_createdByIndex" ON "Churches" ("createdBy");

ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "connectedChurchId" text;
ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "connectedOrgId" text;
ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "connectedChurchAt" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "UserMetadata_connectedChurchIdIndex" ON "UserMetadata" ("connectedChurchId");
