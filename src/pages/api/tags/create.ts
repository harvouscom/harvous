import type { APIRoute } from 'astro';
import { db, Tags, eq, and } from 'astro:db';

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
    const { name, color, category } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Tag name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if tag already exists for this user
    const existingTag = await db
      .select()
      .from(Tags)
      .where(and(eq(Tags.userId, userId), eq(Tags.name, name.trim())))
      .get();

    if (existingTag) {
      return new Response(JSON.stringify({ error: 'Tag already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create new tag
    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newTag = await db.insert(Tags).values({
      id: tagId,
      name: name.trim(),
      color: color || '#006eff',
      category: category || 'spiritual',
      userId: userId,
      isSystem: false,
      createdAt: new Date(),
    });

    return new Response(JSON.stringify({ 
      success: true, 
      tag: {
        id: tagId,
        name: name.trim(),
        color: color || '#006eff',
        category: category || 'spiritual',
        userId: userId,
        isSystem: false,
        createdAt: new Date().toISOString()
      }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error creating tag:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
