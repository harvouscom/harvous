import type { APIRoute } from 'astro';
import { generateAutoTags } from '@/utils/auto-tag-generator';
import { debug } from '@/utils/logger';

export const GET: APIRoute = async ({ request, locals }) => {
  // Restrict to development only
  if (import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: 'Debug endpoints are not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    debug('Simple auto-tag test endpoint called');

    // Test with sample biblical content
    const testContent = "Jesus Christ is our Lord and Savior. Through faith and repentance, we receive salvation and eternal life.";
    const testTitle = "Test Note";
    
    debug('Testing auto-tag generation', { title: testTitle });
    
    const result = await generateAutoTags(testTitle, testContent, userId, 0.8);
    
    debug('Auto-tag test result', { tagCount: result.length });
    
    return new Response(JSON.stringify({
      success: true,
      result: result,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        isProduction: process.env.NODE_ENV === 'production'
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error('Simple auto-tag test error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        isProduction: process.env.NODE_ENV === 'production'
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
