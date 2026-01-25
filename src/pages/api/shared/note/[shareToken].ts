import type { APIRoute } from 'astro';
import { db, Notes, UserMetadata, ScriptureMetadata, ResourceMetadata, eq, and } from 'astro:db';
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

    // Fetch the note by share token (must be public)
    const note = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        isPublic: Notes.isPublic,
        shareToken: Notes.shareToken,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
        userId: Notes.userId
      })
      .from(Notes)
      .where(and(
        eq(Notes.shareToken, shareToken),
        eq(Notes.isPublic, true)
      ))
      .get();

    if (!note) {
      return new Response(JSON.stringify({
        error: 'Shared note not found or no longer available'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch scripture metadata if it's a scripture note
    let scriptureMetadata = null;
    if (note.noteType === 'scripture') {
      scriptureMetadata = await db
        .select({
          reference: ScriptureMetadata.reference,
          book: ScriptureMetadata.book,
          chapter: ScriptureMetadata.chapter,
          verse: ScriptureMetadata.verse,
          verseEnd: ScriptureMetadata.verseEnd,
          translation: ScriptureMetadata.translation,
          originalText: ScriptureMetadata.originalText
        })
        .from(ScriptureMetadata)
        .where(eq(ScriptureMetadata.noteId, note.id))
        .get();
    }

    // Fetch resource metadata if it's a resource note
    let resourceMetadata = null;
    if (note.noteType === 'resource') {
      resourceMetadata = await db
        .select({
          sourceUrl: ResourceMetadata.sourceUrl,
          sourceDomain: ResourceMetadata.sourceDomain,
          sourceName: ResourceMetadata.sourceName,
          sourceTitle: ResourceMetadata.sourceTitle,
          sourceDescription: ResourceMetadata.sourceDescription,
          sourceImage: ResourceMetadata.sourceImage
        })
        .from(ResourceMetadata)
        .where(eq(ResourceMetadata.noteId, note.id))
        .get();
    }

    // Fetch creator info from UserMetadata
    const creator = await db
      .select({
        firstName: UserMetadata.firstName,
        lastName: UserMetadata.lastName,
        userColor: UserMetadata.userColor,
        profileImageUrl: UserMetadata.profileImageUrl
      })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, note.userId))
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
      note: {
        id: note.id,
        title: note.title,
        content: note.content,
        noteType: note.noteType,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      },
      scriptureMetadata,
      resourceMetadata,
      creator: {
        firstName,
        displayName,
        initials,
        userColor: creator?.userColor || 'paper',
        profileImageUrl: creator?.profileImageUrl || null
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/shared/note/[shareToken]',
      action: 'get_shared_note',
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
