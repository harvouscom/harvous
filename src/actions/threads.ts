import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db, Threads, Notes, NoteThreads, eq, and } from "astro:db";
import { THREAD_COLORS, getRandomThreadColor } from "@/utils/colors";
import { generateThreadId } from "@/utils/ids";
import { awardThreadCreatedXP, revokeXPOnDeletion, revokeAllXPForItem } from "@/utils/xp-system";

export const threads = {
  create: defineAction({
    accept: "form",
    input: z.object({
      title: z.string().min(1, "Title is required"),
      subtitle: z.string().optional(),
      spaceId: z.string().min(1, "Space ID is required"),
      isPublic: z.boolean().optional(),
      color: z.enum(THREAD_COLORS).optional()
    }),
    handler: async ({ title, subtitle, spaceId, isPublic = false, color }, context) => {
      // Get userId from authenticated context for security
      const { userId } = context.locals.auth();
      console.log("Creating thread with userId:", userId, "title:", title);
      
      if (!userId) {
        throw new Error("Authentication required");
      }
      try {
        // Use provided color or generate a random one
        const threadColor = color || getRandomThreadColor();
        
        console.log(`Creating thread with title: ${title}, subtitle: ${subtitle}, spaceId: ${spaceId}, userId: ${userId}, isPublic: ${isPublic}, color: ${threadColor}`);
        const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
        
        // Check if we're in a deployed environment
        const isProduction = import.meta.env.PROD;
        if (isProduction) {
          // Check if we have DB credentials
          if (!import.meta.env.ASTRO_DB_REMOTE_URL || !import.meta.env.ASTRO_DB_APP_TOKEN) {
            console.error('Missing database credentials in production environment');
          }
        }
        
        const newThread = await db.insert(Threads)
          .values({ 
            id: generateThreadId(),
            title: capitalizedTitle, 
            subtitle: subtitle || null,
            spaceId,
            userId, 
            isPublic,
            color: threadColor,
            createdAt: new Date() 
          })
          .returning()
          .get()
          
        console.log("Thread created successfully:", newThread);

        // Award XP for thread creation (pass title for validation)
        await awardThreadCreatedXP(userId, newThread.id, capitalizedTitle, subtitle || null);

        // Add a small delay to ensure the database operation completes
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Verify the new thread was created
        const verifyThread = await db.select()
          .from(Threads)
          .where(and(eq(Threads.id, newThread.id), eq(Threads.userId, userId)))
          .limit(1);
          
        if (!verifyThread.length) {
          console.warn("Thread creation verification failed");
        }

        console.log(`Thread created successfully: ${JSON.stringify(newThread)}`);
        return {
          success: "Thread created successfully!",
          thread: newThread
        };
      } catch (error: any) {
        console.error(`Error creating thread:`, error);
        
        if (error.validation && error.validation.includes("title")) {
          throw new Error("Thread title is required");
        }

        throw new Error(`Failed to submit: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  update: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1, "ID is required"),
      title: z.string().min(1, "Title is required"),
      subtitle: z.string().optional(),
      isPublic: z.boolean().optional(),
      color: z.enum(THREAD_COLORS).optional()
    }),
    handler: async ({ id, title, subtitle, isPublic = false, color }, context) => {
      // Get userId from authenticated context for security
      const { userId } = context.locals.auth();
      
      if (!userId) {
        throw new Error("Authentication required");
      }
      try {
        // First get the current thread to compare values
        const currentThread = await db.select()
          .from(Threads)
          .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
          .limit(1)
          .get();
        
        if (!currentThread) {
          throw new Error("Thread not found or you don't have permission to modify it");
        }
        
        const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
        const normalizedSubtitle = subtitle || null;
        
        // Compare values to determine if only color changed
        const titleChanged = currentThread.title !== capitalizedTitle;
        const subtitleChanged = (currentThread.subtitle || null) !== normalizedSubtitle;
        const isPublicChanged = currentThread.isPublic !== isPublic;
        const onlyColorChanged = !titleChanged && !subtitleChanged && !isPublicChanged;
        
        // Build update object - always update color, conditionally update timestamp
        const updateData: any = {
          title: capitalizedTitle,
          subtitle: normalizedSubtitle,
          isPublic,
          color
        };
        
        // Only update timestamp if meaningful fields changed (not just color)
        if (!onlyColorChanged) {
          updateData.updatedAt = new Date();
        }
        
        const updatedThread = await db.update(Threads)
          .set(updateData)
          .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
          .returning()  

        return {
          success: "Thread updated successfully!",
          thread: updatedThread
        };
      } catch (error: any) {
        throw new Error(`Failed to update thread: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  delete: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1, "ID is required")
    }),
    handler: async ({ id }, context) => {
      // Get userId from authenticated context for security
      const { userId } = context.locals.auth();
      
      if (!userId) {
        throw new Error("Authentication required");
      }
      try {
        // Don't allow deleting the unorganized thread
        if (id === 'thread_unorganized') {
          throw new Error("Cannot delete the unorganized thread");
        }

        // Get thread before deletion to check creation time
        const existingThread = await db.select()
          .from(Threads)
          .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
          .get();

        if (!existingThread) {
          throw new Error("Thread not found or you don't have permission to delete it");
        }

        // Store creation time before deletion for XP revocation
        const threadCreatedAt = existingThread.createdAt;

        // Revoke XP if deleted within quick deletion window
        await revokeXPOnDeletion(userId, id, threadCreatedAt);
        
        // Revoke all XP for this thread (cleanup)
        await revokeAllXPForItem(userId, id);

        // Remove all NoteThreads relationships for this thread
        // Notes automatically become unorganized when junction entries are deleted
        const affectedNotes = await db.select({ noteId: NoteThreads.noteId })
          .from(NoteThreads)
          .where(eq(NoteThreads.threadId, id))
          .all();
        
        await db.delete(NoteThreads)
          .where(eq(NoteThreads.threadId, id));
        
        // Set all affected notes' primary threadId to unorganized (legacy field)
        if (affectedNotes.length > 0) {
          const noteIds = affectedNotes.map(n => n.noteId);
          // Update each note individually (Astro DB doesn't support IN clause directly)
          for (const noteId of noteIds) {
            await db.update(Notes)
              .set({ 
                threadId: 'thread_unorganized',
                updatedAt: new Date()
              })
              .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
          }
        }

        // Then delete the thread itself
        const deletedThread = await db.delete(Threads)
          .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
          .returning()
          .get();

        if (!deletedThread) {
          throw new Error("Thread not found or you don't have permission to delete it");
        }

        return {
          success: "Thread erased successfully! Notes have been moved to the Unorganized thread.",
          thread: deletedThread
        };
      } catch (error: any) {
        throw new Error(`Failed to erase thread: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  togglePin: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1, "ID is required")
    }),
    handler: async ({ id }, context) => {
      // Get userId from authenticated context for security
      const { userId } = context.locals.auth();
      
      if (!userId) {
        throw new Error("Authentication required");
      }
      try {
        console.log(`Toggling pin for thread ID: ${id}, userId: ${userId}`);
        
        // First get the current thread to check its isPinned status
        const thread = await db.select()
          .from(Threads)
          .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
          .limit(1)
          .get();
        
        if (!thread) {
          throw new Error("Thread not found or you don't have permission to modify it");
        }
        
        // Toggle the isPinned status
        const updatedThread = await db.update(Threads)
          .set({
            isPinned: !thread.isPinned,
            updatedAt: new Date()
          })
          .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
          .returning()
          .get();

        console.log(`Thread updated, isPinned: ${updatedThread.isPinned}`);
        
        return {
          success: `Thread ${updatedThread.isPinned ? 'pinned' : 'unpinned'} successfully!`,
          thread: updatedThread
        };
      } catch (error: any) {
        console.error(`Error toggling pin status:`, error);
        throw new Error(`Failed to toggle pin status: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  })
}; 