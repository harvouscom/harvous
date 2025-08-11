import { db, NoteThreads, eq, and } from "astro:db";

// Add note to thread
export async function addNoteToThread(noteId: number, threadId: number) {
  try {
    // Check if the relation already exists to prevent duplicates
    const existing = await db.select()
      .from(NoteThreads)
      .where(and(
        eq(NoteThreads.noteId, noteId),
        eq(NoteThreads.threadId, threadId)
      ))
      .limit(1);

    if (existing.length > 0) {
      return {
        success: true,
        message: "Note is already in this thread",
        noteThread: existing[0]
      };
    }

    const newNoteThread = await db.insert(NoteThreads)
      .values({ 
        noteId, 
        threadId, 
        createdAt: new Date() 
      })
      .returning()
      .get();

    return {
      success: true,
      message: "Note added to thread successfully!",
      noteThread: newNoteThread
    };
  } catch (error) {
    console.error("Error adding note to thread:", error);
    return {
      success: false,
      message: `Failed to add note to thread: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

// Remove note from thread
export async function removeNoteFromThread(noteId: number, threadId: number) {
  try {
    const deletedNoteThread = await db.delete(NoteThreads)
      .where(and(
        eq(NoteThreads.noteId, noteId),
        eq(NoteThreads.threadId, threadId)
      ))
      .returning()
      .get();

    if (!deletedNoteThread) {
      return {
        success: false,
        message: "Note is not in this thread or already removed"
      };
    }

    return {
      success: true,
      message: "Note removed from thread successfully!",
      noteThread: deletedNoteThread
    };
  } catch (error) {
    console.error("Error removing note from thread:", error);
    return {
      success: false,
      message: `Failed to remove note from thread: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
} 