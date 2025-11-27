import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, eq, and } from 'astro:db';
import { generateThreadId } from '@/utils/ids';
import { THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { awardThreadCreatedXP } from '@/utils/xp-system';
import { handleAPIError } from '@/utils/error-handling';
import { validateTitle, validateColor, validateSpaceId } from '@/utils/validation';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { getNextUntitledThreadName } from '@/utils/untitled-naming';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/threads/create', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
      });
    }

    // Parse form data
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const isPublic = formData.get('isPublic') === 'true';
    const spaceId = formData.get('spaceId') as string;
    const selectedNoteIdsStr = formData.get('selectedNoteIds') as string | null;

    // Parse selected note IDs
    let selectedNoteIds: string[] = [];
    if (selectedNoteIdsStr) {
      // Trim whitespace and validate format before parsing
      const trimmed = selectedNoteIdsStr.trim();
      
      // Handle empty strings gracefully
      if (trimmed.length === 0) {
        selectedNoteIds = [];
      } else {
        // Validate that it looks like a JSON array (starts with [ and ends with ])
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            selectedNoteIds = JSON.parse(trimmed);
            // Ensure it's an array
            if (!Array.isArray(selectedNoteIds)) {
              console.error('selectedNoteIds is not an array after parsing');
              selectedNoteIds = [];
            }
          } catch (e) {
            console.error('Error parsing selectedNoteIds:', e);
            selectedNoteIds = [];
          }
        } else {
          // Invalid format - log and use empty array
          console.error('selectedNoteIds does not appear to be a JSON array:', trimmed);
          selectedNoteIds = [];
        }
      }
    }

    // Validate title (not required, defaults to "Untitled Thread N")
    const titleValidation = validateTitle(title, false);
    if (!titleValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: titleValidation.error,
        code: titleValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Default to "Untitled Thread N" if title is empty or whitespace
    let finalTitle: string;
    if (!title || !title.trim()) {
      finalTitle = await getNextUntitledThreadName(userId);
    } else {
      finalTitle = title.trim();
    }

    // Validate color if provided
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: colorValidation.error,
        code: colorValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let threadColor = color;
    if (color && !THREAD_COLORS.includes(color as any)) {
      threadColor = getRandomThreadColor();
    } else if (!color) {
      threadColor = getRandomThreadColor();
    }

    // Validate spaceId
    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: spaceIdValidation.error,
        code: spaceIdValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Make spaceId optional - if not provided or is 'default_space', set to null
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') {
      finalSpaceId = spaceId;
    }

    const capitalizedTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
    
    const newThread = await db.insert(Threads)
      .values({
        id: generateThreadId(),
        title: capitalizedTitle,
        subtitle: null,
        spaceId: finalSpaceId,
        userId,
        isPublic,
        color: threadColor,
        isPinned: false,
        createdAt: new Date()
      })
      .returning()
      .get();

    // Add selected notes to the thread via junction table
    if (selectedNoteIds.length > 0) {
      for (const noteId of selectedNoteIds) {
        try {
          // Verify note exists and belongs to user
          const note = await db.select()
            .from(Notes)
            .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
            .get();
          
          if (!note) {
            continue;
          }

          // Check if note is already in this thread
          const existingRelation = await db.select()
            .from(NoteThreads)
            .where(and(eq(NoteThreads.noteId, noteId), eq(NoteThreads.threadId, newThread.id)))
            .get();

          if (existingRelation) {
            continue;
          }

          // Check if note is currently in unorganized (no NoteThreads entries)
          const existingThreadRelations = await db.select()
            .from(NoteThreads)
            .where(eq(NoteThreads.noteId, noteId))
            .all();
          
          const isInUnorganized = existingThreadRelations.length === 0 || note.threadId === 'thread_unorganized';

          // Add the note to the thread via junction table
          const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(NoteThreads).values({
            id: noteThreadId,
            noteId: noteId,
            threadId: newThread.id,
            createdAt: new Date()
          });

          // If note was in unorganized, update the legacy threadId field to the new thread
          if (isInUnorganized && newThread.id !== 'thread_unorganized') {
            await db.update(Notes)
              .set({ threadId: newThread.id })
              .where(eq(Notes.id, noteId));
          }
        } catch (error: any) {
          // Log error but continue with other notes
          console.error(`Error adding note ${noteId} to thread:`, error);
        }
      }

      // Update thread timestamp after adding notes
      await db.update(Threads)
        .set({ updatedAt: new Date() })
        .where(and(eq(Threads.id, newThread.id), eq(Threads.userId, userId)));
    }

    // Award XP for thread creation (pass title for validation)
    await awardThreadCreatedXP(userId, newThread.id, capitalizedTitle, null);

    // Add a small delay to ensure the database operation completes
    await new Promise(resolve => setTimeout(resolve, 150));

    return new Response(JSON.stringify({
      success: 'Thread created successfully!',
      thread: newThread
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/create',
      action: 'create_thread'
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
