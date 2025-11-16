import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db, Notes, Threads, UserMetadata, eq, and, desc, isNotNull } from "astro:db";
import { generateNoteId } from "@/utils/ids";
import { awardNoteCreatedXP, revokeXPOnDeletion, revokeAllXPForItem } from "@/utils/xp-system";

export const notes = {
  create: defineAction({
    accept: "form",
    input: z.object({
      content: z.string().min(1, "Content is required"),
      title: z.string().optional(),
      threadId: z.string().optional(),
      spaceId: z.string().optional(),
      isPublic: z.boolean().optional()
    }),
    handler: async ({ content, title, threadId, spaceId, isPublic = false }, context) => {
      // Get userId from authenticated context for security
      const { userId } = context.locals.auth();
      console.log("Creating note with userId:", userId, "title:", title, "content:", content?.substring(0, 50));
      
      if (!userId) {
        throw new Error("Authentication required");
      }
      try {
        const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
        
        const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
        
        // Ensure we have a valid threadId - if it's unorganized, use the default
        let finalThreadId = threadId;
        if (!finalThreadId || finalThreadId === 'thread_unorganized') {
          // Create the unorganized thread if it doesn't exist
          try {
            await db.insert(Threads).values({
              id: "thread_unorganized",
              title: "Unorganized",
              subtitle: "Notes that haven't been organized into threads yet",
              spaceId: null,
              userId: userId,
              isPublic: true,
              isPinned: false,
              color: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }).returning().get();
            console.log("Created unorganized thread for user:", userId);
          } catch (createError: any) {
            if (createError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || createError.rawCode === 1555) {
              // Unorganized thread already exists
            } else {
              console.error("Error creating unorganized thread:", createError);
            }
          }
          finalThreadId = 'thread_unorganized';
        }
        
        // Get or create user metadata to track highest simpleNoteId used
        let userMetadata = await db.select()
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, userId))
          .get();
        
        if (!userMetadata) {
          // Check if user has existing notes to get the highest ID
          const existingNotes = await db.select({
            simpleNoteId: Notes.simpleNoteId
          })
          .from(Notes)
          .where(and(
            eq(Notes.userId, userId),
            isNotNull(Notes.simpleNoteId)
          ))
          .orderBy(desc(Notes.simpleNoteId))
          .limit(1);
          
          const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
          
          // Create user metadata record with the highest existing ID
          await db.insert(UserMetadata).values({
            id: `user_metadata_${userId}`,
            userId: userId,
            highestSimpleNoteId: highestExistingId,
            createdAt: new Date()
          });
          userMetadata = { 
            id: `user_metadata_${userId}`,
            userId: userId,
            highestSimpleNoteId: highestExistingId,
            createdAt: new Date(),
            updatedAt: null
          };
        }
        
        // The next simple note ID is always the highest used + 1
        // This ensures we never reuse deleted IDs
        const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
        
        const newNote = await db.insert(Notes)
          .values({ 
            id: generateNoteId(),
            content: capitalizedContent, 
            title: capitalizedTitle, 
            threadId: finalThreadId,
            spaceId: spaceId || null,
            simpleNoteId: nextSimpleNoteId,
            userId, 
            isPublic,
            createdAt: new Date() 
          })
          .returning()
          .get()
          
        console.log("Note created successfully:", newNote);

        // Update user metadata to track the new highest simpleNoteId
        await db.update(UserMetadata)
          .set({ 
            highestSimpleNoteId: nextSimpleNoteId,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));

        // Update the thread's updatedAt timestamp
        await db.update(Threads)
          .set({ updatedAt: new Date() })
          .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, userId)));

        // Award XP for note creation (check if scripture note by checking noteType)
        // Note: This action doesn't currently support noteType, so assume false
        const isScriptureNote = false;
        await awardNoteCreatedXP(userId, newNote.id, isScriptureNote, capitalizedContent);

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

        return {
          success: "Note created successfully!",
          note: newNote
        };
      } catch (error: any) {
        if (error.validation && error.validation.includes("content")) {
          throw new Error("The note was empty");
        }

        throw new Error(`Failed to submit: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  }),
  update: defineAction({
    accept: "form",
    input: z.object({
      id: z.string().min(1, "ID is required"),
      content: z.string().min(1, "Content is required"),
      title: z.string().optional(),
      threadId: z.string().optional(),
      spaceId: z.string().optional(),
      isPublic: z.boolean().optional()
    }),
    handler: async ({ id, content, title, threadId, spaceId, isPublic = false }, context) => {
      // Get userId from authenticated context for security
      const { userId } = context.locals.auth();
      
      if (!userId) {
        throw new Error("Authentication required");
      }
      try {
        const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
        
        const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
        
        // Ensure we have a valid threadId for updates too
        let finalThreadId = threadId;
        if (!finalThreadId || finalThreadId === 'thread_unorganized') {
          // Check if unorganized thread exists, create it if it doesn't
          const existingUnorganizedThread = await db.select()
            .from(Threads)
            .where(and(eq(Threads.id, 'thread_unorganized'), eq(Threads.userId, userId)))
            .get();
            
          if (!existingUnorganizedThread) {
            // Create the unorganized thread
            await db.insert(Threads)
              .values({
                id: 'thread_unorganized',
                title: 'Unorganized',
                subtitle: 'Notes that haven\'t been organized into threads yet',
                spaceId: null,
                userId,
                isPublic: false,
                color: null,
                isPinned: false,
                createdAt: new Date()
              });
          }
          finalThreadId = 'thread_unorganized';
        }
        
        const updatedNote = await db.update(Notes)
          .set({
            content: capitalizedContent,
            title: capitalizedTitle,
            threadId: finalThreadId,
            spaceId: spaceId || null,
            isPublic,
            updatedAt: new Date()
          })
          .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
          .returning()  

        // Update the thread's updatedAt timestamp
        await db.update(Threads)
          .set({ updatedAt: new Date() })
          .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, userId)));

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
      id: z.string().min(1, "ID is required")
    }),
    handler: async ({ id }, context) => {
      // Get userId from authenticated context for security
      const { userId } = context.locals.auth();
      
      if (!userId) {
        throw new Error("Authentication required");
      }
      try {
        // Get note before deletion to check creation time
        const existingNote = await db.select()
          .from(Notes)
          .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
          .get();

        if (!existingNote) {
          throw new Error("Note not found or you don't have permission to delete it");
        }

        // Revoke XP if deleted within quick deletion window
        await revokeXPOnDeletion(userId, id, existingNote.createdAt);
        
        // Revoke all XP for this note (cleanup)
        await revokeAllXPForItem(userId, id);

        const deletedNote = await db.delete(Notes)
          .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
          .returning()
          .get();

        if (!deletedNote) {
          throw new Error("Note not found or you don't have permission to delete it");
        }

        return {
          success: "Note erased successfully!",
          note: deletedNote
        };
      } catch (error: any) {
        throw new Error(`Failed to erase note: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
  })
};
