import { db, Notes, eq, and, NoteThreads } from "astro:db";
import { z } from "zod";
import type { APIContext } from "astro";

export async function POST({ request }: APIContext) {
  try {
    const formData = await request.formData();
    
    // Parse and validate input
    const schema = z.object({
      id: z.coerce.number().min(1, "ID is required"),
      userId: z.string().min(1, "User ID is required")
    });
    
    const validation = schema.safeParse(Object.fromEntries(formData));
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid input: ${validation.error.errors.map(e => e.message).join(', ')}` 
        }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { id, userId } = validation.data;
    
    try {
      // First check if the note exists and belongs to the user
      const note = await db.select()
        .from(Notes)
        .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
        .limit(1);
        
      if (!note.length) {
        return new Response(
          JSON.stringify({ error: "Note not found or you don't have permission to delete it" }), 
          { 
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Delete related note-thread relationships first
      await db.delete(NoteThreads)
        .where(eq(NoteThreads.noteId, id));
        
      // Then delete the note
      const deletedNote = await db.delete(Notes)
        .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
        .returning();
      
      if (!deletedNote.length) {
        return new Response(
          JSON.stringify({ error: "Failed to delete note" }), 
          { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Add a small delay to ensure database operations complete
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify the deletion by trying to fetch the note
      const verifyDelete = await db.select()
        .from(Notes)
        .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
        .limit(1);
        
      if (verifyDelete.length > 0) {
        console.warn("Verification failed - note may not have been deleted properly");
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "Note deleted successfully!",
          note: deletedNote[0]
        }), 
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (dbError) {
      console.error("Database error while deleting note:", dbError);
      throw dbError;
    }
  } catch (error) {
    console.error("Error in delete note API:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Failed to delete note: ${error instanceof Error ? error.message : "Unknown error"}` 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 