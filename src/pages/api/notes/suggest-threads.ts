import type { APIRoute } from 'astro';
import { db, Notes, NoteThreads, Threads, eq, and, desc, inArray } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

// Simple text similarity scoring (word overlap)
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// Tokenize and extract keywords from text
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3) // Only words longer than 3 chars
    .filter(word => !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'].includes(word));
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { title, content } = body;

    if (!title && !content) {
      return new Response(JSON.stringify({ 
        error: 'Title or content is required',
        code: 'MISSING_CONTENT'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const noteText = `${title || ''} ${content || ''}`.trim();
    if (!noteText) {
      return new Response(JSON.stringify({ 
        error: 'Note text is required',
        code: 'EMPTY_CONTENT'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const suggestions: Array<{
      threadId: string;
      title: string;
      color: string | null;
      score: number;
      reason: string;
    }> = [];

    // Strategy 1: Recent Threads (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentThreadRelations = await db
      .select({
        threadId: NoteThreads.threadId,
        createdAt: NoteThreads.createdAt,
      })
      .from(NoteThreads)
      .innerJoin(Notes, eq(NoteThreads.noteId, Notes.id))
      .where(eq(Notes.userId, userId))
      .orderBy(desc(NoteThreads.createdAt))
      .limit(50);

    // Get unique recent thread IDs
    const recentThreadIds = [...new Set(recentThreadRelations.map(r => r.threadId))]
      .filter(id => id !== 'thread_unorganized')
      .slice(0, 10);

    if (recentThreadIds.length > 0) {
      const recentThreads = await db
        .select({
          id: Threads.id,
          title: Threads.title,
          color: Threads.color,
        })
        .from(Threads)
        .where(
          and(
            inArray(Threads.id, recentThreadIds),
            eq(Threads.userId, userId)
          )
        )
        .all();

      recentThreads.forEach((thread, index) => {
        // Score decreases with position (more recent = higher score)
        const score = 0.3 * (1 - index / recentThreads.length);
        suggestions.push({
          threadId: thread.id,
          title: thread.title,
          color: thread.color,
          score,
          reason: 'Recently used'
        });
      });
    }

    // Strategy 2: Keyword Matching (match note keywords against thread titles)
    const keywords = extractKeywords(noteText);
    
    if (keywords.length > 0) {
      // Get all user threads
      const allThreads = await db
        .select({
          id: Threads.id,
          title: Threads.title,
          color: Threads.color,
        })
        .from(Threads)
        .where(eq(Threads.userId, userId))
        .all();

      allThreads.forEach(thread => {
        if (thread.id === 'thread_unorganized') return;

        const threadKeywords = extractKeywords(thread.title);
        const matchingKeywords = keywords.filter(kw => 
          threadKeywords.some(tk => tk.includes(kw) || kw.includes(tk))
        );

        if (matchingKeywords.length > 0) {
          const score = 0.5 * (matchingKeywords.length / keywords.length);
          const existingIndex = suggestions.findIndex(s => s.threadId === thread.id);
          
          if (existingIndex >= 0) {
            // Update existing suggestion with higher score
            suggestions[existingIndex].score = Math.max(suggestions[existingIndex].score, score);
            suggestions[existingIndex].reason = 'Similar keywords';
          } else {
            suggestions.push({
              threadId: thread.id,
              title: thread.title,
              color: thread.color,
              score,
              reason: 'Similar keywords'
            });
          }
        }
      });
    }

    // Strategy 3: Similar Notes (find notes with similar content, get their threads)
    const allUserNotes = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
      })
      .from(Notes)
      .where(eq(Notes.userId, userId))
      .limit(100); // Limit for performance

    const similarNotes: Array<{ noteId: string; similarity: number }> = [];
    
    allUserNotes.forEach(note => {
      const noteText2 = `${note.title || ''} ${note.content || ''}`.trim();
      if (noteText2) {
        const similarity = calculateSimilarity(noteText, noteText2);
        if (similarity > 0.2) { // Threshold for similarity
          similarNotes.push({ noteId: note.id, similarity });
        }
      }
    });

    // Sort by similarity and get top matches
    similarNotes.sort((a, b) => b.similarity - a.similarity);
    const topSimilarNoteIds = similarNotes.slice(0, 10).map(n => n.noteId);

    if (topSimilarNoteIds.length > 0) {
      // Get threads for similar notes
      const similarNoteThreads = await db
        .select({
          threadId: NoteThreads.threadId,
          noteId: NoteThreads.noteId,
        })
        .from(NoteThreads)
        .where(inArray(NoteThreads.noteId, topSimilarNoteIds))
        .all();

      const threadSimilarityMap: Record<string, number> = {};
      similarNoteThreads.forEach(nt => {
        if (nt.threadId === 'thread_unorganized') return;
        
        const noteSimilarity = similarNotes.find(n => n.noteId === nt.noteId)?.similarity || 0;
        threadSimilarityMap[nt.threadId] = Math.max(
          threadSimilarityMap[nt.threadId] || 0,
          noteSimilarity
        );
      });

      const similarThreadIds = Object.keys(threadSimilarityMap);
      if (similarThreadIds.length > 0) {
        const threads = await db
          .select({
            id: Threads.id,
            title: Threads.title,
            color: Threads.color,
          })
          .from(Threads)
          .where(
            and(
              inArray(Threads.id, similarThreadIds),
              eq(Threads.userId, userId)
            )
          )
          .all();

        threads.forEach(thread => {
          const score = 0.7 * threadSimilarityMap[thread.id];
          const existingIndex = suggestions.findIndex(s => s.threadId === thread.id);
          
          if (existingIndex >= 0) {
            // Update existing suggestion with higher score
            suggestions[existingIndex].score = Math.max(suggestions[existingIndex].score, score);
            suggestions[existingIndex].reason = 'Similar to your notes';
          } else {
            suggestions.push({
              threadId: thread.id,
              title: thread.title,
              color: thread.color,
              score,
              reason: 'Similar to your notes'
            });
          }
        });
      }
    }

    // Deduplicate and sort by score
    const uniqueSuggestions = suggestions.reduce((acc, curr) => {
      const existing = acc.find(s => s.threadId === curr.threadId);
      if (!existing) {
        acc.push(curr);
      } else if (curr.score > existing.score) {
        // Replace with higher scoring suggestion
        const index = acc.indexOf(existing);
        acc[index] = curr;
      }
      return acc;
    }, [] as typeof suggestions);

    // Sort by score descending
    uniqueSuggestions.sort((a, b) => b.score - a.score);

    // Return top 5 suggestions
    const topSuggestions = uniqueSuggestions.slice(0, 5);

    return new Response(JSON.stringify({
      success: true,
      suggestedThreadIds: topSuggestions.map(s => s.threadId),
      suggestedThreads: topSuggestions.map(s => ({
        id: s.threadId,
        title: s.title,
        color: s.color,
        reason: s.reason
      })),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/suggest-threads',
      action: 'suggest_threads'
    });

    return new Response(JSON.stringify({
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
























