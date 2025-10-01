import type { APIRoute } from 'astro';
import { db, Notes, Tags, NoteTags, eq, and, isNull, sql } from 'astro:db';
import { generateAutoTags, applyAutoTags } from '@/utils/auto-tag-generator';

export const POST: APIRoute = async ({ locals }) => {
  try {
    // Get authenticated user
    const { userId } = locals.auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Starting retroactive auto-tag process for user:', userId);

    // Find all notes that don't have any tags yet
    const notesWithoutTags = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        createdAt: Notes.createdAt
      })
      .from(Notes)
      .leftJoin(NoteTags, eq(Notes.id, NoteTags.noteId))
      .where(
        and(
          eq(Notes.userId, userId),
          isNull(NoteTags.noteId)
        )
      )
      .groupBy(Notes.id);

    console.log(`Found ${notesWithoutTags.length} notes without tags`);

    if (notesWithoutTags.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'All notes already have tags',
        processed: 0 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let processed = 0;
    let successful = 0;
    let errors = 0;
    const results = [];

    // Process each note
    for (const note of notesWithoutTags) {
      try {
        console.log(`Processing note ${processed + 1}/${notesWithoutTags.length}: ${note.id}`);
        
        // Generate auto-tags for this note
        const autoTagResult = await generateAutoTags(
          note.title || '',
          note.content || '',
          userId,
          0.8 // High confidence threshold
        );

        if (autoTagResult.suggestions.length > 0) {
          // Apply the auto-tags
          const applyResult = await applyAutoTags(
            note.id,
            autoTagResult.suggestions,
            userId
          );

          results.push({
            noteId: note.id,
            title: note.title?.substring(0, 50) + '...',
            suggestionsFound: autoTagResult.suggestions.length,
            tagsApplied: applyResult.applied,
            errors: applyResult.errors
          });

          successful++;
          console.log(`✅ Applied ${applyResult.applied} tags to note ${note.id}`);
        } else {
          console.log(`ℹ️ No auto-tag suggestions for note ${note.id}`);
          results.push({
            noteId: note.id,
            title: note.title?.substring(0, 50) + '...',
            suggestionsFound: 0,
            tagsApplied: 0,
            errors: []
          });
        }

        processed++;
      } catch (error) {
        console.error(`❌ Error processing note ${note.id}:`, error);
        errors++;
        results.push({
          noteId: note.id,
          title: note.title?.substring(0, 50) + '...',
          error: error instanceof Error ? error.message : String(error)
        });
        processed++;
      }
    }

    console.log(`Retroactive auto-tag process completed:`, {
      total: notesWithoutTags.length,
      processed,
      successful,
      errors
    });

    return new Response(JSON.stringify({ 
      success: true,
      message: `Processed ${processed} notes`,
      summary: {
        total: notesWithoutTags.length,
        processed,
        successful,
        errors
      },
      results
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Retroactive auto-tag process failed:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
