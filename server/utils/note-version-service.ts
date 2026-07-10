import { generateTimestampId } from '@/utils/ids';
import { Notes, NoteVersions, SpaceNotes, StudyThreadEntries, and, desc, eq, first, inArray, isNull } from '../db';
import {
  NoteVersionAccessError,
  assertCanAccessNoteVersions,
  buildNoteVersionSnapshot,
  nextNoteVersionNumber,
  type NoteVersionContent,
  type NoteVersionRecord,
} from './note-versioning';
import { buildDurableAnchorReresolutionPatch } from './durable-note-anchor';

type Transaction = any;

export const NOTE_VERSION_RETENTION_LATEST_COUNT = 100;
export const NOTE_VERSION_RETENTION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function isProtectedNoteVersion(input: {
  id: string;
  version: number;
  source: string | null;
  currentVersionId: string | null;
  referencedVersionIds: Set<string>;
}): boolean {
  return (
    input.id === input.currentVersionId ||
    input.version === 1 ||
    input.source === 'restore' ||
    input.referencedVersionIds.has(input.id)
  );
}

export function shouldAdvanceCanonicalVersion(input: {
  current: NoteVersionContent;
  next: NoteVersionContent;
  source?: string;
}): boolean {
  return (
    shouldForceNoteVersionCheckpoint(input.source) ||
    input.current.title !== input.next.title ||
    input.current.content !== input.next.content ||
    input.current.contentEncrypted !== input.next.contentEncrypted
  );
}

export async function pruneCanonicalNoteVersionsInTransaction(
  tx: Transaction,
  input: { noteId: string; currentVersionId: string | null; now: Date },
): Promise<string[]> {
  const cutoff = new Date(input.now.getTime() - NOTE_VERSION_RETENTION_MAX_AGE_MS);
  const outsideLatest = await tx
    .select({
      id: NoteVersions.id,
      version: NoteVersions.version,
      source: NoteVersions.source,
      createdAt: NoteVersions.createdAt,
    })
    .from(NoteVersions)
    .where(eq(NoteVersions.noteId, input.noteId))
    .orderBy(desc(NoteVersions.version))
    .offset(NOTE_VERSION_RETENTION_LATEST_COUNT);
  const candidates = outsideLatest.filter(
    (row: { createdAt: Date }) => row.createdAt < cutoff,
  );
  if (candidates.length === 0) return [];
  const candidateIds = candidates.map((row: { id: string }) => row.id);
  const referencedRows = await tx
    .select({ id: StudyThreadEntries.noteVersionId })
    .from(StudyThreadEntries)
    .where(inArray(StudyThreadEntries.noteVersionId, candidateIds));
  const referencedVersionIds = new Set(
    referencedRows.map((row: { id: string | null }) => row.id).filter(Boolean) as string[],
  );
  const removableIds = candidates
    .filter(
      (row: { id: string; version: number; source: string | null }) =>
        !isProtectedNoteVersion({
          ...row,
          currentVersionId: input.currentVersionId,
          referencedVersionIds,
        }),
    )
    .map((row: { id: string }) => row.id);
  if (removableIds.length > 0) {
    await tx.delete(NoteVersions).where(inArray(NoteVersions.id, removableIds));
  }
  return removableIds;
}

export async function reresolveDurableAnchorsInTransaction(
  tx: Transaction,
  input: {
    noteId: string;
    html: string;
    resolvedVersionId: string;
    now: Date;
  },
): Promise<number> {
  const rows = await tx
    .select({
      id: StudyThreadEntries.id,
      anchorQuote: StudyThreadEntries.anchorQuote,
      anchorPrefixContext: StudyThreadEntries.anchorPrefixContext,
      anchorSuffixContext: StudyThreadEntries.anchorSuffixContext,
      resolvedAnchorStart: StudyThreadEntries.resolvedAnchorStart,
      resolvedAnchorEnd: StudyThreadEntries.resolvedAnchorEnd,
    })
    .from(StudyThreadEntries)
    .where(eq(StudyThreadEntries.parentNoteId, input.noteId))
    .for('update');
  for (const row of rows) {
    await tx
      .update(StudyThreadEntries)
      .set(
        buildDurableAnchorReresolutionPatch({
          row,
          html: input.html,
          resolvedVersionId: input.resolvedVersionId,
          now: input.now,
        }),
      )
      .where(
        and(
          eq(StudyThreadEntries.id, row.id),
          eq(StudyThreadEntries.parentNoteId, input.noteId),
        ),
      );
  }
  return rows.length;
}

export type CanonicalCreateScope = {
  canonicalSpaceId: string | null;
  associationSpaceId: string | null;
};

/**
 * Canonical authored notes stay in the author's private organization. A shared
 * target is represented only by SpaceNotes.
 */
