export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Spaces, Members, UserMetadata, Notes, Threads, NoteThreads, eq, and, desc, asc, count } from 'astro:db';
import { sql } from 'astro:db';
import { successResponse, errorResponse } from '@/utils/api-responses';
import { handleAPIError } from '@/utils/error-handling';

/**
 * GET /api/spaces/join-preview/[token]
 *
 * Returns a preview of a public collaborative space for the join page.
 * Does NOT require authentication — used to show space details before sign-in.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const { token } = params;

    if (!token) {
      return errorResponse('Share token is required', 'INVALID_TOKEN');
    }

    // Find space by share token
    const space = await db.select()
      .from(Spaces)
      .where(eq(Spaces.shareToken, token))
      .get();

    if (!space) {
      return errorResponse('Invalid or expired share link', 'INVALID_TOKEN', 404);
    }

    if (!space.isPublic) {
      return errorResponse('This space is no longer public', 'SPACE_NOT_PUBLIC', 403);
    }

    // Get owner display name
    const ownerData = await db.select({
      firstName: UserMetadata.firstName,
      lastName: UserMetadata.lastName,
      userColor: UserMetadata.userColor,
    })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, space.userId))
      .get();

    const firstName = ownerData?.firstName || '';
    const lastName = ownerData?.lastName || '';
    const lastInitial = lastName.charAt(0).toUpperCase();
    const ownerDisplayName = firstName
      ? (lastName ? `${firstName} ${lastInitial}.` : firstName)
      : 'A Harvous User';

    // Count members
    const memberRows = await db.select({ id: Members.id })
      .from(Members)
      .where(eq(Members.spaceId, space.id))
      .all();
    const memberCount = memberRows.length + 1; // +1 for owner

    // Fetch a preview of threads (up to 5)
    const threadRows = await db.select({
      id: Threads.id,
      title: Threads.title,
      color: Threads.color,
    })
      .from(Threads)
      .where(eq(Threads.spaceId, space.id))
      .orderBy(desc(Threads.updatedAt))
      .limit(5)
      .all();

    // Fetch note counts per thread
    const threadIds = threadRows.map(t => t.id);
    const noteCounts = threadIds.length > 0
      ? await db.select({
          threadId: NoteThreads.threadId,
          noteCount: count(NoteThreads.id),
        })
        .from(NoteThreads)
        .groupBy(NoteThreads.threadId)
        .all()
      : [];
    const noteCountMap = Object.fromEntries(noteCounts.map(r => [r.threadId, r.noteCount]));
    const threads = threadRows.map(t => ({ ...t, noteCount: noteCountMap[t.id] ?? 0 }));

    // Fetch a preview of notes (up to 10)
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      noteType: Notes.noteType,
    })
      .from(Notes)
      .where(and(eq(Notes.spaceId, space.id), eq(Notes.contentEncrypted, false)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited),
        desc(Notes.updatedAt)
      )
      .limit(10)
      .all();

    // Check if current user is already a member (if authenticated)
    const { userId } = locals.auth();
    let isAlreadyMember = false;
    if (userId) {
      if (space.userId === userId) {
        isAlreadyMember = true;
      } else {
        const existingMember = await db.select()
          .from(Members)
          .where(and(eq(Members.spaceId, space.id), eq(Members.userId, userId)))
          .get();
        isAlreadyMember = !!existingMember;
      }
    }

    return successResponse({
      id: space.id,
      title: space.title,
      color: space.color,
      ownerDisplayName,
      ownerColor: ownerData?.userColor || 'paper',
      memberCount,
      noteCount: notes.length,
      isAlreadyMember,
      threads,
      notes,
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/join-preview/[token]',
      action: 'get_join_preview',
    });
    return errorResponse(standardError.message, standardError.code, 500);
  }
};
