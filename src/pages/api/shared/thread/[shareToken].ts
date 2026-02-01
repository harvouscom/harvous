export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, UserMetadata, eq, and, desc, asc } from 'astro:db';
import { sql } from 'astro:db';
import { isValidShareToken } from '@/utils/ids';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ params }) => {
  try {
    const shareToken = params.shareToken;

    if (!shareToken) {
      return new Response(JSON.stringify({ error: 'Share token is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate share token format
    if (!isValidShareToken(shareToken)) {
      return new Response(JSON.stringify({ error: 'Invalid share token format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch the thread by share token (must be public)
    const thread = await db
      .select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        color: Threads.color,
        isPublic: Threads.isPublic,
        shareToken: Threads.shareToken,
        createdAt: Threads.createdAt,
        userId: Threads.userId
      })
      .from(Threads)
      .where(and(
        eq(Threads.shareToken, shareToken),
        eq(Threads.isPublic, true)
      ))
      .get();

    if (!thread) {
      return new Response(JSON.stringify({
        error: 'Shared thread not found or no longer available'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch notes for the thread via junction table
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
      lastVisited: Notes.lastVisited,
    })
    .from(Notes)
    .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(eq(NoteThreads.threadId, thread.id))
    // CRITICAL: Use CASE expression to ensure items WITH lastVisited sort before items WITHOUT
    // SQLite puts NULLs first in DESC order, so we need explicit NULL handling
    .orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    )
    .all();

    // Fetch creator info from UserMetadata
    const creator = await db
      .select({
        firstName: UserMetadata.firstName,
        lastName: UserMetadata.lastName,
        userColor: UserMetadata.userColor,
        profileImageUrl: UserMetadata.profileImageUrl
      })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, thread.userId))
      .get();

    // Generate initials and display name
    const firstName = creator?.firstName || '';
    const lastName = creator?.lastName || '';
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    const initials = (firstInitial + lastInitial) || 'U';
    const displayName = firstName
      ? (lastName ? `${firstName} ${lastInitial}.` : firstName)
      : 'A Harvous User';

    return new Response(JSON.stringify({
      thread: {
        id: thread.id,
        title: thread.title,
        subtitle: thread.subtitle,
        color: thread.color,
        createdAt: thread.createdAt
      },
      notes: notes.map(note => ({
        id: note.id,
        title: note.title,
        content: note.content,
        noteType: note.noteType,
        createdAt: note.createdAt
      })),
      creator: {
        firstName,
        displayName,
        initials,
        userColor: creator?.userColor || 'paper',
        profileImageUrl: creator?.profileImageUrl || null
      },
      meta: {
        noteCount: notes.length
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/shared/thread/[shareToken]',
      action: 'get_shared_thread',
      shareToken: params.shareToken
    });
    return new Response(JSON.stringify({
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
