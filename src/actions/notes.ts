import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db, Notes, eq, and } from "astro:db";

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
        const newNote = await db.insert(Notes)
          .values({ 
            content, 
            title, 
            userId, 
            isPublic,
            createdAt: new Date() 
          })
          .returning()
          .get()

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
        const updatedNote = await db.update(Notes)
          .set({
            content,
            title,
            isPublic,
            updatedAt: new Date()
          })
          .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
          .returning()  

        return {
          success: "Note updated successfully!",
          note: updatedNote
        };
      } catch (error: any) {
        throw new Error(`Failed to update note: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  })
};
