import type { APIRoute } from 'astro';
import { db, Spaces, Notes, Threads, eq, and } from 'astro:db';
import { generateSpaceId } from '@/utils/ids';
import { getThreadGradientCSS } from '@/utils/colors';
import { validateTitle, validateColor } from '@/utils/validation';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

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
    const rateLimit = rateLimitMiddleware(userId, '/api/spaces/create', 'write', ip);
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
    const color = formData.get('color') as string || 'paper';
    const isPublic = formData.get('isPublic') === 'true';
    
    // Parse selected items (can be JSON string or individual form fields)
    let selectedNoteIds: string[] = [];
    let selectedThreadIds: string[] = [];
    
    const noteIdsStr = formData.get('selectedNoteIds') as string;
    const threadIdsStr = formData.get('selectedThreadIds') as string;
    
    if (noteIdsStr) {
      // Trim whitespace and validate format before parsing
      const trimmed = noteIdsStr.trim();
      
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
            // If JSON parsing fails, treat as comma-separated (backward compatibility)
            console.warn('Failed to parse selectedNoteIds as JSON, treating as comma-separated:', e);
            selectedNoteIds = trimmed.split(',').filter(id => id.trim());
          }
        } else {
          // Not a JSON array format - treat as comma-separated (backward compatibility)
          selectedNoteIds = trimmed.split(',').filter(id => id.trim());
        }
      }
    }
    
    if (threadIdsStr) {
      // Trim whitespace and validate format before parsing
      const trimmed = threadIdsStr.trim();
      
      // Handle empty strings gracefully
      if (trimmed.length === 0) {
        selectedThreadIds = [];
      } else {
        // Validate that it looks like a JSON array (starts with [ and ends with ])
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            selectedThreadIds = JSON.parse(trimmed);
            // Ensure it's an array
            if (!Array.isArray(selectedThreadIds)) {
              console.error('selectedThreadIds is not an array after parsing');
              selectedThreadIds = [];
            }
          } catch (e) {
            // If JSON parsing fails, treat as comma-separated (backward compatibility)
            console.warn('Failed to parse selectedThreadIds as JSON, treating as comma-separated:', e);
            selectedThreadIds = trimmed.split(',').filter(id => id.trim());
          }
        } else {
          // Not a JSON array format - treat as comma-separated (backward compatibility)
          selectedThreadIds = trimmed.split(',').filter(id => id.trim());
        }
      }
    }

    // Validate title
    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: titleValidation.error,
        code: titleValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate color
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

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    
    // Generate background gradient based on color
    const backgroundGradient = getThreadGradientCSS(color);
    
    const newSpace = await db.insert(Spaces)
      .values({
        id: generateSpaceId(),
        title: capitalizedTitle,
        description: null,
        color: color,
        backgroundGradient: backgroundGradient,
        userId,
        isPublic: isPublic,
        isActive: true,
        order: 0,
        createdAt: new Date()
      })
      .returning()
      .get();

    // Update selected notes to belong to the new space
    if (selectedNoteIds.length > 0) {
      for (const noteId of selectedNoteIds) {
        try {
          // Verify the note exists and belongs to the user
          const note = await db.select()
            .from(Notes)
            .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
            .get();

          if (note) {
            await db.update(Notes)
              .set({ 
                spaceId: newSpace.id,
                updatedAt: new Date()
              })
              .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
          }
        } catch (error: any) {
          console.error(`Error updating note ${noteId}:`, error);
          // Continue with other notes even if one fails
        }
      }
    }

    // Update selected threads to belong to the new space
    if (selectedThreadIds.length > 0) {
      for (const threadId of selectedThreadIds) {
        try {
          // Don't allow moving unorganized thread
          if (threadId === 'thread_unorganized') {
            continue;
          }

          // Verify the thread exists and belongs to the user
          const thread = await db.select()
            .from(Threads)
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
            .get();

          if (thread) {
            await db.update(Threads)
              .set({ 
                spaceId: newSpace.id,
                updatedAt: new Date()
              })
              .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
          }
        } catch (error: any) {
          console.error(`Error updating thread ${threadId}:`, error);
          // Continue with other threads even if one fails
        }
      }
    }

    return new Response(JSON.stringify({
      success: 'Space created successfully!',
      space: newSpace,
      addedNotes: selectedNoteIds.length,
      addedThreads: selectedThreadIds.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error creating space:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Error creating space'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
