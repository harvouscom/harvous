import type { APIRoute } from 'astro';
import { db, Tags, NoteTags, eq, and, count } from 'astro:db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
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
    console.error('Error fetching tags:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
