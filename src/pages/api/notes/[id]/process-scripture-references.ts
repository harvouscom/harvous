import type { APIRoute } from 'astro';
import { processScriptureReferences } from '@/utils/process-scripture-references';

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    const { id: noteId } = params;
    const { threadId } = await request.json();

    if (!userId) {
      return new Response(JSON.stringify({ 
        error: 'Authentication required' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!noteId) {
      return new Response(JSON.stringify({ 
        error: 'Note ID is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await processScriptureReferences(noteId, userId, threadId);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error processing scripture references:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error processing scripture references' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

