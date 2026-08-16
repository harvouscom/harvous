/**
 * Canonical Shared Spaces migration. Defaults to dry-run; writes require explicit --apply.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-canonical-space-notes.ts
 *   npx tsx server/scripts/backfill-canonical-space-notes.ts --apply
 *   npx tsx server/scripts/backfill-canonical-space-notes.ts --userId=user_x --batch-size=200
 */

import 'dotenv/config';
import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { generateSpaceId, generateTimestampId } from '../../src/utils/ids';
import { Notes, NoteThreads, NoteVersions, SpaceMemberships, SpaceNotes, Spaces, StudyThreadEntries, Threads } from '../db/schema';
import {
  assessLegacyAssociationCandidate,
  type LegacyAssociationCandidateReason,
  type SpaceAssociationMembership,
  type SpaceAssociationTarget,
} from '../utils/space-note-associations';
import { buildMigrationBaselineVersion } from '../utils/note-versioning';
import {
  buildLegacyAnchorMigrationPatch,
  legacyAnchorMigrationStateMatches,
  type LegacyAnchorMigrationState,
} from '../utils/durable-note-anchor';
import { selectPinnedThreadWinner } from '../utils/shared-space-lifecycle';
import {
  createSharedSpacesMigrationDatabase,
  loadSharedSpacesMigrationIdentity,
  logSharedSpacesMigrationIdentity,
} from './shared-spaces-migration-target';

let db: ReturnType<typeof createSharedSpacesMigrationDatabase>['db'];

type Options = {
  apply: boolean;
  userId?: string;
  batchSize: number;
};

type CandidateRow = {
  id: string;
  userId: string;
  contentEncrypted: boolean;
  sharedSpaceId: string;
  spaceOwnerId: string;
  spaceType: string;
  spaceDeletedAt: Date | null;
  spaceRecoveryUntil: Date | null;
  membershipId: string | null;
  membershipSpaceId: string | null;
  membershipUserId: string | null;
  membershipRole: string | null;
};

type CandidateScan = {
  total: number;
  counts: Record<LegacyAssociationCandidateReason, number>;
  samples: Array<{ noteId: string; spaceId: string; userId: string; reason: LegacyAssociationCandidateReason }>;
};

