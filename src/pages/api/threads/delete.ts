import { db, Threads, eq, and, NoteThreads } from "astro:db";
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
      // First check if the thread exists and belongs to the user
      const thread = await db.select()
        .from(Threads)
        .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
        .limit(1);
        
      if (!thread.length) {
        return new Response(
          JSON.stringify({ error: "Thread not found or you don't have permission to delete it" }), 
          { 
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Delete related note-thread relationships first
      await db.delete(NoteThreads)
        .where(eq(NoteThreads.threadId, id));
        
      // Then delete the thread
      const deletedThread = await db.delete(Threads)
        .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
        .returning();
      
      if (!deletedThread.length) {
        return new Response(
          JSON.stringify({ error: "Failed to delete thread" }), 
          { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Add a small delay to ensure database operations complete
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify the deletion by trying to fetch the thread
      const verifyDelete = await db.select()
        .from(Threads)
        .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
        .limit(1);
        
      if (verifyDelete.length > 0) {
        console.warn("Verification failed - thread may not have been deleted properly");
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          message: "Thread deleted successfully!",
          thread: deletedThread[0]
        }), 
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (dbError) {
      console.error("Database error while deleting thread:", dbError);
      throw dbError;
    }
  } catch (error) {
    console.error("Error in delete thread API:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Failed to delete thread: ${error instanceof Error ? error.message : "Unknown error"}` 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 