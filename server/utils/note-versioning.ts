export const NOTE_VERSION_MAX_RECENT = 100;
export const NOTE_VERSION_MIN_RETENTION_DAYS = 90;
export const NOTE_VERSION_SAVE_COALESCE_MS = 5 * 60 * 1000;

export type NoteVersionContent = {
  title: string | null;
  content: string;
  contentEncrypted: boolean;
};

export type NoteVersionRecord = NoteVersionContent & {
  id: string;
  noteId: string;
  version: number;
  source: string;
  authorId: string;
  /** Who saved this checkpoint; null on rows predating co-editing. */
  editedBy: string | null;
  createdAt: Date;
};

/**
 * 'author' is the note's owner; 'collaborator' is a shared-space member writing
 * an opted-in note. Version *history* stays author-only — this only relaxes the
 * write asserts. See server/utils/note-collaboration.ts.
 */
export type NoteVersionActorRole = 'author' | 'collaborator';

export class NoteVersionAccessError extends Error {
  readonly code = 'NOT_NOTE_AUTHOR';

  constructor() {
    super('Only the note author can access or change note history');
    this.name = 'NoteVersionAccessError';
  }
}

export function assertCanAccessNoteVersions(noteAuthorId: string, actorId: string): void {
  if (noteAuthorId !== actorId) throw new NoteVersionAccessError();
}

export function nextNoteVersionNumber(versions: Array<Pick<NoteVersionRecord, 'version'>>): number {
  const currentMax = versions.reduce(
    (maxVersion, row) => (Number.isInteger(row.version) && row.version > maxVersion ? row.version : maxVersion),
    0,
  );
  return currentMax + 1;
}

export function sameNoteVersionContent(
  left: NoteVersionContent | null | undefined,
  right: NoteVersionContent,
): boolean {
  return (
    left != null &&
    left.title === right.title &&
    left.content === right.content &&
    left.contentEncrypted === right.contentEncrypted
  );
}

/**
 * Meaningful saves create immutable checkpoints at most once per coalescing window.
 * Restore/copy/migration checkpoints are explicit and bypass save coalescing.
 */
export function shouldCreateNoteVersionCheckpoint(input: {
  latest: NoteVersionRecord | null;
  next: NoteVersionContent;
  now: Date;
  source?: string;
  coalesceWithinMs?: number;
}): boolean {
  if (!input.latest) return true;
  if (sameNoteVersionContent(input.latest, input.next)) return false;

  const source = input.source ?? 'save';
  if (source !== 'save') return true;

  const coalesceWithinMs = input.coalesceWithinMs ?? NOTE_VERSION_SAVE_COALESCE_MS;
  return input.now.getTime() - input.latest.createdAt.getTime() >= Math.max(0, coalesceWithinMs);
}

export function buildNoteVersionSnapshot(input: {
  id: string;
  noteId: string;
  noteAuthorId: string;
  actorId: string;
  version: number;
  content: NoteVersionContent;
  source?: string;
  createdAt: Date;
  /** Defaults to 'author' so every pre-existing caller keeps the strict assert. */
  actorRole?: NoteVersionActorRole;
}): NoteVersionRecord {
  // A co-editing collaborator writes checkpoints on someone else's note. authorId
  // still records the permanent author (integrity checks and history access depend
  // on that); editedBy is what records who actually typed.
  if (input.actorRole !== 'collaborator') {
    assertCanAccessNoteVersions(input.noteAuthorId, input.actorId);
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new RangeError('Note version must be a positive integer');
  }

  return {
    id: input.id,
    noteId: input.noteId,
    version: input.version,
    title: input.content.title,
    content: input.content.content,
    contentEncrypted: input.content.contentEncrypted,
    source: input.source ?? 'save',
    authorId: input.noteAuthorId,
    editedBy: input.actorId,
    createdAt: input.createdAt,
  };
}

/** Migration baselines are snapshots taken now; note creation time is not version creation time. */
export function buildMigrationBaselineVersion(input: {
  id: string;
  noteId: string;
  noteAuthorId: string;
  content: NoteVersionContent;
  migrationTime: Date;
}): NoteVersionRecord {
  return buildNoteVersionSnapshot({
    id: input.id,
    noteId: input.noteId,
    noteAuthorId: input.noteAuthorId,
    actorId: input.noteAuthorId,
    version: 1,
    content: input.content,
    source: 'migration-baseline',
    createdAt: input.migrationTime,
  });
}

/**
 * Retain the newest 100 snapshots plus every snapshot no older than 90 days.
 * The union means high-frequency recent history is not prematurely discarded.
 */
export function partitionNoteVersionsForRetention<T extends Pick<NoteVersionRecord, 'id' | 'version' | 'createdAt'>>(
  versions: T[],
  now: Date,
  options?: { maxRecent?: number; minRetentionDays?: number },
): { retained: T[]; prunable: T[] } {
  const maxRecent = Math.max(0, options?.maxRecent ?? NOTE_VERSION_MAX_RECENT);
  const minRetentionDays = Math.max(0, options?.minRetentionDays ?? NOTE_VERSION_MIN_RETENTION_DAYS);
  const cutoff = now.getTime() - minRetentionDays * 24 * 60 * 60 * 1000;
  const sorted = [...versions].sort(
    (left, right) => right.version - left.version || right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const retainedIds = new Set(
    sorted
      .filter((row, index) => index < maxRecent || row.createdAt.getTime() >= cutoff)
      .map((row) => row.id),
  );

  return {
    retained: sorted.filter((row) => retainedIds.has(row.id)),
    prunable: sorted.filter((row) => !retainedIds.has(row.id)),
  };
}

/** Durable lineage fields for a non-live, independently owned copy. */
export function buildIndependentCopyAttribution(input: {
  sourceNoteId: string;
  sourceVersionId: string | null;
  sourceAuthorId: string;
  sourceAuthorDisplayName: string | null;
}) {
  return {
    copiedFromNoteId: input.sourceNoteId,
    copiedFromVersionId: input.sourceVersionId,
    copiedFromAuthorId: input.sourceAuthorId,
    copiedFromAuthorDisplayName: input.sourceAuthorDisplayName?.trim() || null,
  };
}

export function isCurrentVersionIntegrityValid(
  note: { id: string; userId: string; currentVersionId: string | null },
  version: Pick<NoteVersionRecord, 'id' | 'noteId' | 'authorId' | 'version'> | null,
  greatestVersion: number | null,
): boolean {
  return (
    version !== null &&
    greatestVersion !== null &&
    note.currentVersionId === version.id &&
    version.noteId === note.id &&
    version.authorId === note.userId &&
    version.version === greatestVersion
  );
}
