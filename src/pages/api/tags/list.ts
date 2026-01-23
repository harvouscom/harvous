import type { APIRoute } from 'astro';
import { db, Tags, NoteTags, eq, and, count } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals  }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Get all tags for the user
    const tags = await db
      .select()
      .from(Tags)
      .where(eq(Tags.userId, userId))
      .orderBy(Tags.name);

    // Get note counts for each tag
    const tagsWithCounts = await Promise.all(
      tags.map(async (tag) => {
        const noteCount = await db
          .select({ count: count() })
          .from(NoteTags)
          .where(eq(NoteTags.tagId, tag.id));
        
        return {
          ...tag,
          noteCount: noteCount[0]?.count || 0
        };
      })
    );

    return new Response(JSON.stringify({ 
      success: true, 
      tags: tagsWithCounts 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/tags/list',
      action: 'list_tags'
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
