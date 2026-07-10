/**
 * Run-scoped Shared Spaces E2E seed and recovery cleanup.
 *
 * No query is issued until the exact destructive marker and independently
 * parsed Supabase project identity both pass readSafeE2EConfig().
 */
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { inArray, like, or, sql } from 'drizzle-orm';
import {
  e2eFixtureIds,
  readE2ERunRegistry,
  readSafeE2EConfig,
  resetE2ERunRegistry,
  runWithVerifiedDisposableDatabase,
  supabaseProjectRefFromDatabaseUrl,
} from '../e2e/fixtures/e2e-db-safety';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

async function main() {
  // Safety must complete before importing the lazy DB client or issuing a query.
  const config = readSafeE2EConfig();
  const ownerId = process.env.TEST_USER_A_CLERK_ID!.trim();
  const memberId = process.env.TEST_USER_B_CLERK_ID!.trim();
  if (ownerId === memberId) {
    throw new Error('The two E2E users must have distinct Clerk user IDs');
  }

  process.env.SUPABASE_DATABASE_URL = config.databaseUrl;
  const {
    db,
    NoteConnections,
    NoteScriptureReferences,
    NoteTags,
    NoteThreads,
    NoteVersions,
    Notes,
    ResourceMetadata,
    ScriptureMetadata,
    SpaceInvites,
    SpaceMemberships,
    SpaceNotes,
    Spaces,
    StudyThreadEntries,
    Threads,
  } = await import('../server/db');
  const ids = e2eFixtureIds(config);
  const queryDatabaseIdentity = async () => {
    const rows = await db.execute(sql`
      SELECT
        current_database()::text AS "databaseName",
        current_user::text AS "currentUser",
        shobj_description(oid, 'pg_database') AS "databaseComment"
      FROM pg_database
      WHERE datname = current_database()
    `);
    const row = rows[0] as
      | {
          databaseName?: unknown;
          currentUser?: unknown;
          databaseComment?: unknown;
        }
      | undefined;
    return {
      databaseName: String(row?.databaseName ?? ''),
      currentUser: String(row?.currentUser ?? ''),
      databaseComment:
        typeof row?.databaseComment === 'string' ? row.databaseComment : null,
      projectRef: supabaseProjectRefFromDatabaseUrl(config.databaseUrl),
    };
  };

  async function cleanupRunResources() {
    const registry = readE2ERunRegistry(config);
    const recoverySpaces = await db
      .select({ id: Spaces.id })
      .from(Spaces)
      .where(
        like(
          Spaces.description,
          `%Disposable Shared Spaces fixture ${config.runNamespace}%`,
        ),
      );
    const spaceIds = [
      ...new Set([
        ids.spaceId,
        ...registry.spaces,
        ...recoverySpaces.map((row) => row.id),
      ]),
    ];

    const [spaceThreadRows, spaceNoteRows, spaceEntryRows] =
      await Promise.all([
        db
          .select({ id: Threads.id })
          .from(Threads)
          .where(inArray(Threads.spaceId, spaceIds)),
        db
          .select({ noteId: SpaceNotes.noteId })
          .from(SpaceNotes)
          .where(inArray(SpaceNotes.spaceId, spaceIds)),
        db
          .select({ id: StudyThreadEntries.id })
          .from(StudyThreadEntries)
          .where(inArray(StudyThreadEntries.spaceId, spaceIds)),
      ]);

    const threadIds = [
      ...new Set([
        ...registry.threads,
        ...spaceThreadRows.map((row) => row.id),
      ]),
    ];
    const noteIds = [
      ...new Set([
        ...registry.notes,
        ...spaceNoteRows.map((row) => row.noteId),
      ]),
    ];
    const studyEntryIds = [
      ...new Set([
        ...registry.studyThreadEntries,
        ...spaceEntryRows.map((row) => row.id),
      ]),
    ];

    await db.transaction(async (tx) => {
      if (studyEntryIds.length > 0 || noteIds.length > 0) {
        await tx
          .delete(StudyThreadEntries)
          .where(
            or(
              inArray(StudyThreadEntries.spaceId, spaceIds),
              studyEntryIds.length > 0
                ? inArray(StudyThreadEntries.id, studyEntryIds)
                : undefined,
              noteIds.length > 0
                ? inArray(StudyThreadEntries.parentNoteId, noteIds)
                : undefined,
            ),
          );
      }
      if (noteIds.length > 0) {
        await tx
          .delete(NoteConnections)
          .where(
            or(
              inArray(NoteConnections.spaceId, spaceIds),
              inArray(NoteConnections.fromNoteId, noteIds),
              inArray(NoteConnections.toNoteId, noteIds),
            ),
          );
        await tx.delete(NoteTags).where(inArray(NoteTags.noteId, noteIds));
        await tx
          .delete(NoteScriptureReferences)
          .where(inArray(NoteScriptureReferences.noteId, noteIds));
        await tx
          .delete(ScriptureMetadata)
          .where(inArray(ScriptureMetadata.noteId, noteIds));
        await tx
          .delete(ResourceMetadata)
          .where(inArray(ResourceMetadata.noteId, noteIds));
      }
      if (threadIds.length > 0 || noteIds.length > 0) {
        await tx
          .delete(NoteThreads)
          .where(
            or(
              threadIds.length > 0
                ? inArray(NoteThreads.threadId, threadIds)
                : undefined,
              noteIds.length > 0
                ? inArray(NoteThreads.noteId, noteIds)
                : undefined,
            ),
          );
      }
      if (noteIds.length > 0) {
        await tx
          .delete(NoteVersions)
          .where(inArray(NoteVersions.noteId, noteIds));
        await tx
          .delete(SpaceNotes)
          .where(
            or(
              inArray(SpaceNotes.spaceId, spaceIds),
              inArray(SpaceNotes.noteId, noteIds),
            ),
          );
        await tx.delete(Notes).where(inArray(Notes.id, noteIds));
      } else {
        await tx.delete(SpaceNotes).where(inArray(SpaceNotes.spaceId, spaceIds));
      }
      if (threadIds.length > 0) {
        await tx
          .delete(Threads)
          .where(
            or(
              inArray(Threads.spaceId, spaceIds),
              inArray(Threads.id, threadIds),
            ),
          );
      } else {
        await tx.delete(Threads).where(inArray(Threads.spaceId, spaceIds));
      }
      await tx.delete(SpaceInvites).where(inArray(SpaceInvites.spaceId, spaceIds));
      await tx
        .delete(SpaceMemberships)
        .where(inArray(SpaceMemberships.spaceId, spaceIds));
      await tx.delete(Spaces).where(inArray(Spaces.id, spaceIds));
    });

    const verification = {
      spaces: (
        await db
          .select({ id: Spaces.id })
          .from(Spaces)
          .where(inArray(Spaces.id, spaceIds))
      ).length,
      notes:
        noteIds.length === 0
          ? 0
          : (
              await db
                .select({ id: Notes.id })
                .from(Notes)
                .where(inArray(Notes.id, noteIds))
            ).length,
      threads:
        threadIds.length === 0
          ? 0
          : (
              await db
                .select({ id: Threads.id })
                .from(Threads)
                .where(inArray(Threads.id, threadIds))
            ).length,
      studyThreadEntries:
        studyEntryIds.length === 0
          ? 0
          : (
              await db
                .select({ id: StudyThreadEntries.id })
                .from(StudyThreadEntries)
                .where(inArray(StudyThreadEntries.id, studyEntryIds))
            ).length,
      noteVersions:
        noteIds.length === 0
          ? 0
          : (
              await db
                .select({ id: NoteVersions.id })
                .from(NoteVersions)
                .where(inArray(NoteVersions.noteId, noteIds))
            ).length,
      spaceNotes:
        (
          await db
            .select({ id: SpaceNotes.id })
            .from(SpaceNotes)
            .where(
              noteIds.length > 0
                ? or(
                    inArray(SpaceNotes.spaceId, spaceIds),
                    inArray(SpaceNotes.noteId, noteIds),
                  )
                : inArray(SpaceNotes.spaceId, spaceIds),
            )
        ).length,
      memberships: (
        await db
          .select({ id: SpaceMemberships.id })
          .from(SpaceMemberships)
          .where(inArray(SpaceMemberships.spaceId, spaceIds))
      ).length,
      invites: (
        await db
          .select({ id: SpaceInvites.id })
          .from(SpaceInvites)
          .where(inArray(SpaceInvites.spaceId, spaceIds))
      ).length,
    };
    if (Object.values(verification).some((count) => count !== 0)) {
      throw new Error(
        `E2E cleanup verification failed for ${config.runNamespace}: ${JSON.stringify(verification)}`,
      );
    }
    resetE2ERunRegistry(config);
    return verification;
  }

  const cleaned = await runWithVerifiedDisposableDatabase(
    config,
    queryDatabaseIdentity,
    cleanupRunResources,
  );
  if (process.argv.includes('--cleanup')) {
    console.log(
      `E2E cleanup verified for ${config.runNamespace}: ${JSON.stringify(cleaned)}`,
    );
    return;
  }

  const now = new Date();
  await runWithVerifiedDisposableDatabase(
    config,
    queryDatabaseIdentity,
    () =>
      db.transaction(async (tx) => {
        await tx.insert(Spaces).values({
          id: ids.spaceId,
          title: ids.spaceTitle,
          description: `Disposable Shared Spaces fixture for run ${config.runId}`,
          color: 'purple',
          createdAt: now,
          updatedAt: now,
          userId: ownerId,
          type: 'shared',
          isPublic: false,
          isActive: true,
          order: 0,
        });
        await tx.insert(SpaceMemberships).values({
          id: ids.membershipId,
          spaceId: ids.spaceId,
          userId: ownerId,
          role: 'owner',
          joinedAt: now,
          createdAt: now,
        });
        await tx.insert(SpaceInvites).values({
          id: ids.inviteId,
          spaceId: ids.spaceId,
          token: ids.inviteToken,
          kind: 'link',
          role: 'member',
          createdBy: ownerId,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          maxUses: null,
          useCount: 0,
          revokedAt: null,
          createdAt: now,
        });
      }),
  );
  resetE2ERunRegistry(config, { spaces: [ids.spaceId] });
  console.log(
    `E2E seed complete for ${config.runNamespace} on project ${config.projectRef}`,
  );
}

main().catch((error) => {
  console.error('E2E seed failed:', error);
  process.exitCode = 1;
});
