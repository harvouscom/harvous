import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db, Threads, eq, and } from "astro:db";

export const threads = {
  create: defineAction({
    accept: "form",
    input: z.object({
      title: z.string().min(1, "Title is required"),
      userId: z.string().min(1, "User ID is required"),
      isPublic: z.boolean().optional(),
      color: z.string().optional()
    }),
    handler: async ({ title, userId, isPublic = false, color = "blessed-blue" }) => {
      try {
        console.log(`Creating thread with title: ${title}, userId: ${userId}, isPublic: ${isPublic}, color: ${color}`);
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
            title: capitalizedTitle, 
            userId, 
            isPublic,
            color,
            createdAt: new Date() 
          })
          .returning()
          .get()

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
        } else if (error.validation && error.validation.includes("userId")) {
          throw new Error("User ID is required");
        }

        throw new Error(`Failed to submit: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  update: defineAction({
    accept: "form",
    input: z.object({
      id: z.number().min(1, "ID is required"),
      title: z.string().min(1, "Title is required"),
      userId: z.string().min(1, "User ID is required"),
      isPublic: z.boolean().optional(),
      color: z.string().optional()
    }),
    handler: async ({ id, title, userId, isPublic = false, color }) => {
      try {
        const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
        
        const updatedThread = await db.update(Threads)
          .set({
            title: capitalizedTitle,
            isPublic,
            color,
            updatedAt: new Date()
          })
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
      id: z.number().min(1, "ID is required"),
      userId: z.string().min(1, "User ID is required")
    }),
    handler: async ({ id, userId }) => {
      try {
        const deletedThread = await db.delete(Threads)
          .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
          .returning()
          .get();

        if (!deletedThread) {
          throw new Error("Thread not found or you don't have permission to delete it");
        }

        return {
          success: "Thread deleted successfully!",
          thread: deletedThread
        };
      } catch (error: any) {
        throw new Error(`Failed to delete thread: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  togglePin: defineAction({
    accept: "form",
    input: z.object({
      id: z.coerce.number().min(1, "ID is required"),
      userId: z.string().min(1, "User ID is required")
    }),
    handler: async ({ id, userId }) => {
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