export function resolveCanonicalCreateScope(input: {
  targetSpace: { id: string; type: string } | null;
  myHomeSpaceId: string | null;
}): CanonicalCreateScope {
  if (!input.targetSpace) {
    return { canonicalSpaceId: null, associationSpaceId: null };
  }
  if (input.targetSpace.type === 'personal') {
    return { canonicalSpaceId: input.targetSpace.id, associationSpaceId: null };
  }
  if (input.targetSpace.type === 'shared' || input.targetSpace.type === 'public') {
    if (!input.myHomeSpaceId) throw new Error('My Home is required for a canonical shared note');
    return {
      canonicalSpaceId: input.myHomeSpaceId,
      associationSpaceId: input.targetSpace.id,
    };
  }
  throw new Error(`Unsupported space type: ${input.targetSpace.type}`);
}

export class NoteVersionConflictError extends Error {
  readonly code = 'NOTE_VERSION_CONFLICT';
  readonly status = 409;

  constructor(
    public readonly expectedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(`Expected note version ${expectedVersion}, but current version is ${currentVersion}`);
    this.name = 'NoteVersionConflictError';
  }
}

export class NoteVersionNotFoundError extends Error {
  readonly code = 'NOTE_VERSION_NOT_FOUND';

  constructor() {
    super('Note version not found');
    this.name = 'NoteVersionNotFoundError';
  }
}

export class ActiveSharedAssociationEncryptionError extends Error {
  readonly code = 'ACTIVE_SHARED_ASSOCIATIONS';
  readonly status = 409;

  constructor() {
    super('Remove this note from every shared space before locking or restoring encrypted content');
    this.name = 'ActiveSharedAssociationEncryptionError';
  }
}

export function assertCanonicalEncryptionAllowed(
  contentEncrypted: boolean,
  hasActiveSharedAssociations: boolean,
): void {
  if (contentEncrypted && hasActiveSharedAssociations) {
    throw new ActiveSharedAssociationEncryptionError();
  }
}

export function resolveLockedEncryptionState(
  requested: unknown,
  lockedContentEncrypted: boolean,
): boolean {
  return typeof requested === 'boolean' ? requested : lockedContentEncrypted;
}

export function shouldForceNoteVersionCheckpoint(source: string | undefined): boolean {
  return source === 'restore';
}

export function resolveLockedCanonicalMutation(
  lockedNote: typeof Notes.$inferSelect,
  input: {
    patch:
      | Partial<typeof Notes.$inferInsert>
      | ((note: typeof Notes.$inferSelect) => Partial<typeof Notes.$inferInsert>);
    nextContent:
      | NoteVersionContent
      | ((note: typeof Notes.$inferSelect) => NoteVersionContent);
  },
): { patch: Partial<typeof Notes.$inferInsert>; nextContent: NoteVersionContent } {
  return {
    patch: typeof input.patch === 'function' ? input.patch(lockedNote) : input.patch,
    nextContent:
      typeof input.nextContent === 'function' ? input.nextContent(lockedNote) : input.nextContent,
  };
}

export function assertExpectedNoteVersion(
  expectedVersion: number | undefined,
  currentVersion: number,
): void {
  if (
    expectedVersion !== undefined &&
    (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion)
  ) {
    throw new NoteVersionConflictError(expectedVersion, currentVersion);
  }
}

export function buildRestoreVersionContent(
  historical: Pick<typeof NoteVersions.$inferSelect, 'title' | 'content' | 'contentEncrypted'>,
): NoteVersionContent {
  return {
    title: historical.title,
    content: historical.content,
    contentEncrypted: historical.contentEncrypted,
  };
}

function asVersionRecord(row: typeof NoteVersions.$inferSelect): NoteVersionRecord {
  return {
    ...row,
    createdAt: row.createdAt,
  };
}

async function loadCurrentVersion(
  tx: Transaction,
  note: Pick<typeof Notes.$inferSelect, 'id' | 'currentVersionId'>,
): Promise<typeof NoteVersions.$inferSelect | null> {
  if (!note.currentVersionId) return null;
  return (
    first(
      await tx
        .select()
        .from(NoteVersions)
        .where(and(eq(NoteVersions.id, note.currentVersionId), eq(NoteVersions.noteId, note.id)))
        .limit(1),
    ) ?? null
  );
}

async function allocateVersionNumber(tx: Transaction, noteId: string): Promise<number> {
  const rows = await tx
    .select({ version: NoteVersions.version })
    .from(NoteVersions)
    .where(eq(NoteVersions.noteId, noteId))
    .orderBy(desc(NoteVersions.version))
    .limit(1);
  return nextNoteVersionNumber(rows);
}

