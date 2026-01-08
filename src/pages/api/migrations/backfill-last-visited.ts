import type { APIRoute } from 'astro';
import { db, Notes, Threads, eq, isNull, sql } from 'astro:db';

/**
 * One-time migration to backfill lastVisited for all existing content
 *
 * For items without lastVisited, set it to:
 * - updatedAt if available
 * - createdAt as fallback
 *
 * This ensures consistent ordering in the content list where recent activity appears first
 *
 * Run once via: POST /api/migrations/backfill-last-visited
 */
export const POST: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();

    // Only allow authenticated users to run migrations
    if (!userId) {
      return new Response(JSON.stringify({
        error: 'Authentication required',
        message: 'You must be logged in to run migrations'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Track migration progress
    const results = {
      notesUpdated: 0,
      threadsUpdated: 0,
      errors: [] as string[]
    };

    // Backfill Notes.lastVisited
    try {
      // Get all notes with null lastVisited
      const notesToUpdate = await db.select({
        id: Notes.id,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
        userId: Notes.userId
      })
      .from(Notes)
      .where(isNull(Notes.lastVisited))
      .all();

      console.log(`[Migration] Found ${notesToUpdate.length} notes without lastVisited`);

      // Update each note with updatedAt or createdAt as fallback
      for (const note of notesToUpdate) {
        try {
          const fallbackDate = note.updatedAt || note.createdAt;

          if (fallbackDate) {
            await db.update(Notes)
              .set({ lastVisited: fallbackDate })
              .where(eq(Notes.id, note.id))
              .run();

            results.notesUpdated++;
          }
        } catch (error: any) {
          console.error(`[Migration] Error updating note ${note.id}:`, error);
          results.errors.push(`Note ${note.id}: ${error.message}`);
        }
      }

      console.log(`[Migration] Updated ${results.notesUpdated} notes`);
    } catch (error: any) {
      console.error('[Migration] Error backfilling notes:', error);
      results.errors.push(`Notes migration failed: ${error.message}`);
    }

    // Backfill Threads.lastVisited
    try {
      // Get all threads with null lastVisited
      const threadsToUpdate = await db.select({
        id: Threads.id,
        updatedAt: Threads.updatedAt,
        createdAt: Threads.createdAt,
        userId: Threads.userId
      })
      .from(Threads)
      .where(isNull(Threads.lastVisited))
      .all();

      console.log(`[Migration] Found ${threadsToUpdate.length} threads without lastVisited`);

      // Update each thread with updatedAt or createdAt as fallback
      for (const thread of threadsToUpdate) {
        try {
          const fallbackDate = thread.updatedAt || thread.createdAt;

          if (fallbackDate) {
            await db.update(Threads)
              .set({ lastVisited: fallbackDate })
              .where(eq(Threads.id, thread.id))
              .run();

            results.threadsUpdated++;
          }
        } catch (error: any) {
          console.error(`[Migration] Error updating thread ${thread.id}:`, error);
          results.errors.push(`Thread ${thread.id}: ${error.message}`);
        }
      }

      console.log(`[Migration] Updated ${results.threadsUpdated} threads`);
    } catch (error: any) {
      console.error('[Migration] Error backfilling threads:', error);
      results.errors.push(`Threads migration failed: ${error.message}`);
    }

    // Return summary
    const success = results.errors.length === 0;
    return new Response(JSON.stringify({
      success,
      message: success
        ? 'Migration completed successfully'
        : 'Migration completed with errors',
      results: {
        notesUpdated: results.notesUpdated,
        threadsUpdated: results.threadsUpdated,
        totalUpdated: results.notesUpdated + results.threadsUpdated,
        errors: results.errors
      }
    }), {
      status: success ? 200 : 207, // 207 = Multi-Status (partial success)
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[Migration] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Migration failed',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
