import type { APIRoute } from 'astro';
import { db, Notes, Threads, Spaces, Tags, NoteTags, NoteThreads, ScriptureMetadata, eq, and, desc } from 'astro:db';
import { htmlToMarkdown, htmlToPlainText } from '@/utils/html-to-markdown';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get format from query parameter
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'markdown';

    console.log(`Exporting user data for user ${userId} in format: ${format}`);

    // Fetch all user notes
    const allNotes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      threadId: Notes.threadId,
      spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .orderBy(desc(Notes.createdAt));

    console.log(`Found ${allNotes.length} notes for export`);

    // Fetch all threads for this user
    const allThreads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt,
    })
    .from(Threads)
    .where(eq(Threads.userId, userId));

    // Fetch all spaces for this user
    const allSpaces = await db.select({
      id: Spaces.id,
      title: Spaces.title,
      color: Spaces.color,
      createdAt: Spaces.createdAt,
    })
    .from(Spaces)
    .where(eq(Spaces.userId, userId));

    // Create lookup maps
    const threadMap = new Map(allThreads.map(t => [t.id, t]));
    const spaceMap = new Map(allSpaces.map(s => [s.id, s]));

    // Fetch all note-thread relationships from junction table
    const allNoteThreads = await db.select({
      noteId: NoteThreads.noteId,
      threadId: NoteThreads.threadId,
    })
    .from(NoteThreads)
    .all();

    // Create map: noteId -> threadIds[]
    const noteThreadMap = new Map<string, string[]>();
    allNoteThreads.forEach(nt => {
      if (!noteThreadMap.has(nt.noteId)) {
        noteThreadMap.set(nt.noteId, []);
      }
      noteThreadMap.get(nt.noteId)!.push(nt.threadId);
    });

    // Fetch tags for all notes
    const noteTagsMap = new Map<string, Array<{ name: string; category?: string }>>();
    
    if (allNotes.length > 0) {
      // Fetch all tags for this user
      const allNoteTags = await db
        .select({
          noteId: NoteTags.noteId,
          tagName: Tags.name,
          tagCategory: Tags.category,
        })
        .from(NoteTags)
        .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
        .where(eq(Tags.userId, userId))
        .all();

      // Group by noteId
      allNoteTags.forEach(tag => {
        if (!noteTagsMap.has(tag.noteId)) {
          noteTagsMap.set(tag.noteId, []);
        }
        noteTagsMap.get(tag.noteId)!.push({
          name: tag.tagName,
          category: tag.tagCategory || undefined,
        });
      });
    }

    // Fetch scripture metadata for scripture notes
    const scriptureMap = new Map<string, any>();
    const scriptureNotes = allNotes.filter(n => n.noteType === 'scripture');
    if (scriptureNotes.length > 0) {
      const scriptureNoteIds = scriptureNotes.map(n => n.id);
      const scriptureMetadata = await db
        .select()
        .from(ScriptureMetadata)
        .where(eq(ScriptureMetadata.noteId, scriptureNoteIds[0])) // Simplified - would need proper IN query
        .all();

      // For now, we'll fetch them individually if needed (simplified approach)
      for (const noteId of scriptureNoteIds) {
        try {
          const meta = await db
            .select()
            .from(ScriptureMetadata)
            .where(eq(ScriptureMetadata.noteId, noteId))
            .get();
          if (meta) {
            scriptureMap.set(noteId, meta);
          }
        } catch (e) {
          // Skip if not found
        }
      }
    }

    // Generate export based on format
    let content = '';
    let contentType = 'text/plain';
    let fileExtension = 'txt';

    if (format === 'csv-threads') {
      // CSV format: Thread-based export
      const rows: string[][] = [];
      rows.push(['Thread Title', 'Thread Color', 'Note Title', 'Note Content', 'Created Date', 'Tags']);
      
      for (const note of allNotes) {
        // Get first thread from junction table, or fallback to legacy threadId
        const noteThreadIds = noteThreadMap.get(note.id) || [];
        const primaryThreadId = noteThreadIds[0] || note.threadId;
        const thread = threadMap.get(primaryThreadId);
        const tags = noteTagsMap.get(note.id) || [];
        const tagNames = tags.map(t => t.name).join(', ');
        
        const plainContent = htmlToPlainText(note.content || '');
        // Escape CSV special characters
        const escapeCSV = (str: string) => {
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        rows.push([
          escapeCSV(thread?.title || 'Unorganized'),
          escapeCSV(thread?.color || ''),
          escapeCSV(note.title || 'Untitled'),
          escapeCSV(plainContent),
          escapeCSV(note.createdAt.toISOString()),
          escapeCSV(tagNames),
        ]);
      }
      
      content = rows.map(row => row.join(',')).join('\n');
      contentType = 'text/csv';
      fileExtension = 'csv';
    } else if (format === 'markdown' || format === 'text') {
      // Markdown format
      const markdownLines: string[] = [];
      
      for (const note of allNotes) {
        // Get first thread from junction table, or fallback to legacy threadId
        const noteThreadIds = noteThreadMap.get(note.id) || [];
        const primaryThreadId = noteThreadIds[0] || note.threadId;
        const thread = threadMap.get(primaryThreadId);
        const tags = noteTagsMap.get(note.id) || [];
        const scripture = scriptureMap.get(note.id);

        // Note title
        if (note.title) {
          markdownLines.push(`# ${note.title}`);
          markdownLines.push('');
        }

        // Convert HTML content to Markdown
        const markdownContent = htmlToMarkdown(note.content || '');
        markdownLines.push(markdownContent);
        markdownLines.push('');

        // Metadata footer
        markdownLines.push(`---`);
        markdownLines.push(`**Created:** ${note.createdAt.toLocaleDateString()}`);
        if (note.updatedAt) {
          markdownLines.push(`**Updated:** ${note.updatedAt.toLocaleDateString()}`);
        }
        if (thread) {
          markdownLines.push(`**Thread:** ${thread.title}`);
          if (thread.color) {
            markdownLines.push(`**Thread Color:** ${thread.color}`);
          }
        }
        if (tags.length > 0) {
          markdownLines.push(`**Tags:** ${tags.map(t => t.name).join(', ')}`);
        }
        if (scripture) {
          markdownLines.push(`**Scripture Reference:** ${scripture.reference} (${scripture.translation})`);
        }
        markdownLines.push('---');
        markdownLines.push('');
        markdownLines.push('');
      }
      
      content = markdownLines.join('\n');
      contentType = 'text/markdown';
      fileExtension = 'md';
    } else {
      return new Response(JSON.stringify({ error: `Unsupported format: ${format}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `harvous-export-${timestamp}.${fileExtension}`;

    // Return file download
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      }
    });

  } catch (error: any) {
    console.error('Export error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to export data' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

