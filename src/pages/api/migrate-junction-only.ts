import type { APIRoute } from 'astro';
import { db, Notes, NoteThreads, Threads, eq, and, ne } from 'astro:db';

/**
 * Migration API endpoint to retire primary threadId logic
 * 
 * This endpoint:
 * 1. Finds all notes with a primary threadId that's NOT "thread_unorganized"
 * 2. Ensures they have a junction table entry for that thread
 * 3. Sets all primary threadId to "thread_unorganized" (legacy field)
 * 
 * Run this once to migrate existing data to junction-table-only approach
 */
async function runMigration(locals: any, url: URL) {
  const runForAllUsers = url.searchParams.get('all') === 'true';
  
  try {
    const auth = locals.auth();
    const userId = auth?.userId;
    
    if (!userId && !runForAllUsers) {
      return new Response(JSON.stringify({ error: 'Authentication required. Add ?all=true to run for all users (use with caution)' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Starting threadId migration to junction-table-only...');
    
    // Get all notes that have a primary threadId other than unorganized
    const whereClause = runForAllUsers 
      ? ne(Notes.threadId, 'thread_unorganized')
      : and(
          ne(Notes.threadId, 'thread_unorganized'),
          eq(Notes.userId, userId!)
        );
    
    const notesToMigrate = await db.select({
      id: Notes.id,
      threadId: Notes.threadId,
      userId: Notes.userId,
    })
    .from(Notes)
    .where(whereClause)
    .all();
    
    console.log(`Found ${notesToMigrate.length} notes to migrate${runForAllUsers ? ' (all users)' : ` for user ${userId}`}`);
    
    let migrated = 0;
    let errors = 0;
    let junctionEntriesCreated = 0;
    
    for (const note of notesToMigrate) {
      try {
        const primaryThreadId = note.threadId;
        
        // Check if note already has a junction entry for this thread
        const existingJunction = await db.select()
          .from(NoteThreads)
          .where(and(
            eq(NoteThreads.noteId, note.id),
            eq(NoteThreads.threadId, primaryThreadId)
          ))
          .get();
        
        // If no junction entry exists, create one
        if (!existingJunction) {
          // Verify the thread still exists
          const thread = await db.select()
            .from(Threads)
            .where(eq(Threads.id, primaryThreadId))
            .get();
          
          if (thread) {
            await db.insert(NoteThreads).values({
              id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              noteId: note.id,
              threadId: primaryThreadId,
              createdAt: new Date()
            });
            junctionEntriesCreated++;
            console.log(`Created junction entry for note ${note.id} -> thread ${primaryThreadId}`);
          } else {
            console.log(`Thread ${primaryThreadId} no longer exists, skipping note ${note.id}`);
          }
        }
        
        // Set primary threadId to unorganized (legacy field)
        const updateWhere = runForAllUsers
          ? eq(Notes.id, note.id)
          : and(eq(Notes.id, note.id), eq(Notes.userId, note.userId));
        
        await db.update(Notes)
          .set({ threadId: 'thread_unorganized' })
          .where(updateWhere);
        
        migrated++;
      } catch (error) {
        console.error(`Error migrating note ${note.id}:`, error);
        errors++;
      }
    }
    
    const result = {
      success: true,
      migrated,
      junctionEntriesCreated,
      errors,
      scope: runForAllUsers ? 'all users' : `user ${userId}`,
      message: `Migration complete: ${migrated} notes migrated, ${junctionEntriesCreated} junction entries created, ${errors} errors`
    };
    
    console.log('Migration complete:', result);
    
    // Return HTML response for easier browser viewing
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Migration Complete</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            .success { color: green; }
            .info { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Migration Complete!</h1>
          <div class="info">
            <h2>Results:</h2>
            <ul>
              <li><strong>Notes migrated:</strong> ${migrated}</li>
              <li><strong>Junction entries created:</strong> ${junctionEntriesCreated}</li>
              <li><strong>Errors:</strong> ${errors}</li>
              <li><strong>Scope:</strong> ${runForAllUsers ? 'All users' : `User ${userId}`}</li>
            </ul>
          </div>
          <pre>${JSON.stringify(result, null, 2)}</pre>
          <p><a href="/dashboard">← Back to Dashboard</a></p>
        </body>
      </html>
    `;
    
    return new Response(htmlResponse, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error: any) {
    console.error('Migration failed:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || 'Migration failed' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const GET: APIRoute = async ({ locals, url }) => {
  return runMigration(locals, url);
};

export const POST: APIRoute = async ({ locals, url }) => {
  return runMigration(locals, url);
};

