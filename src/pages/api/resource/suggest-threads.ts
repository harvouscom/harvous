export const prerender = false;

import type { APIRoute } from 'astro';
import { db, ResourceMetadata, Notes, NoteThreads, Threads, eq, and, inArray, count } from 'astro:db';
import { extractDomain, getDomainFriendlyName, validateResourceUrl } from '@/utils/validation';
import { handleAPIError } from '@/utils/error-handling';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { resourceUrl, sourceName } = body;

    if (!resourceUrl || typeof resourceUrl !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Resource URL is required',
        code: 'MISSING_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate and normalize URL
    const urlValidation = validateResourceUrl(resourceUrl);
    if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
      return new Response(JSON.stringify({ 
        error: urlValidation.error || 'Invalid URL',
        code: urlValidation.code || 'INVALID_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Extract domain from URL
    const domain = extractDomain(urlValidation.normalizedUrl);
    if (!domain) {
      return new Response(JSON.stringify({ 
        error: 'Could not extract domain from URL',
        code: 'DOMAIN_EXTRACTION_FAILED'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find all resource notes from the same domain for this user, including sourceName
    const matchingResources = await db
      .select({
        noteId: ResourceMetadata.noteId,
        sourceName: ResourceMetadata.sourceName,
      })
      .from(ResourceMetadata)
      .innerJoin(Notes, eq(ResourceMetadata.noteId, Notes.id))
      .where(
        and(
          eq(ResourceMetadata.sourceDomain, domain),
          eq(Notes.userId, userId)
        )
      )
      .all();

    // Get the most common sourceName from existing resources, or use provided sourceName
    let suggestedThreadName: string | null = null;
    
    // Priority 1: Use sourceName provided from frontend (already fetched metadata)
    if (sourceName && typeof sourceName === 'string' && sourceName.trim() !== '') {
      suggestedThreadName = sourceName.trim();
    }
    
    // Priority 2: Find the most common sourceName from existing resources
    if (!suggestedThreadName && matchingResources.length > 0) {
      const sourceNames = matchingResources
        .map(r => r.sourceName)
        .filter((name): name is string => name !== null && name.trim() !== '');
      
      if (sourceNames.length > 0) {
        // Count occurrences and get the most common one
        const nameCounts: Record<string, number> = {};
        sourceNames.forEach(name => {
          nameCounts[name] = (nameCounts[name] || 0) + 1;
        });
        
        const mostCommonName = Object.entries(nameCounts)
          .sort((a, b) => b[1] - a[1])[0][0];
        
        suggestedThreadName = mostCommonName;
      }
    }
    
    // Priority 3: Fall back to domain-friendly name
    if (!suggestedThreadName) {
      const friendlyName = getDomainFriendlyName(domain);
      suggestedThreadName = friendlyName || domain.charAt(0).toUpperCase() + domain.slice(1).replace(/\./g, ' ');
    }

    if (matchingResources.length === 0) {
      // No existing resources from this domain - suggest creating a new thread
      return new Response(JSON.stringify({
        success: true,
        suggestedThreadIds: [],
        suggestedThreadName,
        domain,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get note IDs from matching resources
    const noteIds = matchingResources.map(r => r.noteId);

    // Find threads that contain these notes via junction table
    const threadRelations = await db
      .select({
        threadId: NoteThreads.threadId,
      })
      .from(NoteThreads)
      .where(inArray(NoteThreads.noteId, noteIds))
      .all();

    // Get unique thread IDs (excluding unorganized)
    const uniqueThreadIds = [...new Set(threadRelations.map(r => r.threadId))]
      .filter(id => id !== 'thread_unorganized');

    if (uniqueThreadIds.length === 0) {
      // Resources exist but are all in unorganized - suggest creating a new thread
      // Use the sourceName we already determined above
      return new Response(JSON.stringify({
        success: true,
        suggestedThreadIds: [],
        suggestedThreadName,
        domain,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch thread details for suggested threads
    const suggestedThreads = await db
      .select({
        id: Threads.id,
        title: Threads.title,
        color: Threads.color,
      })
      .from(Threads)
      .where(
        and(
          inArray(Threads.id, uniqueThreadIds),
          eq(Threads.userId, userId)
        )
      )
      .all();

    // Check if any of the suggested threads match the suggested thread name
    // Only suggest existing threads if their name matches the source name
    const matchingThreads = suggestedThreads.filter(thread => {
      if (!suggestedThreadName) return false;
      // Case-insensitive comparison
      return thread.title.trim().toLowerCase() === suggestedThreadName.trim().toLowerCase();
    });

    // If no threads match the source name, suggest creating a new thread instead
    if (matchingThreads.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        suggestedThreadIds: [],
        suggestedThreads: [],
        suggestedThreadName, // Suggest creating a new thread with this name
        domain,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get note counts for each matching thread (count how many matching resource notes are in each thread)
    const threadNoteCounts = await Promise.all(
      matchingThreads.map(async (thread) => {
        const matchingNotesInThread = await db
          .select()
          .from(NoteThreads)
          .where(
            and(
              eq(NoteThreads.threadId, thread.id),
              inArray(NoteThreads.noteId, noteIds)
            )
          )
          .all();

        return {
          threadId: thread.id,
          count: matchingNotesInThread.length
        };
      })
    );

    // Format response with thread metadata
    const suggestedThreadIds = matchingThreads.map(thread => {
      const noteCount = threadNoteCounts.find(tc => tc.threadId === thread.id)?.count || 0;
      return {
        id: thread.id,
        title: thread.title,
        color: thread.color,
        noteCount,
      };
    });

    // Sort by note count (descending) - threads with more matching resources first
    suggestedThreadIds.sort((a, b) => b.noteCount - a.noteCount);

    return new Response(JSON.stringify({
      success: true,
      suggestedThreadIds: suggestedThreadIds.map(t => t.id),
      suggestedThreads: suggestedThreadIds,
      suggestedThreadName: null, // No need to suggest creating new thread if we have matching threads
      domain,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/resource/suggest-threads',
      action: 'suggest_threads'
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


