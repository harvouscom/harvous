/** Checkpoints closer together than this, by the same editor, form one editing session. */
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
