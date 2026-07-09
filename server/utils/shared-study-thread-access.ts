/**
 * Shared-space study thread (highlight annotation) access + moderation.
 */
import { db, first, Notes, Spaces, SpaceMemberships, Threads, NoteThreads, eq, and, isNotNull } from '../db';
import { requireSpaceAccess, SpaceAccessError, type SpaceRole } from './space-access';

export class SharedStudyThreadAccessError extends SpaceAccessError {}

export type ParentNoteContext = {
  id: string;
  userId: string;
  spaceId: string | null;
  spaceType: 'personal' | 'shared' | 'public' | null;
  contentEncrypted: boolean;
};

async function spaceTypeForSpaceId(spaceId: string | null): Promise<ParentNoteContext['spaceType']> {
  if (!spaceId) return null;
  const space = first(
    await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, spaceId)).limit(1),
  );
  return (space?.type as ParentNoteContext['spaceType']) ?? null;
}

async function resolveSharedSpaceFromThread(noteId: string): Promise<{
  spaceId: string;
  spaceType: 'shared' | 'public';
} | null> {
  const row = first(
    await db
      .select({ spaceId: Threads.spaceId, type: Spaces.type })
      .from(NoteThreads)
      .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
      .innerJoin(Spaces, eq(Threads.spaceId, Spaces.id))
      .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
      .limit(1),
  );
  if (!row?.spaceId || (row.type !== 'shared' && row.type !== 'public')) return null;
  return { spaceId: row.spaceId, spaceType: row.type as 'shared' | 'public' };
}

/** Union study-thread lists for every member when the parent note lives in a shared/public space. */
export function isUnionedSharedStudyParent(parent: ParentNoteContext | null): boolean {
  return (
    parent != null &&
    parent.spaceId != null &&
    (parent.spaceType === 'shared' || parent.spaceType === 'public')
  );
}

/** True when GET note details / study-thread list should include every member's annotations. */
export async function shouldUnionStudyThreadsForNote(
  noteId: string,
  noteSpaceId: string | null,
): Promise<boolean> {
  const directType = await spaceTypeForSpaceId(noteSpaceId);
  if (noteSpaceId && (directType === 'shared' || directType === 'public')) return true;
  const fromThread = await resolveSharedSpaceFromThread(noteId);
  return fromThread != null;
}

export async function loadParentNoteContext(parentNoteId: string): Promise<ParentNoteContext | null> {
  const note = first(
    await db
      .select({
        id: Notes.id,
        userId: Notes.userId,
        spaceId: Notes.spaceId,
        contentEncrypted: Notes.contentEncrypted,
      })
      .from(Notes)
      .where(eq(Notes.id, parentNoteId))
      .limit(1),
  );
  if (!note) return null;

  let spaceId = note.spaceId ?? null;
  let spaceType = await spaceTypeForSpaceId(spaceId);
  if (spaceType !== 'shared' && spaceType !== 'public') {
    const fromThread = await resolveSharedSpaceFromThread(parentNoteId);
    if (fromThread) {
      spaceId = fromThread.spaceId;
      spaceType = fromThread.spaceType;
    }
  }

  return {
    id: note.id,
    userId: note.userId,
    spaceId,
    spaceType,
    contentEncrypted: Boolean(note.contentEncrypted),
  };
}

/** Viewer may list/create annotations when they own the note or hold membership on its shared/public space. */
export async function requireSharedStudyThreadParentAccess(
  parentNoteId: string,
  viewerUserId: string,
): Promise<{ parent: ParentNoteContext; role: SpaceRole | 'owner' }> {
  const parent = await loadParentNoteContext(parentNoteId);
  if (!parent) {
    throw new SharedStudyThreadAccessError(404, 'Note not found');
  }

  if (parent.userId === viewerUserId) {
    return { parent, role: 'owner' };
  }

  if (!parent.spaceId || (parent.spaceType !== 'shared' && parent.spaceType !== 'public')) {
    throw new SharedStudyThreadAccessError(404, 'Note not found');
  }

  // Locked notes never appear in shared contexts — membership doesn't grant
  // reading or annotating another member's encrypted note.
  if (parent.contentEncrypted) {
    throw new SharedStudyThreadAccessError(404, 'Note not found');
  }

  const { role } = await requireSpaceAccess(parent.spaceId, viewerUserId);
  return { parent, role };
}

export function canModerateStudyThreadEntry(options: {
  annotatorUserId: string;
  parentAuthorUserId: string;
  viewerUserId: string;
  viewerSpaceRole: SpaceRole | 'owner';
}): boolean {
  if (options.viewerUserId === options.annotatorUserId) return true;
  if (options.viewerUserId === options.parentAuthorUserId) return true;
  if (options.viewerSpaceRole === 'owner') return true;
  return false;
}

export async function resolveViewerSpaceRoleForNote(
  spaceId: string | null,
  viewerUserId: string,
): Promise<SpaceRole | 'owner' | null> {
  if (!spaceId) return null;
  try {
    const { role } = await requireSpaceAccess(spaceId, viewerUserId);
    return role;
  } catch (err) {
    if (err instanceof SpaceAccessError) return null;
    throw err;
  }
}

export async function isSpaceOwner(userId: string, spaceId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ role: SpaceMemberships.role })
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, userId)))
      .limit(1),
  );
  return row?.role === 'owner';
}