export async function createInitialNoteVersion(
  tx: Transaction,
  input: {
    noteId: string;
    noteAuthorId: string;
    content: NoteVersionContent;
    createdAt: Date;
    source?: string;
  },
): Promise<typeof NoteVersions.$inferSelect> {
  const snapshot = buildNoteVersionSnapshot({
    id: generateTimestampId('nver'),
    noteId: input.noteId,
    noteAuthorId: input.noteAuthorId,
    actorId: input.noteAuthorId,
    version: 1,
    content: input.content,
    source: input.source ?? 'save',
    createdAt: input.createdAt,
  });
  const created = first(
    await tx.insert(NoteVersions).values(snapshot).returning(),
  ) as typeof NoteVersions.$inferSelect | undefined;
  if (!created) throw new Error('Failed to create initial note version');
  const bound = await tx
    .update(Notes)
    .set({ currentVersionId: created.id })
    .where(and(eq(Notes.id, input.noteId), eq(Notes.userId, input.noteAuthorId)))
    .returning({ id: Notes.id });
  if (bound.length !== 1) throw new Error('Failed to bind initial note version');
  await pruneCanonicalNoteVersionsInTransaction(tx, {
    noteId: input.noteId,
    currentVersionId: created.id,
    now: input.createdAt,
  });
  return created;
}

/**
 * Response anchors must bind to the exact current body, even when a recent
 * author save was coalesced. This creates an immutable system checkpoint; it
 * does not grant the responder history access or permission to change content.
 */
export async function ensureAnchorableCurrentNoteVersion(
  tx: Transaction,
  input: {
    note: typeof Notes.$inferSelect;
    now: Date;
  },
): Promise<typeof NoteVersions.$inferSelect> {
  const current = await loadCurrentVersion(tx, input.note);
  const content = {
    title: input.note.title,
    content: input.note.content,
    contentEncrypted: input.note.contentEncrypted,
  };
  if (
    current &&
    current.title === content.title &&
    current.content === content.content &&
    current.contentEncrypted === content.contentEncrypted
  ) {
    return current;
  }
  if (!current) {
    return createInitialNoteVersion(tx, {
      noteId: input.note.id,
      noteAuthorId: input.note.userId,
      content,
      createdAt: input.now,
      source: 'migration-baseline',
    });
  }
  const snapshot = buildNoteVersionSnapshot({
    id: generateTimestampId('nver'),
    noteId: input.note.id,
    noteAuthorId: input.note.userId,
    actorId: input.note.userId,
    version: await allocateVersionNumber(tx, input.note.id),
    content,
    source: 'response-anchor',
    createdAt: input.now,
  });
  const created = first(
    await tx.insert(NoteVersions).values(snapshot).returning(),
  ) as typeof NoteVersions.$inferSelect | undefined;
  if (!created) throw new Error('Failed to create response anchor version');
  await tx
    .update(Notes)
    .set({ currentVersionId: created.id })
    .where(and(eq(Notes.id, input.note.id), eq(Notes.userId, input.note.userId)));
  await pruneCanonicalNoteVersionsInTransaction(tx, {
    noteId: input.note.id,
    currentVersionId: created.id,
    now: input.now,
  });
  return created;
}

export type CanonicalNoteMutationResult = {
  note: typeof Notes.$inferSelect;
  currentVersion: typeof NoteVersions.$inferSelect;
  createdVersion: boolean;
};

/**
 * Authorizes, locks, conflict-checks, versions, and updates a canonical note in
 * one transaction. Locking Notes serializes version allocation for that note.
 */
