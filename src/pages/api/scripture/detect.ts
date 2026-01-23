import type { APIRoute } from 'astro';
import { detectScripture, getPrimaryReference, parseScriptureReference } from '@/utils/scripture-detector';
import { handleAPIError } from '@/utils/error-handling';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Text is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const detection = await detectScripture(text);
    const primaryReference = getPrimaryReference(detection);
    
    // Parse the primary reference to get components for easy verse fetching
    let parsedReference = null;
    if (primaryReference) {
      parsedReference = parseScriptureReference(primaryReference);
    }

    return new Response(JSON.stringify({
      ...detection,
      primaryReference,
      parsedReference
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/scripture/detect',
      action: 'detect_scripture'
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

