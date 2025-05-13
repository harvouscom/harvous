import { db, Notes, eq, and } from "astro:db";
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
    
    // Delete the note
    const deletedNote = await db.delete(Notes)
      .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
      .returning();
    
    if (!deletedNote.length) {
      return new Response(
        JSON.stringify({ error: "Note not found or you don't have permission to delete it" }), 
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
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