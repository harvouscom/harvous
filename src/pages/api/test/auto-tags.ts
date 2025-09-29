import type { APIRoute } from 'astro';
import { generateAutoTags } from '@/utils/auto-tag-generator';

export const GET: APIRoute = async ({ request }) => {
  try {
    console.log('Auto-tag test endpoint called');
    
    // Test with sample biblical content
    const testContent = "Jesus Christ is our Lord and Savior. Through faith and repentance, we receive salvation and eternal life.";
    const testTitle = "Test Note";
    const testUserId = "test_user_123";
    
    console.log('Testing auto-tag generation with:', {
      title: testTitle,
      content: testContent.substring(0, 50) + '...',
      userId: testUserId
    });
    
    const result = await generateAutoTags(testTitle, testContent, testUserId, 0.8);
    
    console.log('Auto-tag test result:', result);
    
    return new Response(JSON.stringify({
      success: true,
      testResult: result,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        hasClerkKey: !!process.env.CLERK_SECRET_KEY,
        clerkKeyType: process.env.CLERK_SECRET_KEY?.startsWith('sk_live_') ? 'production' : 'test'
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error('Auto-tag test error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        hasClerkKey: !!process.env.CLERK_SECRET_KEY
      }
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};
