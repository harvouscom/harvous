import type { APIRoute } from 'astro';
import { db, Notes, Threads, isNull, eq } from 'astro:db';

export const prerender = false;

/**
 * One-time migration to backfill lastVisited for all existing content
 *
 * For items without lastVisited, set it to:
 * - updatedAt if available
 * - createdAt as fallback
 *
 * This ensures consistent ordering in the content list where recent activity appears first
 *
 * IMPORTANT: This migration runs for ALL users in the database
 *
 * Run once via: POST /api/migrations/backfill-last-visited
 *
 * Security: Requires a special migration key to prevent unauthorized execution
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Check for migration authorization key
    const authHeader = request.headers.get('Authorization');
    const migrationKey = import.meta.env.MIGRATION_KEY || process.env.MIGRATION_KEY;

    // Allow if:
    // 1. Migration key is set and matches, OR
    // 2. No migration key is set (for development/initial setup)
    const isAuthorized = !migrationKey || authHeader === `Bearer ${migrationKey}`;

    if (!isAuthorized) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Valid migration key required. Set MIGRATION_KEY environment variable and pass as Bearer token.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Track migration progress
    const results = {
      notesUpdated: 0,
      threadsUpdated: 0,
      errors: [] as string[],
      startTime: Date.now()
    };

    console.log('[Migration] Starting lastVisited backfill for all users...');

    // Backfill Notes.lastVisited using batch update
    try {
      // First, get count of notes to update
      const notesCount = await db.select({
        id: Notes.id
      })
      .from(Notes)
      .where(isNull(Notes.lastVisited))
      .all();

      console.log(`[Migration] Found ${notesCount.length} notes without lastVisited across all users`);

      // Batch update: Set lastVisited = COALESCE(updatedAt, createdAt) for all notes where lastVisited IS NULL
      // Process in batches of 1000 to avoid timeouts
      const batchSize = 1000;
      const notesToUpdate = await db.select({
        id: Notes.id,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
        userId: Notes.userId
      })
      .from(Notes)
      .where(isNull(Notes.lastVisited))
      .all();

      for (let i = 0; i < notesToUpdate.length; i += batchSize) {
        const batch = notesToUpdate.slice(i, i + batchSize);

        for (const note of batch) {
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

        console.log(`[Migration] Processed ${Math.min(i + batchSize, notesToUpdate.length)}/${notesToUpdate.length} notes`);
      }

      console.log(`[Migration] Successfully updated ${results.notesUpdated} notes`);
    } catch (error: any) {
      console.error('[Migration] Error backfilling notes:', error);
      results.errors.push(`Notes migration failed: ${error.message}`);
    }

    // Backfill Threads.lastVisited using batch update
    try {
      // First, get count of threads to update
      const threadsCount = await db.select({
        id: Threads.id
      })
      .from(Threads)
      .where(isNull(Threads.lastVisited))
      .all();

      console.log(`[Migration] Found ${threadsCount.length} threads without lastVisited across all users`);

      // Batch update
      const batchSize = 1000;
      const threadsToUpdate = await db.select({
        id: Threads.id,
        updatedAt: Threads.updatedAt,
        createdAt: Threads.createdAt,
        userId: Threads.userId
      })
      .from(Threads)
      .where(isNull(Threads.lastVisited))
      .all();

      for (let i = 0; i < threadsToUpdate.length; i += batchSize) {
        const batch = threadsToUpdate.slice(i, i + batchSize);

        for (const thread of batch) {
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

        console.log(`[Migration] Processed ${Math.min(i + batchSize, threadsToUpdate.length)}/${threadsToUpdate.length} threads`);
      }

      console.log(`[Migration] Successfully updated ${results.threadsUpdated} threads`);
    } catch (error: any) {
      console.error('[Migration] Error backfilling threads:', error);
      results.errors.push(`Threads migration failed: ${error.message}`);
    }

    const duration = ((Date.now() - results.startTime) / 1000).toFixed(2);

    // Return summary
    const success = results.errors.length === 0;
    console.log(`[Migration] Completed in ${duration}s. Notes: ${results.notesUpdated}, Threads: ${results.threadsUpdated}, Errors: ${results.errors.length}`);

    return new Response(JSON.stringify({
      success,
      message: success
        ? `Migration completed successfully in ${duration}s`
        : `Migration completed with errors in ${duration}s`,
      results: {
        notesUpdated: results.notesUpdated,
        threadsUpdated: results.threadsUpdated,
        totalUpdated: results.notesUpdated + results.threadsUpdated,
        duration: `${duration}s`,
        errors: results.errors.length > 0 ? results.errors.slice(0, 10) : [] // Limit error output
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
