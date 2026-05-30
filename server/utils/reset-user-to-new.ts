/**
 * Reset a user to "new user" state: clear all their content and UserMetadata
 * so the next load treats them as new (empty content).
 * Used by POST /api/test/reset-to-new-user and by dev server startup when DEV_RESET_USER_ID is set.
 */

import {
  db,
  UserMetadata,
  Threads,
  Notes,
  NoteThreads,
  NoteScriptureReferences,
  NoteTags,
  Comments,
  ScriptureMetadata,
  ResourceMetadata,
  Spaces,
  Members,
  SpaceInvitations,
  Tags,
  eq,
  inArray,
} from '../db';

export async function resetUserToNew(userId: string): Promise<void> {
  const userNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, userId));
  const noteIds = userNotes.map((n) => n.id);

  if (noteIds.length > 0) {
    await db.delete(NoteThreads).where(inArray(NoteThreads.noteId, noteIds));
    await db.delete(NoteScriptureReferences).where(inArray(NoteScriptureReferences.noteId, noteIds));
    await db.delete(NoteScriptureReferences).where(inArray(NoteScriptureReferences.scriptureNoteId, noteIds));
    await db.delete(NoteTags).where(inArray(NoteTags.noteId, noteIds));
    await db.delete(Comments).where(inArray(Comments.noteId, noteIds));
    await db.delete(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, noteIds));
    await db.delete(ResourceMetadata).where(inArray(ResourceMetadata.noteId, noteIds));
  }

  await db.delete(Notes).where(eq(Notes.userId, userId));
  await db.delete(Threads).where(eq(Threads.userId, userId));

  const userSpaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, userId));
  const spaceIds = userSpaces.map((s) => s.id);
  if (spaceIds.length > 0) {
    await db.delete(Members).where(inArray(Members.spaceId, spaceIds));
    await db.delete(SpaceInvitations).where(inArray(SpaceInvitations.spaceId, spaceIds));
  }
  await db.delete(Spaces).where(eq(Spaces.userId, userId));
  await db.delete(Tags).where(eq(Tags.userId, userId));
  await db.delete(UserMetadata).where(eq(UserMetadata.userId, userId));
}
