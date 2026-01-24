import type { APIRoute } from 'astro';
import { generateAutoTags, applyAutoTags, regenerateAutoTags } from '@/utils/auto-tag-generator';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    let userId: string | null = null;

    // SSR Mode: Use middleware auth
    if (locals?.auth) {
      const auth = locals.auth();
      userId = auth.userId || null;
    }
    // Static/Capacitor Mode: Verify JWT from Authorization header
    else {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const verified = await verifyToken(token, {
            secretKey: import.meta.env.CLERK_SECRET_KEY
          });
          userId = verified.sub;
        } catch (error) {
          console.error('[API Auth] Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { noteId, noteTitle, noteContent, action = 'generate' } = body;

    if (!noteId || !noteTitle || !noteContent) {
      return new Response(JSON.stringify({ error: 'Note ID, title, and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let result;

    switch (action) {
      case 'generate':
        // Just generate suggestions without applying
        result = await generateAutoTags(noteTitle, noteContent, userId);
        break;
        
      case 'apply':
        // Generate and apply tags
        const suggestions = await generateAutoTags(noteTitle, noteContent, userId);
        const applied = await applyAutoTags(noteId, suggestions.suggestions, userId);
        result = { ...suggestions, applied };
        break;
        
      case 'regenerate':
        // Remove old auto tags and create new ones
        result = await regenerateAutoTags(noteId, noteTitle, noteContent, userId);
        break;
        
      default:
        return new Response(JSON.stringify({ error: 'Invalid action. Use "generate", "apply", or "regenerate"' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      result 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error with auto tags:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
