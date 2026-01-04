/**
 * API endpoint to run the marketing seed script
 * 
 * Usage: POST to /api/seed-marketing
 * This endpoint runs the seed script in the Astro context where astro:db imports work
 */

import type { APIRoute } from 'astro';
import seedMarketing from '../../../scripts/seed-marketing.ts';

export const POST: APIRoute = async () => {
  try {
    console.log('🌱 Starting marketing seed via API...');
    await seedMarketing();
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Marketing seed completed successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('❌ Error running marketing seed:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};



