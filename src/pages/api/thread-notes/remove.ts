import { removeNoteFromThread } from '@/actions/api/threads';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, redirect }) => {
  try {
    const formData = await request.formData();
    
    // Get form data
    const noteIdStr = formData.get('noteId');
    const threadIdStr = formData.get('threadId');
    
    if (!noteIdStr || !threadIdStr) {
      throw new Error("Missing required parameters: noteId or threadId");
    }
    
    // Convert to numbers
    const noteId = parseInt(noteIdStr.toString());
    const threadId = parseInt(threadIdStr.toString());
    
    // Call our function directly
    const result = await removeNoteFromThread(noteId, threadId);
    
    // Redirect back to the note page
    return redirect(`/dashboard/notes/${noteId}`, 303);
  } catch (error) {
    console.error("Error in remove note from thread endpoint:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}; 