export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';
import { generateShareToken } from '@/utils/ids';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const noteId = params.noteId;
    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch note and verify ownership
    const note = await db
      .select({
        id: Notes.id,
        isPublic: Notes.isPublic,
        shareToken: Notes.shareToken,
        shareTokenCreatedAt: Notes.shareTokenCreatedAt,
        userId: Notes.userId,
        noteType: Notes.noteType,
        contentEncrypted: Notes.contentEncrypted
      })
      .from(Notes)
      .where(eq(Notes.id, noteId))
      .get();

    if (!note) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (note.userId !== userId) {
      return new Response(JSON.stringify({ error: 'You do not have permission to access this note' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Scripture notes without a share token: create one so the share panel always has a link
    let effectiveShareToken = note.shareToken;
    let effectiveShareTokenCreatedAt = note.shareTokenCreatedAt;
    const isScriptureNote = note.noteType === 'scripture';
    const needsToken = isScriptureNote && !note.shareToken && !note.contentEncrypted;

    if (needsToken) {
      const now = new Date();
      effectiveShareToken = generateShareToken();
      effectiveShareTokenCreatedAt = now;
      await db
        .update(Notes)
        .set({
          isPublic: true,
          shareToken: effectiveShareToken,
          shareTokenCreatedAt: effectiveShareTokenCreatedAt,
          updatedAt: now
        })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
    }

    // Build the share URL
    const origin = new URL(request.url).origin;
    const shareUrl = effectiveShareToken ? `${origin}/shared/note/${effectiveShareToken}` : null;

    // Return current share status
    return new Response(JSON.stringify({
      isPublic: needsToken ? true : note.isPublic,
      shareToken: effectiveShareToken,
      shareUrl,
      shareTokenCreatedAt: effectiveShareTokenCreatedAt,
      noteType: note.noteType || 'default',
      contentEncrypted: note.contentEncrypted || false
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/[noteId]/share',
      action: 'get_share_status',
      noteId: params.noteId
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

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const noteId = params.noteId;
    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { action } = body;

    if (!action || !['enable', 'disable', 'refresh'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action. Must be enable, disable, or refresh' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch note and verify ownership
    const note = await db
      .select({
        id: Notes.id,
        isPublic: Notes.isPublic,
        shareToken: Notes.shareToken,
        userId: Notes.userId,
        contentEncrypted: Notes.contentEncrypted
      })
      .from(Notes)
      .where(eq(Notes.id, noteId))
      .get();

    if (!note) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (note.userId !== userId) {
      return new Response(JSON.stringify({ error: 'You do not have permission to modify this note' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Prevent sharing encrypted notes
    if (note.contentEncrypted && action === 'enable') {
      return new Response(JSON.stringify({
        error: 'Remove the lock first to share it.',
        code: 'ENCRYPTED_NOTE_CANNOT_SHARE'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    let newShareToken: string | null = null;
    let isPublic = note.isPublic;

    if (action === 'enable') {
      // Generate a new share token and enable sharing
      newShareToken = generateShareToken();
      isPublic = true;

      await db
        .update(Notes)
        .set({
          isPublic: true,
          shareToken: newShareToken,
          shareTokenCreatedAt: now,
          updatedAt: now
        })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

    } else if (action === 'disable') {
      // Clear share token and disable sharing
      newShareToken = null;
      isPublic = false;

      await db
        .update(Notes)
        .set({
          isPublic: false,
          shareToken: null,
          shareTokenCreatedAt: null,
          updatedAt: now
        })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

    } else if (action === 'refresh') {
      // Locked notes cannot be shared or refreshed
      if (note.contentEncrypted) {
        return new Response(JSON.stringify({
          error: 'Remove the lock first to share it.',
          code: 'ENCRYPTED_NOTE_CANNOT_SHARE'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      // Generate a new share token (invalidates old links)
      if (!note.isPublic) {
        return new Response(JSON.stringify({ error: 'Cannot refresh share link for a private note' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      newShareToken = generateShareToken();
      isPublic = true;

      await db
        .update(Notes)
        .set({
          shareToken: newShareToken,
          shareTokenCreatedAt: now,
          updatedAt: now
        })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
    }

    // Build the share URL
    const origin = new URL(request.url).origin;
    const shareUrl = newShareToken ? `${origin}/shared/note/${newShareToken}` : null;

    return new Response(JSON.stringify({
      success: true,
      isPublic,
      shareToken: newShareToken,
      shareUrl,
      shareTokenCreatedAt: action !== 'disable' ? now : null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/[noteId]/share',
      action: 'update_share_status',
      noteId: params.noteId
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
