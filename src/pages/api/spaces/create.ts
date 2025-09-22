import type { APIRoute } from 'astro';
import { db, Spaces, eq, and } from 'astro:db';
import { generateSpaceId } from '@/utils/ids';

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

    // Parse form data
    const formData = await request.formData();
    const title = formData.get('title') as string;

    console.log("Creating space with userId:", userId, "title:", title);

    if (!title || !title.trim()) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    
    const newSpace = await db.insert(Spaces)
      .values({
        id: generateSpaceId(),
        title: capitalizedTitle,
        description: null,
        color: 'paper', // Always use paper color for spaces
        backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
        userId,
        isPublic: false,
        isActive: true,
        order: 0,
        createdAt: new Date()
      })
      .returning()
      .get();

    console.log("Space created successfully:", newSpace);

    // Add a small delay to ensure the database operation completes
    await new Promise(resolve => setTimeout(resolve, 150));

    return new Response(JSON.stringify({
      success: 'Space created successfully!',
      space: newSpace
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
