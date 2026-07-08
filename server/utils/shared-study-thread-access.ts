/**
 * Shared-space study thread (highlight annotation) access + moderation.
 */
import { db, first, Notes, Spaces, SpaceMemberships, eq, and } from '../db';
import { requireSpaceAccess, SpaceAccessError, type SpaceRole } from './space-access';

export class SharedStudyThreadAccessError extends SpaceAccessError {}

export type ParentNoteContext = {
  id: string;
  userId: string;
  spaceId: string | null;
  spaceType: 'personal' | 'shared' | 'public' | null;
};

export async function loadParentNoteContext(parentNoteId: string): Promise<ParentNoteContext | null> {
  const note = first(
    await db
      .select({ id: Notes.id, userId: Notes.userId, spaceId: Notes.spaceId })
      .from(Notes)
      .where(eq(Notes.id, parentNoteId))
      .limit(1),
  );
  if (!note) return null;

  let spaceType: ParentNoteContext['spaceType'] = null;
  if (note.spaceId) {
    const space = first(
      await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, note.spaceId)).limit(1),
    );
    spaceType = (space?.type as ParentNoteContext['spaceType']) ?? null;
  }

  return {
    id: note.id,
    userId: note.userId,
    spaceId: note.spaceId ?? null,
    spaceType,
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
