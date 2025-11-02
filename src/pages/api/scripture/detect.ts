import type { APIRoute } from 'astro';
import { detectScripture, getPrimaryReference, parseScriptureReference } from '@/utils/scripture-detector';

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
    console.error('Error detecting scripture:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error detecting scripture' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