async function repairMultiplePinnedThreads(options: Options): Promise<{
  spaces: number;
  unpinned: number;
}> {
  const duplicateSpaces = await db
    .select({ spaceId: Threads.spaceId, pinnedCount: sql<number>`count(*)` })
    .from(Threads)
    .where(and(isNotNull(Threads.spaceId), eq(Threads.isPinned, true)))
    .groupBy(Threads.spaceId)
    .having(sql`count(*) > 1`);
  let unpinned = 0;
  for (const duplicate of duplicateSpaces) {
    if (!duplicate.spaceId) continue;
    const pinned = await db
      .select({ id: Threads.id, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
      .from(Threads)
      .where(and(eq(Threads.spaceId, duplicate.spaceId), eq(Threads.isPinned, true)));
    const winner = selectPinnedThreadWinner(pinned);
    const loserIds = pinned.filter((thread) => thread.id !== winner?.id).map((thread) => thread.id);
    console.log(
      `[canonical-space-notes] pinned repair space=${duplicate.spaceId} keep=${winner?.id ?? 'none'} unpin=${loserIds.join(',')}`,
    );
    if (options.apply && loserIds.length > 0) {
      await db.update(Threads).set({ isPinned: false }).where(inArray(Threads.id, loserIds));
    }
    unpinned += loserIds.length;
  }
  return { spaces: duplicateSpaces.length, unpinned };
}

function nullableEq(column: any, value: unknown) {
  return value == null ? isNull(column) : eq(column, value);
}

function parseOptions(): Options {
  let userId: string | undefined;
  let batchSize = 200;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--userId=')) userId = arg.slice('--userId='.length).trim() || undefined;
    if (arg.startsWith('--batch-size=')) {
      const parsed = Number.parseInt(arg.slice('--batch-size='.length), 10);
      if (Number.isInteger(parsed) && parsed > 0) batchSize = parsed;
    }
  }
  return { apply: process.argv.includes('--apply'), userId, batchSize };
}

function candidateMembership(row: CandidateRow): SpaceAssociationMembership | null {
  if (!row.membershipId || !row.membershipSpaceId || !row.membershipUserId || !row.membershipRole) return null;
  return {
    id: row.membershipId,
    spaceId: row.membershipSpaceId,
    userId: row.membershipUserId,
    role: row.membershipRole,
  };
}

function candidateEffectiveMembership(row: CandidateRow): SpaceAssociationMembership | null {
  return row.spaceOwnerId === row.userId
    ? {
        id: `owner:${row.sharedSpaceId}`,
        spaceId: row.sharedSpaceId,
        userId: row.userId,
        role: 'owner',
      }
    : candidateMembership(row);
}

function candidateSpace(row: CandidateRow): SpaceAssociationTarget {
  return {
    id: row.sharedSpaceId,
    type: row.spaceType,
    userId: row.spaceOwnerId,
    deletedAt: row.spaceDeletedAt,
    recoveryUntil: row.spaceRecoveryUntil,
  };
}

export function classifyLegacyCanonicalRepair(input: {
  note: { id: string; userId: string; contentEncrypted: boolean };
  space: SpaceAssociationTarget;
  membership: SpaceAssociationMembership | null;
  now: Date;
}): LegacyAssociationCandidateReason {
  const effectiveMembership =
    input.space.userId === input.note.userId
      ? {
          id: `owner:${input.space.id}`,
          spaceId: input.space.id,
          userId: input.note.userId,
          role: 'owner',
        }
      : input.membership;
  const recoverableDeletedSpace =
    input.space.deletedAt !== null &&
    input.space.recoveryUntil !== null &&
    input.space.recoveryUntil > input.now;
  return assessLegacyAssociationCandidate({
    note: input.note,
    space: recoverableDeletedSpace
      ? { ...input.space, deletedAt: null, recoveryUntil: null }
      : input.space,
    membership: effectiveMembership,
  });
}

function candidateReason(row: CandidateRow): LegacyAssociationCandidateReason {
  return classifyLegacyCanonicalRepair({
    note: { id: row.id, userId: row.userId, contentEncrypted: row.contentEncrypted },
    space: candidateSpace(row),
    membership: candidateEffectiveMembership(row),
    now: new Date(),
  });
}

async function candidateBatch(options: Options, lastId: string | null): Promise<CandidateRow[]> {
  const conditions = [eq(Spaces.type, 'shared')];
  if (options.userId) conditions.push(eq(Notes.userId, options.userId));
  if (lastId) conditions.push(gt(Notes.id, lastId));

  return db
    .select({
      id: Notes.id,
      userId: Notes.userId,
      contentEncrypted: Notes.contentEncrypted,
      sharedSpaceId: Spaces.id,
      spaceOwnerId: Spaces.userId,
      spaceType: Spaces.type,
      spaceDeletedAt: Spaces.deletedAt,
      spaceRecoveryUntil: Spaces.recoveryUntil,
      membershipId: SpaceMemberships.id,
      membershipSpaceId: SpaceMemberships.spaceId,
      membershipUserId: SpaceMemberships.userId,
      membershipRole: SpaceMemberships.role,
    })
    .from(Notes)
    .innerJoin(Spaces, eq(Notes.spaceId, Spaces.id))
    .leftJoin(
      SpaceMemberships,
      and(eq(SpaceMemberships.spaceId, Spaces.id), eq(SpaceMemberships.userId, Notes.userId)),
    )
    .where(and(...conditions))
    .orderBy(asc(Notes.id))
    .limit(options.batchSize);
}

async function scanLegacySharedNotes(options: Options): Promise<CandidateScan> {
  let lastId: string | null = null;
  const scan: CandidateScan = {
    total: 0,
    counts: {
      eligible: 0,
      'encrypted-note': 0,
      'invalid-space-type': 0,
      'deleted-space': 0,
      'invalid-recovery-state': 0,
      'missing-membership': 0,
    },
    samples: [],
  };

  while (true) {
    const rows = await candidateBatch(options, lastId);
    if (rows.length === 0) break;
    for (const row of rows) {
      const reason = candidateReason(row);
      scan.total++;
      scan.counts[reason]++;
      if (reason !== 'eligible' && scan.samples.length < 50) {
        scan.samples.push({ noteId: row.id, spaceId: row.sharedSpaceId, userId: row.userId, reason });
      }
    }
    lastId = rows.at(-1)!.id;
  }
  return scan;
}

async function backfillBaselineVersions(options: Options): Promise<number> {
  let lastId: string | null = null;
  let processed = 0;

  while (true) {
    const conditions = [or(isNull(NoteVersions.id), isNull(Notes.currentVersionId))!];
    if (options.userId) conditions.push(eq(Notes.userId, options.userId));
    if (lastId) conditions.push(gt(Notes.id, lastId));
    const rows = await db
      .select({ id: Notes.id })
      .from(Notes)
      .leftJoin(NoteVersions, and(eq(NoteVersions.noteId, Notes.id), eq(NoteVersions.version, 1)))
      .where(and(...conditions))
      .orderBy(asc(Notes.id))
      .limit(options.batchSize);
    if (rows.length === 0) break;

    for (const candidate of rows) {
      if (options.apply) {
        await db.transaction(async (tx) => {
          const note = (
            await tx
              .select({
                id: Notes.id,
                userId: Notes.userId,
                title: Notes.title,
                content: Notes.content,
                contentEncrypted: Notes.contentEncrypted,
                currentVersionId: Notes.currentVersionId,
              })
              .from(Notes)
              .where(eq(Notes.id, candidate.id))
              .for('update')
              .limit(1)
          )[0];
          if (!note) throw new Error(`Note disappeared while creating baseline: ${candidate.id}`);

          let baseline = (
            await tx
              .select({ id: NoteVersions.id })
              .from(NoteVersions)
              .where(and(eq(NoteVersions.noteId, note.id), eq(NoteVersions.version, 1)))
              .limit(1)
          )[0];
          if (!baseline) {
            const values = buildMigrationBaselineVersion({
              id: generateTimestampId('nver'),
              noteId: note.id,
              noteAuthorId: note.userId,
              content: {
                title: note.title,
                content: note.content,
                contentEncrypted: note.contentEncrypted,
              },
              migrationTime: new Date(),
            });
            await tx.insert(NoteVersions).values(values).onConflictDoNothing();
            baseline = (
              await tx
                .select({ id: NoteVersions.id })
                .from(NoteVersions)
                .where(and(eq(NoteVersions.noteId, note.id), eq(NoteVersions.version, 1)))
                .limit(1)
            )[0];
          }
          if (!baseline) throw new Error(`Version 1 was not created for ${note.id}`);

          if (!note.currentVersionId) {
            const updated = await tx
              .update(Notes)
              .set({ currentVersionId: baseline.id })
              .where(and(eq(Notes.id, note.id), isNull(Notes.currentVersionId)))
              .returning({ id: Notes.id });
            if (updated.length !== 1) throw new Error(`Race while binding current version for ${note.id}`);
          }
        });
      }
      processed++;
    }
    lastId = rows.at(-1)!.id;
  }
  return processed;
}

async function backfillLegacyAnchors(options: Options): Promise<Record<'resolved' | 'detached' | 'orphaned' | 'skipped', number>> {
  let lastId: string | null = null;
  const counts = { resolved: 0, detached: 0, orphaned: 0, skipped: 0 };

  while (true) {
    const conditions = [
      or(isNull(StudyThreadEntries.noteVersionId), eq(StudyThreadEntries.anchorStatus, 'unresolved'))!,
    ];
    if (options.userId) conditions.push(eq(Notes.userId, options.userId));
    if (lastId) conditions.push(gt(StudyThreadEntries.id, lastId));
    const rows = await db
      .select({
        id: StudyThreadEntries.id,
        parentNoteId: StudyThreadEntries.parentNoteId,
        anchorLocation: StudyThreadEntries.anchorLocation,
        anchorLength: StudyThreadEntries.anchorLength,
        anchorTextSnapshot: StudyThreadEntries.anchorTextSnapshot,
        sourceSnippet: StudyThreadEntries.sourceSnippet,
        noteVersionId: StudyThreadEntries.noteVersionId,
        anchorStatus: StudyThreadEntries.anchorStatus,
        updatedAt: StudyThreadEntries.updatedAt,
        baselineVersionId: NoteVersions.id,
        baselineContent: NoteVersions.content,
        currentContent: Notes.content,
      })
      .from(StudyThreadEntries)
      .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
      .leftJoin(NoteVersions, and(eq(NoteVersions.noteId, Notes.id), eq(NoteVersions.version, 1)))
      .where(and(...conditions))
      .orderBy(asc(StudyThreadEntries.id))
      .limit(options.batchSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      const expectedState: LegacyAnchorMigrationState = {
        noteVersionId: row.noteVersionId,
        anchorStatus: row.anchorStatus,
        anchorLocation: row.anchorLocation,
        anchorLength: row.anchorLength,
        anchorTextSnapshot: row.anchorTextSnapshot,
        sourceSnippet: row.sourceSnippet,
        updatedAt: row.updatedAt,
      };
      if (!options.apply) {
        const baselineVersionId = row.baselineVersionId ?? `(would-create-version-1:${row.parentNoteId})`;
        const baselineContent = row.baselineContent ?? row.currentContent;
        const patch = buildLegacyAnchorMigrationPatch({
          baselineVersionId,
          baselineContent,
          anchorLocation: row.anchorLocation,
          anchorLength: row.anchorLength,
          anchorTextSnapshot: row.anchorTextSnapshot,
          sourceSnippet: row.sourceSnippet,
          migratedAt: new Date(),
        });
        counts[patch.anchorStatus]++;
        continue;
      }

      const status = await db.transaction(async (tx) => {
        const locked = (
          await tx
            .select({
              id: StudyThreadEntries.id,
              parentNoteId: StudyThreadEntries.parentNoteId,
              anchorLocation: StudyThreadEntries.anchorLocation,
              anchorLength: StudyThreadEntries.anchorLength,
              anchorTextSnapshot: StudyThreadEntries.anchorTextSnapshot,
              sourceSnippet: StudyThreadEntries.sourceSnippet,
              noteVersionId: StudyThreadEntries.noteVersionId,
              anchorStatus: StudyThreadEntries.anchorStatus,
              updatedAt: StudyThreadEntries.updatedAt,
            })
            .from(StudyThreadEntries)
            .where(eq(StudyThreadEntries.id, row.id))
            .for('update')
            .limit(1)
        )[0];
        if (!locked) throw new Error(`Legacy anchor disappeared while locking ${row.id}`);
        if (!legacyAnchorMigrationStateMatches(expectedState, locked)) return 'skipped' as const;
        if (locked.noteVersionId && locked.anchorStatus !== 'unresolved') return 'skipped' as const;
        // A highlight made while reading anchors into no note content — there is no baseline
        // version to resolve it against, so legacy anchor migration has nothing to do for it.
        if (!locked.parentNoteId) return 'skipped' as const;

        const baseline = (
          await tx
            .select({ id: NoteVersions.id, content: NoteVersions.content })
            .from(NoteVersions)
            .where(and(eq(NoteVersions.noteId, locked.parentNoteId), eq(NoteVersions.version, 1)))
            .limit(1)
        )[0];
        if (!baseline) return 'skipped' as const;
        const patch = buildLegacyAnchorMigrationPatch({
          baselineVersionId: baseline.id,
          baselineContent: baseline.content,
          anchorLocation: locked.anchorLocation,
          anchorLength: locked.anchorLength,
          anchorTextSnapshot: locked.anchorTextSnapshot,
          sourceSnippet: locked.sourceSnippet,
          migratedAt: new Date(),
        });
        const updated = await tx
          .update(StudyThreadEntries)
          .set({ ...patch, resolvedVersionId: patch.noteVersionId })
          .where(
            and(
              eq(StudyThreadEntries.id, locked.id),
              eq(StudyThreadEntries.parentNoteId, locked.parentNoteId),
              nullableEq(StudyThreadEntries.noteVersionId, locked.noteVersionId),
              eq(StudyThreadEntries.anchorStatus, locked.anchorStatus),
              nullableEq(StudyThreadEntries.anchorLocation, locked.anchorLocation),
              nullableEq(StudyThreadEntries.anchorLength, locked.anchorLength),
              nullableEq(StudyThreadEntries.anchorTextSnapshot, locked.anchorTextSnapshot),
              eq(StudyThreadEntries.sourceSnippet, locked.sourceSnippet),
              nullableEq(StudyThreadEntries.updatedAt, locked.updatedAt),
            ),
          )
          .returning({ id: StudyThreadEntries.id });
        if (updated.length !== 1) throw new Error(`Race while migrating legacy anchor ${row.id}`);
        return patch.anchorStatus;
      });
      counts[status]++;
    }
    lastId = rows.at(-1)!.id;
  }
  return counts;
}

async function migrateLegacySharedNotes(
  options: Options,
): Promise<{ migrated: number; skipped: Record<LegacyAssociationCandidateReason, number> }> {
  let lastId: string | null = null;
  let migrated = 0;
  const skipped: Record<LegacyAssociationCandidateReason, number> = {
    eligible: 0,
    'encrypted-note': 0,
    'invalid-space-type': 0,
    'deleted-space': 0,
    'invalid-recovery-state': 0,
    'missing-membership': 0,
  };

  while (true) {
    const rows = await candidateBatch(options, lastId);
    if (rows.length === 0) break;
    for (const candidate of rows) {
      const preflightReason = candidateReason(candidate);
      if (preflightReason !== 'eligible') {
        skipped[preflightReason]++;
      }
      if (options.apply) {
        const result = await db.transaction(async (tx) => {
          const note = (
            await tx
              .select({
                id: Notes.id,
                userId: Notes.userId,
                contentEncrypted: Notes.contentEncrypted,
                spaceId: Notes.spaceId,
                createdAt: Notes.createdAt,
                isPinned: Notes.isPinned,
                primaryCollection: Notes.primaryCollection,
                secondaryCollections: Notes.secondaryCollections,
                collectionPinned: Notes.collectionPinned,
                collectionUserOverride: Notes.collectionUserOverride,
                order: Notes.order,
              })
              .from(Notes)
              .where(and(eq(Notes.id, candidate.id), eq(Notes.spaceId, candidate.sharedSpaceId)))
              .for('update')
              .limit(1)
          )[0];
          if (!note) throw new Error(`Race while locking ${candidate.id}; private location changed`);

          const space = (
            await tx
              .select({
                id: Spaces.id,
                type: Spaces.type,
                userId: Spaces.userId,
                deletedAt: Spaces.deletedAt,
                recoveryUntil: Spaces.recoveryUntil,
              })
              .from(Spaces)
              .where(eq(Spaces.id, candidate.sharedSpaceId))
              .for('update')
              .limit(1)
          )[0];
          if (!space) throw new Error(`Shared space disappeared while migrating ${candidate.id}`);
          const membership = (
            await tx
              .select({
                id: SpaceMemberships.id,
                spaceId: SpaceMemberships.spaceId,
                userId: SpaceMemberships.userId,
                role: SpaceMemberships.role,
              })
              .from(SpaceMemberships)
              .where(
                and(
                  eq(SpaceMemberships.spaceId, candidate.sharedSpaceId),
                  eq(SpaceMemberships.userId, note.userId),
                ),
              )
              .for('update')
              .limit(1)
          )[0] ?? null;
          const applyReason = classifyLegacyCanonicalRepair({
            note: { id: note.id, userId: note.userId, contentEncrypted: note.contentEncrypted },
            space,
            membership,
            now: new Date(),
          });

          const personalSpaces = await tx
            .select({ id: Spaces.id, title: Spaces.title })
            .from(Spaces)
            .where(and(eq(Spaces.userId, note.userId), eq(Spaces.type, 'personal')));
          let myHomeId = personalSpaces.find((row) => row.title.trim().toLowerCase() === 'my home')?.id;
          if (!myHomeId) {
            myHomeId = generateSpaceId();
            const now = new Date();
            await tx.insert(Spaces).values({
              id: myHomeId,
              title: 'My Home',
              color: 'paper',
              userId: note.userId,
              type: 'personal',
              isPublic: false,
              isActive: true,
              order: 0,
              createdAt: now,
              updatedAt: now,
            });
          }

          const existing = (
            await tx
              .select({ id: SpaceNotes.id, removedAt: SpaceNotes.removedAt })
              .from(SpaceNotes)
              .where(and(eq(SpaceNotes.spaceId, candidate.sharedSpaceId), eq(SpaceNotes.noteId, note.id)))
              .for('update')
              .limit(1)
          )[0];
          const migrationTime = new Date();
          const organization = {
            isPinned: note.isPinned,
            primaryCollection: note.primaryCollection,
            secondaryCollections: note.secondaryCollections,
            collectionPinned: note.collectionPinned,
            collectionUserOverride: note.collectionUserOverride,
            order: note.order,
          };
          if (applyReason === 'eligible' && !existing) {
            await tx.insert(SpaceNotes).values({
              id: generateTimestampId('snote'),
              spaceId: candidate.sharedSpaceId,
              noteId: note.id,
              addedBy: note.userId,
              addedAt: note.createdAt,
              updatedAt: migrationTime,
              removedBy: null,
              removedAt: null,
              ...organization,
            });
          } else if (applyReason === 'eligible' && existing.removedAt) {
            await tx
              .update(SpaceNotes)
              .set({
                addedBy: note.userId,
                addedAt: migrationTime,
                updatedAt: migrationTime,
                removedBy: null,
                removedAt: null,
                ...organization,
              })
              .where(eq(SpaceNotes.id, existing.id));
          } else if (applyReason !== 'eligible' && existing && !existing.removedAt) {
            await tx
              .update(SpaceNotes)
              .set({
                removedBy: note.userId,
                removedAt: migrationTime,
                updatedAt: migrationTime,
                isPinned: false,
                primaryCollection: null,
                secondaryCollections: null,
                collectionPinned: false,
                collectionUserOverride: false,
                order: 0,
              })
              .where(eq(SpaceNotes.id, existing.id));
          }

          const rehomed = await tx
            .update(Notes)
            .set({
              spaceId: myHomeId,
              threadId: 'thread_unorganized',
              isPinned: false,
              primaryCollection: null,
              secondaryCollections: null,
              collectionPinned: false,
              collectionUserOverride: false,
              collectionLastAutoUpdatedAt: null,
              order: 0,
            })
            .where(and(eq(Notes.id, note.id), eq(Notes.spaceId, candidate.sharedSpaceId)))
            .returning({ id: Notes.id });
          if (rehomed.length !== 1) throw new Error(`Race while re-homing ${note.id}`);
          const sharedThreadPlacements = await tx
            .select({ id: NoteThreads.id })
            .from(NoteThreads)
            .innerJoin(Threads, eq(Threads.id, NoteThreads.threadId))
            .where(
              and(
                eq(NoteThreads.noteId, note.id),
                eq(Threads.spaceId, candidate.sharedSpaceId),
              ),
            );
          if (sharedThreadPlacements.length > 0) {
            await tx
              .delete(NoteThreads)
              .where(inArray(NoteThreads.id, sharedThreadPlacements.map((row) => row.id)));
          }
          return 'eligible' as const;
        });
        if (result !== 'eligible') {
          if (result !== preflightReason) skipped[result]++;
        }
      }
      migrated++;
    }
    lastId = rows.at(-1)!.id;
  }
  return { migrated, skipped };
}

async function main() {
  const options = parseOptions();
  const identity = loadSharedSpacesMigrationIdentity(process.env);
  logSharedSpacesMigrationIdentity(identity);
  const target = createSharedSpacesMigrationDatabase(identity);
  db = target.db;
  try {
  console.log(`[canonical-space-notes] mode=${options.apply ? 'APPLY' : 'DRY RUN'} batchSize=${options.batchSize}`);
  console.log('[canonical-space-notes] ordering: repair multiple pinned Threads before applying schema indexes');

  const pinnedRepair = await repairMultiplePinnedThreads(options);
  const scan = await scanLegacySharedNotes(options);
  console.log(`[canonical-space-notes] legacy shared-space notes: ${scan.total}`);
  for (const [reason, count] of Object.entries(scan.counts)) console.log(`  ${reason}: ${count}`);
  for (const sample of scan.samples) {
    console.log(`  skip ${sample.noteId} user=${sample.userId} space=${sample.spaceId} reason=${sample.reason}`);
  }

  const baselineVersions = await backfillBaselineVersions(options);
  const anchors = await backfillLegacyAnchors(options);
  const associations = await migrateLegacySharedNotes(options);
  console.log(`[canonical-space-notes] version-1 baselines ${options.apply ? 'written/repaired' : 'needed'}: ${baselineVersions}`);
  console.log(`[canonical-space-notes] legacy anchors: ${JSON.stringify(anchors)}`);
  console.log(`[canonical-space-notes] shared associations ${options.apply ? 'migrated' : 'to migrate'}: ${associations.migrated}`);
  console.log(`[canonical-space-notes] association skips: ${JSON.stringify(associations.skipped)}`);
  console.log(`[canonical-space-notes] pinned Thread repair: ${JSON.stringify(pinnedRepair)}`);
  if (!options.apply) console.log('[canonical-space-notes] dry-run complete; nothing was written. Re-run with --apply.');
  } finally {
    await target.close();
  }
}

main().catch((error) => {
  console.error('[canonical-space-notes] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
