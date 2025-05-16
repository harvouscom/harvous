import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db, Notes, eq, and } from "astro:db";
import { purgeCache } from "@netlify/functions";

const purgeCacheWrapper = async (tags: string[]) => {
  try {
    if (!tags || !Array.isArray(tags)) {
      return new Response("Missing or invalid tags", { status: 400 });
    }

    await purgeCache({ tags });
  } catch (e) {
    console.warn("Cache purge failed", e);
  }
};

export const notes = {
  create: defineAction({
    accept: "form",
    input: z.object({
      content: z.string().min(1, "Content is required"),
      title: z.string().optional(),
      userId: z.string().min(1, "User ID is required"),
      isPublic: z.boolean().optional()
    }),
    handler: async ({ content, title, userId, isPublic = false }) => {
      try {
        const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
        
        const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
        
        const newNote = await db.insert(Notes)
          .values({ 
            content: capitalizedContent, 
            title: capitalizedTitle, 
            userId, 
            isPublic,
            createdAt: new Date() 
          })
          .returning()
          .get()

        // Add a small delay to ensure the database operation completes
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Verify the new note was created
        const verifyNote = await db.select()
          .from(Notes)
          .where(and(eq(Notes.id, newNote.id), eq(Notes.userId, userId)))
          .limit(1);
          
        if (!verifyNote.length) {
          console.warn("Note creation verification failed");
        }

        await purgeCacheWrapper([`notes-user-${userId}-note-${newNote.id}`]);
        await purgeCacheWrapper([`notes-user-${userId}-feed`]);

        return {
          success: "Note created successfully!",
          note: newNote
        };
      } catch (error: any) {
        if (error.validation && error.validation.includes("content")) {
          throw new Error("The note was empty");
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
      content: z.string().min(1, "Content is required"),
      title: z.string().optional(),
      userId: z.string().min(1, "User ID is required"),
      isPublic: z.boolean().optional()
    }),
    handler: async ({ id, content, title, userId, isPublic = false }) => {
      try {
        const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
        
        const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
        
        const updatedNote = await db.update(Notes)
          .set({
            content: capitalizedContent,
            title: capitalizedTitle,
            isPublic,
            updatedAt: new Date()
          })
          .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
          .returning()

        await purgeCacheWrapper([`notes-user-${userId}-note-${id}`]);
        await purgeCacheWrapper([`notes-user-${userId}-feed`]);

        return {
          success: "Note updated successfully!",
          note: updatedNote
        };
      } catch (error: any) {
        throw new Error(`Failed to update note: ${error instanceof Error ? error.message : "Unknown error"}`);
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
        const deletedNote = await db.delete(Notes)
          .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
          .returning()
          .get();

        if (!deletedNote) {
          throw new Error("Note not found or you don't have permission to delete it");
        }

        await purgeCacheWrapper([`notes-user-${userId}-note-${id}`]);
        await purgeCacheWrapper([`notes-user-${userId}-feed`]);

        return {
          success: "Note deleted successfully!",
          note: deletedNote
        };
      } catch (error: any) {
        throw new Error(`Failed to delete note: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  })
};
