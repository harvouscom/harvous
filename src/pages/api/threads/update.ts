import type { APIRoute } from 'astro';
import { threads } from '@/actions/threads';

export const POST: APIRoute = async ({ request, locals, callAction }) => {
  try {
    // Parse form data
    const formData = await request.formData();
    const threadId = formData.get('id') as string;
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const isPublic = formData.get('isPublic') === 'true';

    console.log("Updating thread with threadId:", threadId, "title:", title, "color:", color, "isPublic:", isPublic);

    if (!threadId || !title || !title.trim()) {
      return new Response(JSON.stringify({ error: 'Thread ID and title are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use Astro.callAction to call the threads.update action with FormData
    const result = await callAction(threads.update, formData);

    console.log("Thread updated successfully:", result);

    return new Response(JSON.stringify({
      success: 'Thread updated successfully!',
      thread: result.thread
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating thread:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Error updating thread'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
