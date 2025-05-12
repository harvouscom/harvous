import { db, Threads, eq, and } from "astro:db";
import { z } from "zod";
import type { APIContext } from "astro";

export async function POST({ request }: APIContext) {
  try {
    const formData = await request.formData();
    
    // Log received data
    console.log("Received form data:", Object.fromEntries(formData));
    
    // Parse and validate input
    const schema = z.object({
      id: z.coerce.number().min(1, "ID is required"),
      userId: z.string().min(1, "User ID is required")
    });
    
    const validation = schema.safeParse(Object.fromEntries(formData));
    
    if (!validation.success) {
      console.error("Validation error:", validation.error);
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
    
    // First get the current thread to check its isPinned status
    const thread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
      .limit(1);
    
    if (!thread.length) {
      return new Response(
        JSON.stringify({ error: "Thread not found or you don't have permission to modify it" }), 
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const currentThread = thread[0];
    console.log("Current thread state:", currentThread);
    
    // Toggle the isPinned status
    const updatedThread = await db.update(Threads)
      .set({
        isPinned: !currentThread.isPinned,
        updatedAt: new Date()
      })
      .where(and(eq(Threads.id, id), eq(Threads.userId, userId)))
      .returning();
      
    if (!updatedThread.length) {
      return new Response(
        JSON.stringify({ error: "Failed to update thread" }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const responseData = {
      success: `Thread ${updatedThread[0].isPinned ? 'pinned' : 'unpinned'} successfully!`,
      thread: updatedThread[0]
    };
    
    console.log("Update successful:", responseData);
    
    return new Response(
      JSON.stringify(responseData), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error("Error in toggle-pin API:", error);
    return new Response(
      JSON.stringify({ 
        error: `Failed to toggle pin status: ${error instanceof Error ? error.message : "Unknown error"}` 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 