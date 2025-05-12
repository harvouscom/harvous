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
    handler: async ({ title, userId, isPublic = false, color }) => {
      try {
        const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
        
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

        return {
          success: "Thread created successfully!",
          thread: newThread
        };
      } catch (error: any) {
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
  })
}; 