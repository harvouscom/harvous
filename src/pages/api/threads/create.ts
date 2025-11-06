import type { APIRoute } from 'astro';
import { db, Threads, eq, and } from 'astro:db';
import { generateThreadId } from '@/utils/ids';
import { THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { awardThreadCreatedXP } from '@/utils/xp-system';

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
    const color = formData.get('color') as string;
    const isPublic = formData.get('isPublic') === 'true';
    const spaceId = formData.get('spaceId') as string;

    console.log("Creating thread with userId:", userId, "title:", title, "color:", color, "isPublic:", isPublic, "spaceId:", spaceId);

    // Default to "Untitled Thread" if title is empty or whitespace
    const finalTitle = (!title || !title.trim()) ? 'Untitled Thread' : title.trim();

    // Make spaceId optional - if not provided or is 'default_space', set to null
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') {
      finalSpaceId = spaceId;
    }

    // Validate color if provided
    let threadColor = color;
    if (color && !THREAD_COLORS.includes(color as any)) {
      console.warn(`Invalid color provided: ${color}, using random color instead`);
      threadColor = getRandomThreadColor();
    } else if (!color) {
      threadColor = getRandomThreadColor();
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

    console.log("Thread created successfully:", newThread);

    // Award XP for thread creation
    await awardThreadCreatedXP(userId, newThread.id);

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
    console.error('Error creating thread:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Error creating thread'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
