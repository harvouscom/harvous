import { db, Notes, NoteThreads, Threads, eq, and, ne } from 'astro:db';

/**
 * Migration script to retire primary threadId logic
 * 
 * This script:
 * 1. Finds all notes with a primary threadId that's NOT "thread_unorganized"
 * 2. Ensures they have a junction table entry for that thread
 * 3. Sets all primary threadId to "thread_unorganized" (legacy field)
 */
export async function migrateToJunctionOnly() {
  console.log('Starting threadId migration to junction-table-only...');
  
  // Get all notes that have a primary threadId other than unorganized
  const notesToMigrate = await db.select({
    id: Notes.id,
    threadId: Notes.threadId,
    userId: Notes.userId,
  })
  .from(Notes)
  .where(ne(Notes.threadId, 'thread_unorganized'))
  .all();
  
  console.log(`Found ${notesToMigrate.length} notes to migrate`);
  
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
      await db.update(Notes)
        .set({ threadId: 'thread_unorganized' })
        .where(eq(Notes.id, note.id));
      
      migrated++;
    } catch (error) {
      console.error(`Error migrating note ${note.id}:`, error);
      errors++;
    }
  }
  
  console.log(`Migration complete:`);
  console.log(`  - ${migrated} notes migrated`);
  console.log(`  - ${junctionEntriesCreated} junction entries created`);
  console.log(`  - ${errors} errors`);
  
  return { migrated, junctionEntriesCreated, errors };
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateToJunctionOnly()
    .then((result) => {
      console.log('Migration finished:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

