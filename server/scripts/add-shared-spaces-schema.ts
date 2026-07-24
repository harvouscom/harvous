/**
 * Additive Shared Spaces schema stage. Dry-run by default; --apply requires an
 * explicit direct disposable/staging database URL and safety marker.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import {
  loadSharedSpacesMigrationIdentity,
  logSharedSpacesMigrationIdentity,
} from './shared-spaces-migration-target';

export const ADDITIVE_SHARED_SPACES_DDL = [
  `ALTER TABLE "Spaces" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'personal'`,
  `ALTER TABLE "Spaces" ADD COLUMN IF NOT EXISTS "orgId" text`,
  `ALTER TABLE "Spaces" ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz`,
  `ALTER TABLE "Spaces" ADD COLUMN IF NOT EXISTS "recoveryUntil" timestamptz`,
  `ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "isPinned" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "Notes" ADD COLUMN IF NOT EXISTS "currentVersionId" text`,
  `ALTER TABLE "Notes" ADD COLUMN IF NOT EXISTS "copiedFromNoteId" text`,
  `ALTER TABLE "Notes" ADD COLUMN IF NOT EXISTS "copiedFromVersionId" text`,
  `ALTER TABLE "Notes" ADD COLUMN IF NOT EXISTS "copiedFromAuthorId" text`,
  `ALTER TABLE "Notes" ADD COLUMN IF NOT EXISTS "copiedFromAuthorDisplayName" text`,
  `CREATE TABLE IF NOT EXISTS "NoteVersions" (
    "id" text PRIMARY KEY,
    "noteId" text NOT NULL,
    "version" integer NOT NULL,
    "title" text,
    "content" text NOT NULL,
    "contentEncrypted" boolean NOT NULL DEFAULT false,
    "source" text NOT NULL DEFAULT 'save',
    "authorId" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "SpaceNotes" (
    "id" text PRIMARY KEY,
    "spaceId" text NOT NULL,
    "noteId" text NOT NULL,
    "addedBy" text NOT NULL,
    "addedAt" timestamptz NOT NULL,
    "updatedAt" timestamptz,
    "removedBy" text,
    "removedAt" timestamptz,
    "isPinned" boolean NOT NULL DEFAULT false,
    "primaryCollection" text,
    "secondaryCollections" text,
    "collectionPinned" boolean NOT NULL DEFAULT false,
    "collectionUserOverride" boolean NOT NULL DEFAULT false,
    "order" integer NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS "SpaceMemberships" (
    "id" text PRIMARY KEY,
    "spaceId" text NOT NULL,
    "userId" text NOT NULL,
    "role" text NOT NULL DEFAULT 'member',
    "invitedBy" text,
    "inviteId" text,
    "joinedAt" timestamptz NOT NULL,
    "lastVisitedAt" timestamptz,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS "SpaceInvites" (
    "id" text PRIMARY KEY,
    "spaceId" text NOT NULL,
    "token" text NOT NULL,
    "kind" text NOT NULL DEFAULT 'link',
    "role" text NOT NULL DEFAULT 'member',
    "invitedEmail" text,
    "createdBy" text NOT NULL,
    "expiresAt" timestamptz,
    "maxUses" integer,
    "useCount" integer NOT NULL DEFAULT 0,
    "revokedAt" timestamptz,
    "createdAt" timestamptz NOT NULL
  )`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "spaceId" text`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "noteVersionId" text`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "resolvedVersionId" text`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "anchorQuote" text`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "anchorPrefixContext" text`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "anchorSuffixContext" text`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "anchorStatus" text NOT NULL DEFAULT 'unresolved'`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "resolvedAnchorStart" integer`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "resolvedAnchorEnd" integer`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "anchorResolvedAt" timestamptz`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "anchorDetachedAt" timestamptz`,
  `ALTER TABLE "StudyThreadEntries" ADD COLUMN IF NOT EXISTS "actorDisplayNameSnapshot" text`,
  `CREATE INDEX IF NOT EXISTS "Spaces_deletedAt_recoveryUntilIndex" ON "Spaces" ("deletedAt", "recoveryUntil")`,
  `CREATE INDEX IF NOT EXISTS "NoteVersions_noteId_createdAtIndex" ON "NoteVersions" ("noteId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "NoteVersions_authorId_createdAtIndex" ON "NoteVersions" ("authorId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SpaceNotes_spaceId_removedAt_orderIndex" ON "SpaceNotes" ("spaceId", "removedAt", "order")`,
  `CREATE INDEX IF NOT EXISTS "SpaceNotes_noteId_removedAtIndex" ON "SpaceNotes" ("noteId", "removedAt")`,
  `CREATE INDEX IF NOT EXISTS "SpaceMemberships_userIdIndex" ON "SpaceMemberships" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "SpaceMemberships_spaceId_roleIndex" ON "SpaceMemberships" ("spaceId", "role")`,
  `CREATE INDEX IF NOT EXISTS "SpaceInvites_spaceIdIndex" ON "SpaceInvites" ("spaceId")`,
  `CREATE INDEX IF NOT EXISTS "StudyThreadEntries_noteVersionIdIndex" ON "StudyThreadEntries" ("noteVersionId")`,
  `CREATE INDEX IF NOT EXISTS "StudyThreadEntries_resolvedVersionIdIndex" ON "StudyThreadEntries" ("resolvedVersionId")`,
  `CREATE INDEX IF NOT EXISTS "StudyThreadEntries_spaceId_parentNoteIdIndex" ON "StudyThreadEntries" ("spaceId", "parentNoteId")`,
  `CREATE INDEX IF NOT EXISTS "StudyThreadEntries_anchorStatusIndex" ON "StudyThreadEntries" ("anchorStatus")`,
] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const identity = loadSharedSpacesMigrationIdentity(process.env);
  logSharedSpacesMigrationIdentity(identity);
  if (!apply) {
    console.log('[shared-spaces:schema:additive] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_SHARED_SPACES_DDL) console.log(`${statement};`);
    console.log('[shared-spaces:schema:additive] review, then re-run with --apply');
    return;
  }
  const sql = postgres(identity.databaseUrl, { max: 1 });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_SHARED_SPACES_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[shared-spaces:schema:additive] applied ${ADDITIVE_SHARED_SPACES_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[shared-spaces:schema:additive] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
