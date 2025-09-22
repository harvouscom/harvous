import type { APIRoute } from 'astro';
import { db, UserXP, Threads, Notes, eq, and } from 'astro:db';
import { 
  awardThreadCreatedXP, 
  awardNoteCreatedXP, 
  calculateTotalXP, 
  getXPBreakdown,
  cleanupDuplicateXP,
  hasXPBeenAwarded,
  ACTIVITY_TYPES 
} from '@/utils/xp-system';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { testType } = body;

    const results: any = {
      userId,
      testType,
      timestamp: new Date().toISOString()
    };

    switch (testType) {
      case 'duplicate_thread_xp':
        // Test duplicate thread XP prevention
        const testThreadId = `test_thread_${Date.now()}`;
        
        // Award XP multiple times
        await awardThreadCreatedXP(userId, testThreadId);
        await awardThreadCreatedXP(userId, testThreadId);
        await awardThreadCreatedXP(userId, testThreadId);
        
        // Check how many XP records were created
        const threadXPRecords = await db.select()
          .from(UserXP)
          .where(and(
            eq(UserXP.userId, userId),
            eq(UserXP.activityType, ACTIVITY_TYPES.THREAD_CREATED),
            eq(UserXP.relatedId, testThreadId)
          ));
        
        results.threadId = testThreadId;
        results.xpRecordsCreated = threadXPRecords.length;
        results.totalXP = threadXPRecords.reduce((sum, record) => sum + record.xpAmount, 0);
        results.success = threadXPRecords.length === 1;
        break;

      case 'duplicate_note_xp':
        // Test duplicate note XP prevention
        const testNoteId = `test_note_${Date.now()}`;
        
        // Award XP multiple times
        await awardNoteCreatedXP(userId, testNoteId);
        await awardNoteCreatedXP(userId, testNoteId);
        await awardNoteCreatedXP(userId, testNoteId);
        
        // Check how many XP records were created
        const noteXPRecords = await db.select()
          .from(UserXP)
          .where(and(
            eq(UserXP.userId, userId),
            eq(UserXP.activityType, ACTIVITY_TYPES.NOTE_CREATED),
            eq(UserXP.relatedId, testNoteId)
          ));
        
        results.noteId = testNoteId;
        results.xpRecordsCreated = noteXPRecords.length;
        results.totalXP = noteXPRecords.reduce((sum, record) => sum + record.xpAmount, 0);
        results.success = noteXPRecords.length === 1;
        break;

      case 'check_existing_xp':
        // Test hasXPBeenAwarded function
        const { activityType, relatedId } = body;
        
        if (!activityType || !relatedId) {
          return new Response(JSON.stringify({ error: 'activityType and relatedId are required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        const hasXP = await hasXPBeenAwarded(userId, activityType, relatedId);
        results.activityType = activityType;
        results.relatedId = relatedId;
        results.hasXPBeenAwarded = hasXP;
        results.success = true;
        break;

      case 'cleanup_duplicates':
        // Test cleanup function
        const cleanupResult = await cleanupDuplicateXP(userId);
        results.cleanupResult = cleanupResult;
        results.success = true;
        break;

      case 'get_xp_summary':
        // Get current XP summary
        const totalXP = await calculateTotalXP(userId);
        const breakdown = await getXPBreakdown(userId);
        
        results.totalXP = totalXP;
        results.breakdown = breakdown;
        results.success = true;
        break;

      default:
        return new Response(JSON.stringify({ error: 'Invalid test type' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('XP duplicate prevention test error:', error);
    return new Response(JSON.stringify({ 
      error: 'Test failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