export async function updateCanonicalNoteInTransaction(
  tx: Transaction,
  input: {
    noteId: string;
    actorId: string;
    expectedVersion?: number;
    patch:
      | Partial<typeof Notes.$inferInsert>
      | ((lockedNote: typeof Notes.$inferSelect) => Partial<typeof Notes.$inferInsert>);
    nextContent:
      | NoteVersionContent
      | ((lockedNote: typeof Notes.$inferSelect) => NoteVersionContent);
    source?: 'save' | 'restore' | 'copy' | string;
    now: Date;
  },
): Promise<CanonicalNoteMutationResult> {
  const note = first(
    await tx.select().from(Notes).where(eq(Notes.id, input.noteId)).for('update').limit(1),
  ) as typeof Notes.$inferSelect | undefined;
  if (!note) throw new NoteVersionNotFoundError();
  assertCanAccessNoteVersions(note.userId, input.actorId);
  const { patch: resolvedPatch, nextContent: resolvedNextContent } =
    resolveLockedCanonicalMutation(note, input);

  if (resolvedNextContent.contentEncrypted) {
    const activeAssociation = first(
      await tx
        .select({ id: SpaceNotes.id })
        .from(SpaceNotes)
        .where(and(eq(SpaceNotes.noteId, note.id), isNull(SpaceNotes.removedAt)))
        .limit(1),
    ) as { id: string } | undefined;
    assertCanonicalEncryptionAllowed(true, Boolean(activeAssociation));
  }

  let current = await loadCurrentVersion(tx, note);
  if (!current) {
    current = await createInitialNoteVersion(tx, {
      noteId: note.id,
      noteAuthorId: note.userId,
      content: {
        title: note.title,
        content: note.content,
        contentEncrypted: note.contentEncrypted,
      },
      createdAt: input.now,
      source: 'migration-baseline',
    });
  }

  assertExpectedNoteVersion(input.expectedVersion, current.version);

  const latest = asVersionRecord(current);
  const shouldCheckpoint = shouldAdvanceCanonicalVersion({
    current: latest,
    next: resolvedNextContent,
    source: input.source,
  });

  let nextVersion = current;
  if (shouldCheckpoint) {
    const snapshot = buildNoteVersionSnapshot({
      id: generateTimestampId('nver'),
      noteId: note.id,
      noteAuthorId: note.userId,
      actorId: input.actorId,
      version: await allocateVersionNumber(tx, note.id),
      content: resolvedNextContent,
      source: input.source ?? 'save',
      createdAt: input.now,
    });
    nextVersion = first(
      await tx.insert(NoteVersions).values(snapshot).returning(),
    ) as typeof NoteVersions.$inferSelect;
  }

  const updated = first(
    await tx
      .update(Notes)
      .set({
        ...resolvedPatch,
        title: resolvedNextContent.title,
        content: resolvedNextContent.content,
        contentEncrypted: resolvedNextContent.contentEncrypted,
        ...(resolvedNextContent.contentEncrypted
          ? { isPublic: false, shareToken: null, shareTokenCreatedAt: null }
          : {}),
        ...(shouldCheckpoint ? { currentVersionId: nextVersion.id } : {}),
      })
      .where(and(eq(Notes.id, note.id), eq(Notes.userId, input.actorId)))
      .returning(),
  ) as typeof Notes.$inferSelect | undefined;
  if (!updated) throw new Error('Failed to update note');
  if (shouldCheckpoint) {
    await reresolveDurableAnchorsInTransaction(tx, {
      noteId: note.id,
      html: nextVersion.content,
      resolvedVersionId: nextVersion.id,
      now: input.now,
    });
    await pruneCanonicalNoteVersionsInTransaction(tx, {
      noteId: note.id,
      currentVersionId: nextVersion.id,
      now: input.now,
    });
  }

  return { note: updated, currentVersion: nextVersion, createdVersion: shouldCheckpoint };
}

export async function restoreCanonicalNoteVersionInTransaction(
  tx: Transaction,
  input: {
    noteId: string;
    versionId: string;
    actorId: string;
    expectedVersion?: number;
    now: Date;
  },
): Promise<CanonicalNoteMutationResult> {
  const historical = first(
    await tx
      .select()
      .from(NoteVersions)
      .where(and(eq(NoteVersions.id, input.versionId), eq(NoteVersions.noteId, input.noteId)))
      .limit(1),
  ) as typeof NoteVersions.$inferSelect | undefined;
  if (!historical) throw new NoteVersionNotFoundError();
  assertCanAccessNoteVersions(historical.authorId, input.actorId);

  return updateCanonicalNoteInTransaction(tx, {
    noteId: input.noteId,
    actorId: input.actorId,
    expectedVersion: input.expectedVersion,
    patch: {
      title: historical.title,
      content: historical.content,
      contentEncrypted: historical.contentEncrypted,
      updatedAt: input.now,
      ...(historical.contentEncrypted
        ? { isPublic: false, shareToken: null, shareTokenCreatedAt: null }
        : {}),
    },
    nextContent: buildRestoreVersionContent(historical),
    source: 'restore',
    now: input.now,
  });
}

export function noteVersionErrorResponse(error: unknown):
  | { status: 403 | 404 | 409; code: string; message: string; details?: Record<string, number> }
  | null {
  if (error instanceof NoteVersionAccessError) {
    return { status: 403, code: error.code, message: error.message };
  }
  if (error instanceof NoteVersionConflictError) {
    return {
      status: 409,
      code: error.code,
      message: error.message,
      details: { expectedVersion: error.expectedVersion, currentVersion: error.currentVersion },
    };
  }
  if (error instanceof NoteVersionNotFoundError) {
    return { status: 404, code: error.code, message: error.message };
  }
  if (error instanceof ActiveSharedAssociationEncryptionError) {
    return { status: 409, code: error.code, message: error.message };
  }
  return null;
}
