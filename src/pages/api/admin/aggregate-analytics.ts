export const prerender = false;

import type { APIRoute } from 'astro';
import { aggregateMonthlyAnalytics, getCurrentMonth, getPreviousMonth } from '@/utils/analytics-aggregator';

/**
 * API endpoint to aggregate monthly analytics
 * Can be called manually or by a scheduled job
 * 
 * Usage:
 * - POST /api/admin/aggregate-analytics (aggregates current month)
 * - POST /api/admin/aggregate-analytics?month=2025-01 (aggregates specific month)
 * - POST /api/admin/aggregate-analytics?previous=true (aggregates previous month)
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const { userId } = locals.auth();
    
    // Check authentication: either secret token OR authenticated user
    const authHeader = request.headers.get('authorization');
    const expectedToken = import.meta.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const isAuthenticated = userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
    
    // Require either valid token (for scheduled jobs) or authenticated user (for manual calls)
    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const previous = url.searchParams.get('previous') === 'true';
    const monthParam = url.searchParams.get('month');

    let targetMonth: string;
    
    if (monthParam) {
      // Validate month format (YYYY-MM)
      if (!/^\d{4}-\d{2}$/.test(monthParam)) {
        return new Response(JSON.stringify({ error: 'Invalid month format. Use YYYY-MM' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      targetMonth = monthParam;
    } else if (previous) {
      targetMonth = getPreviousMonth();
    } else {
      targetMonth = getCurrentMonth();
    }

    await aggregateMonthlyAnalytics(targetMonth);

    return new Response(JSON.stringify({ 
      success: true, 
      month: targetMonth,
      message: `Analytics aggregated for ${targetMonth}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error aggregating analytics:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Also support GET for easy manual triggering
export const GET: APIRoute = POST;

