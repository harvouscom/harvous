export const prerender = false;

import type { APIRoute } from 'astro';
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
  and,
  inArray,
} from 'astro:db';

/**
 * Test endpoint to reset current user to "new user" state.
 * Clears ALL of the current user's data (threads, notes, spaces, etc.) and UserMetadata,
 * so on refresh the app treats them as new and creates only the onboarding thread.
 * Use this to test the onboarding experience without running any seed.
 * Only available in development.
 */
export const POST: APIRoute = async ({ locals }) => {
  if (import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: 'Test endpoint not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Clear all user content (like clear-data) so they have no threads/notes/spaces
    const userNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, userId)).all();
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

    const userSpaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, userId)).all();
    const spaceIds = userSpaces.map((s) => s.id);
    if (spaceIds.length > 0) {
      await db.delete(Members).where(inArray(Members.spaceId, spaceIds));
      await db.delete(SpaceInvitations).where(inArray(SpaceInvitations.spaceId, spaceIds));
    }
    await db.delete(Spaces).where(eq(Spaces.userId, userId));
    await db.delete(Tags).where(eq(Tags.userId, userId));

    // 2. Delete UserMetadata so the user is treated as "new" on next load
    await db.delete(UserMetadata).where(eq(UserMetadata.userId, userId));

    console.log(`✅ Reset user ${userId} to new-user state (all content cleared)`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'All your data was cleared. Refresh the page to see the onboarding experience (like a new user).'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Reset to new user error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to reset user' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};


