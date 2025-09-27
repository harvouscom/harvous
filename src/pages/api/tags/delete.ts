import type { APIRoute } from 'astro';
import { db, Tags, NoteTags, eq, and } from 'astro:db';

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const tagId = url.searchParams.get('tagId');

    if (!tagId) {
      return new Response(JSON.stringify({ error: 'Tag ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if tag exists and belongs to user
    const tag = await db
      .select()
      .from(Tags)
      .where(and(eq(Tags.id, tagId), eq(Tags.userId, userId)))
      .get();

    if (!tag) {
      return new Response(JSON.stringify({ error: 'Tag not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Don't allow deletion of system tags
    if (tag.isSystem) {
      return new Response(JSON.stringify({ error: 'Cannot delete system tags' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove all note-tag relationships first
    await db.delete(NoteTags).where(eq(NoteTags.tagId, tagId));

    // Delete the tag
    await db.delete(Tags).where(eq(Tags.id, tagId));

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tag deleted successfully' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting tag:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
