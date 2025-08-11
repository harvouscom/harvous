import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db, NoteThreads, eq, and } from "astro:db";

export const noteThreads = {
  addToThread: defineAction({
    accept: "form",
    input: z.object({
      noteId: z.coerce.number().min(1, "Note ID is required"),
      threadId: z.coerce.number().min(1, "Thread ID is required"),
      userId: z.string().min(1, "User ID is required"),
    }),
    handler: async ({ noteId, threadId, userId }) => {
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
            success: "Note is already in this thread",
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
          success: "Note added to thread successfully!",
          noteThread: newNoteThread
        };
      } catch (error: any) {
        throw new Error(`Failed to add note to thread: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  removeFromThread: defineAction({
    accept: "form",
    input: z.object({
      noteId: z.coerce.number().min(1, "Note ID is required"),
      threadId: z.coerce.number().min(1, "Thread ID is required"),
      userId: z.string().min(1, "User ID is required"),
    }),
    handler: async ({ noteId, threadId, userId }) => {
      try {
        const deletedNoteThread = await db.delete(NoteThreads)
          .where(and(
            eq(NoteThreads.noteId, noteId),
            eq(NoteThreads.threadId, threadId)
          ))
          .returning()
          .get();

        if (!deletedNoteThread) {
          throw new Error("Note is not in this thread or already removed");
        }

        return {
          success: "Note removed from thread successfully!",
          noteThread: deletedNoteThread
        };
      } catch (error: any) {
        throw new Error(`Failed to remove note from thread: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  getThreadsByNoteId: defineAction({
    accept: "form",
    input: z.object({
      noteId: z.coerce.number().min(1, "Note ID is required"),
    }),
    handler: async ({ noteId }) => {
      try {
        const threadRelations = await db.select()
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, noteId));
        
        return {
          success: "Threads fetched successfully",
          threadRelations
        };
      } catch (error: any) {
        throw new Error(`Failed to fetch threads: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  getNotesByThreadId: defineAction({
    accept: "form",
    input: z.object({
      threadId: z.coerce.number().min(1, "Thread ID is required"),
    }),
    handler: async ({ threadId }) => {
      try {
        const noteRelations = await db.select()
          .from(NoteThreads)
          .where(eq(NoteThreads.threadId, threadId));
        
        return {
          success: "Notes fetched successfully",
          noteRelations
        };
      } catch (error: any) {
        throw new Error(`Failed to fetch notes: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  })
}; 