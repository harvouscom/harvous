import type { APIRoute } from 'astro';
import { calculateTotalXP, getXPBreakdown, backfillUserXP } from '@/utils/xp-system';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'info';
    
    let result: any = {};
    
    switch (action) {
      case 'total':
        result.totalXP = await calculateTotalXP(userId);
        break;
        
      case 'breakdown':
        result = await getXPBreakdown(userId);
        break;
        
      case 'backfill':
        console.log(`Starting XP backfill for user: ${userId}`);
        await backfillUserXP(userId);
        result = await getXPBreakdown(userId);
        result.backfilled = true;
        break;
        
      case 'info':
      default:
        result = {
          totalXP: await calculateTotalXP(userId),
          breakdown: await getXPBreakdown(userId),
          instructions: {
            total: '/api/test/xp?action=total',
            breakdown: '/api/test/xp?action=breakdown', 
            backfill: '/api/test/xp?action=backfill',
            info: '/api/test/xp?action=info'
          }
        };
        break;
    }

    return new Response(JSON.stringify({
      userId,
      action,
      result,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in XP test endpoint:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Error in XP test endpoint',
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
