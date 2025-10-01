import type { APIRoute } from 'astro';
import { generateAutoTags, applyAutoTags } from '@/utils/auto-tag-generator';
import { db, Tags, NoteTags, eq, and } from 'astro:db';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Auto-tag debug endpoint called:', {
      userId: userId?.substring(0, 10) + '...',
      NODE_ENV: process.env.NODE_ENV,
      isProduction: process.env.NODE_ENV === 'production'
    });

    // Test with sample biblical content
    const testContent = "Jesus Christ is our Lord and Savior. Through faith and repentance, we receive salvation and eternal life. The Holy Spirit guides us in prayer and worship.";
    const testTitle = "Test Note for Auto-Tags";
    
    console.log('Testing auto-tag generation with:', {
      title: testTitle,
      content: testContent.substring(0, 50) + '...',
      userId: userId?.substring(0, 10) + '...'
    });
    
    // Test database connectivity
    let dbTest = { connected: false, error: null };
    try {
      const testQuery = await db.select().from(Tags).where(eq(Tags.userId, userId)).limit(1);
      dbTest = { connected: true, error: null };
      console.log('Database connectivity test passed');
    } catch (dbError) {
      dbTest = { connected: false, error: dbError instanceof Error ? dbError.message : String(dbError) };
      console.error('Database connectivity test failed:', dbError);
    }
    
    // Test auto-tag generation
    let autoTagResult = null;
    let autoTagError = null;
    
    try {
      autoTagResult = await generateAutoTags(testTitle, testContent, userId, 0.8);
      console.log('Auto-tag generation test passed:', {
        suggestionsCount: autoTagResult.suggestions.length,
        totalFound: autoTagResult.totalFound,
        highConfidence: autoTagResult.highConfidence
      });
    } catch (error) {
      autoTagError = error instanceof Error ? error.message : String(error);
      console.error('Auto-tag generation test failed:', error);
    }
    
    return new Response(JSON.stringify({
      success: true,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        isProduction: process.env.NODE_ENV === 'production',
        hasClerkKey: !!process.env.CLERK_SECRET_KEY,
        clerkKeyType: process.env.CLERK_SECRET_KEY?.startsWith('sk_live_') ? 'production' : 'test'
      },
      database: dbTest,
      autoTagTest: {
        result: autoTagResult,
        error: autoTagError
      },
      testData: {
        title: testTitle,
        content: testContent.substring(0, 100) + '...'
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error('Auto-tag debug endpoint error:', error);
    
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
