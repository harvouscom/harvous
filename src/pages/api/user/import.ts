import type { APIRoute } from 'astro';
import { db, Notes, Threads, UserMetadata, Tags, NoteTags, NoteThreads, ScriptureMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId, generateThreadId } from '@/utils/ids';
import { THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { ensureUnorganizedThread } from '@/utils/unorganized-thread';
import { parseCSV, type ParsedCSVNote } from '@/utils/csv-parser';
import { parseMarkdownExport, type ParsedMarkdownNote } from '@/utils/markdown-import-parser';
import { markdownToHtml } from '@/utils/markdown-to-html';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { htmlToPlainText } from '@/utils/html-to-markdown';

/**
 * Get a deterministic color for a thread based on its title
 * This ensures better color distribution and consistency
 * Excludes "paper" since it's the default/blank color
 */
function getThreadColorFromTitle(threadTitle: string): string {
  // Exclude "paper" from random selection (it's the default/blank color)
  const availableColors = THREAD_COLORS.filter(color => color !== 'paper');
  
  // Simple hash function for thread title
  let hash = 0;
  for (let i = 0; i < threadTitle.length; i++) {
    const char = threadTitle.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use absolute value and modulo to get color index
  const colorIndex = Math.abs(hash) % availableColors.length;
  return availableColors[colorIndex];
}

/**
 * Get or create a thread by title for a user
 * If threadColor is provided and valid, use it; otherwise use random color
 */
async function getOrCreateThread(userId: string, threadTitle: string, threadColor?: string | null): Promise<string> {
  if (!threadTitle || threadTitle.trim() === '' || threadTitle === 'Unorganized') {
    await ensureUnorganizedThread(userId);
    return 'thread_unorganized';
  }

  // Check if thread exists
  const existingThread = await db
    .select()
    .from(Threads)
    .where(and(
      eq(Threads.userId, userId),
      eq(Threads.title, threadTitle.trim())
    ))
    .get();

  if (existingThread) {
    return existingThread.id;
  }

  // Create new thread with provided color or default
  const capitalizedTitle = threadTitle.trim().charAt(0).toUpperCase() + threadTitle.trim().slice(1);
  
  // Validate and use provided color, or generate deterministic color from title
  let finalColor: string | null = null;
  if (threadColor && THREAD_COLORS.includes(threadColor as any)) {
    finalColor = threadColor;
  } else {
    // Use deterministic color based on thread title for better distribution
    finalColor = getThreadColorFromTitle(threadTitle.trim());
  }

  const newThread = await db.insert(Threads).values({
    id: generateThreadId(),
    title: capitalizedTitle,
    subtitle: null,
    spaceId: null,
    userId,
    isPublic: false,
    color: finalColor,
    isPinned: false,
    createdAt: new Date(),
  }).returning().get();

  return newThread.id;
}

/**
 * Get or create a tag by name for a user
 * Returns [tagId, wasCreated]
 */
async function getOrCreateTag(userId: string, tagName: string): Promise<[string, boolean]> {
  if (!tagName || tagName.trim() === '') {
    throw new Error('Tag name cannot be empty');
  }

  const trimmedName = tagName.trim();

  // Check if tag exists (case-insensitive)
  const allUserTags = await db
    .select()
    .from(Tags)
    .where(eq(Tags.userId, userId));

  const existingTag = allUserTags.find(t => 
    t.name.toLowerCase() === trimmedName.toLowerCase()
  );

  if (existingTag) {
    return [existingTag.id, false];
  }

  // Create new tag
  const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  await db.insert(Tags).values({
    id: tagId,
    name: trimmedName,
    color: null,
    category: null,
    userId,
    isSystem: false,
    createdAt: new Date(),
  });

  return [tagId, true];
}

/**
 * Check if a note is a duplicate (same title and content)
 */
async function isDuplicateNote(userId: string, title: string | null, content: string): Promise<boolean> {
  // Normalize content for comparison (strip HTML, normalize whitespace)
  const normalizedContent = htmlToPlainText(content)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  const normalizedTitle = (title || '').toLowerCase().trim();

  // Find notes with matching title and content
  const existingNotes = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
    })
    .from(Notes)
    .where(eq(Notes.userId, userId));

  for (const note of existingNotes) {
    const existingTitle = (note.title || '').toLowerCase().trim();
    const existingContent = htmlToPlainText(note.content || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

    if (existingTitle === normalizedTitle && existingContent === normalizedContent) {
      return true;
    }
  }

  return false;
}

/**
 * Parse date string from export format
 */
function parseExportDate(dateString: string | null): Date {
  if (!dateString) {
    return new Date();
  }

  // Try parsing ISO date
  const isoDate = new Date(dateString);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try parsing locale date string (e.g., "1/15/2024")
  const localeDate = new Date(dateString);
  if (!isNaN(localeDate.getTime())) {
    return localeDate;
  }

  // Fallback to current date
  return new Date();
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse form data
    const formData = await request.formData();
    const format = formData.get('format') as string;

    if (!format || (format !== 'markdown' && format !== 'csv-threads')) {
      return new Response(JSON.stringify({ error: 'Invalid format. Must be "markdown" or "csv-threads"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get files (support both single 'file' and multiple 'files')
    const files: File[] = [];
    const fileEntry = formData.get('file') as File;
    const filesEntry = formData.getAll('files') as File[];
    
    if (fileEntry) {
      files.push(fileEntry);
    } else if (filesEntry && filesEntry.length > 0) {
      files.push(...filesEntry);
    } else {
      return new Response(JSON.stringify({ error: 'At least one file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Helper function to extract folder path from file
    const getFolderPath = (file: File): string | null => {
      // Try webkitRelativePath first (when selecting from directory)
      const relativePath = (file as any).webkitRelativePath;
      if (relativePath) {
        const pathParts = relativePath.split('/');
        if (pathParts.length > 1) {
          // Remove filename, return folder path
          pathParts.pop();
          const folderPath = pathParts.join('/');
          console.log(`[Import] File: ${file.name}, webkitRelativePath: ${relativePath}, folderPath: ${folderPath}`);
          return folderPath;
        }
      }
      
      // Fallback: check if filename contains folder separators
      const fileName = file.name || '';
      if (fileName.includes('/')) {
        const pathParts = fileName.split('/');
        pathParts.pop(); // Remove filename
        const folderPath = pathParts.join('/');
        console.log(`[Import] File: ${file.name}, filename path detected, folderPath: ${folderPath}`);
        return folderPath;
      }
      
      console.log(`[Import] File: ${file.name}, no folder path detected`);
      return null;
    };

    // Helper function to get thread name from folder path
    const getThreadNameFromPath = (folderPath: string | null, defaultName: string | null): string | null => {
      if (folderPath) {
        // Use the last folder name as thread name
        const parts = folderPath.split('/').filter(p => p.trim());
        const threadName = parts.length > 0 ? parts[parts.length - 1] : null;
        console.log(`[Import] getThreadNameFromPath: folderPath="${folderPath}", parts=[${parts.join(', ')}], threadName="${threadName}"`);
        return threadName;
      }
      console.log(`[Import] getThreadNameFromPath: no folderPath, returning defaultName="${defaultName}"`);
      return defaultName;
    };

    // Parse all files and collect notes
    const allParsedNotes: Array<{ 
      note: ParsedCSVNote | ParsedMarkdownNote; 
      folderPath: string | null;
      fileName: string;
    }> = [];

    for (const file of files) {
      const fileContent = await file.text();
      const folderPath = getFolderPath(file);
      const fileName = file.name || '';

      // Parse based on format
      let parsedNotes: Array<ParsedCSVNote | ParsedMarkdownNote> = [];

      if (format === 'csv-threads') {
        parsedNotes = parseCSV(fileContent);
      } else if (format === 'markdown') {
        parsedNotes = parseMarkdownExport(fileContent);
      }

      // Add folder path and filename info to each note
      for (const note of parsedNotes) {
        allParsedNotes.push({ note, folderPath, fileName });
      }
    }

    if (allParsedNotes.length === 0) {
      return new Response(JSON.stringify({ error: 'No notes found in files' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure unorganized thread exists
    await ensureUnorganizedThread(userId);

    // Get or create user metadata
    let userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    if (!userMetadata) {
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

      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: highestExistingId,
        userColor: 'paper',
        createdAt: new Date()
      });

      userMetadata = {
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: highestExistingId,
        userColor: 'paper',
        email: null,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
        clerkDataUpdatedAt: null,
        createdAt: new Date(),
        updatedAt: null
      };
    }

    // Import statistics
    let notesImported = 0;
    let threadsCreated = 0;
    let tagsCreated = 0;
    let duplicatesSkipped = 0;
    const errors: string[] = [];
    const createdThreadIds = new Set<string>();

    // Process each note
    for (let i = 0; i < allParsedNotes.length; i++) {
      try {
        const { note: parsedNote, folderPath } = allParsedNotes[i];

        // Extract note data based on format
        let title: string | null = null;
        let content: string = '';
        let threadName: string | null = null;
        let threadColor: string | null = null;
        let tags: string[] = [];
        let createdDate: Date = new Date();
        let scriptureReference: string | null = null;
        let scriptureTranslation: string | null = null;

        if (format === 'csv-threads') {
          const csvNote = parsedNote as ParsedCSVNote;
          title = csvNote.noteTitle || null;
          content = csvNote.content;
          
          // For CSV: Check if thread title contains folder path (e.g., "folder1/thread1")
          // If it does, use the last part as thread name (the actual thread)
          // If folder path exists from file structure, use that instead
          let csvThreadName = csvNote.threadTitle || null;
          if (csvThreadName && csvThreadName.includes('/')) {
            // Thread title has folder structure, use last part
            const parts = csvThreadName.split('/').filter(p => p.trim());
            csvThreadName = parts.length > 0 ? parts[parts.length - 1] : null;
          }
          
          // Prefer folder path from file structure over CSV thread title
          threadName = folderPath ? getThreadNameFromPath(folderPath, csvThreadName) : csvThreadName;
          threadColor = csvNote.threadColor || null;
          tags = csvNote.tags || [];
          createdDate = parseExportDate(csvNote.createdDate);
        } else {
          const mdNote = parsedNote as ParsedMarkdownNote;
          title = mdNote.title || null;
          // Convert markdown content to HTML
          content = markdownToHtml(mdNote.content);
          
          // For Markdown: Use thread from metadata if present, otherwise put in Unorganized
          if (mdNote.threadName) {
            threadName = mdNote.threadName;
            // Use thread color from metadata if present and valid
            if (mdNote.threadColor && THREAD_COLORS.includes(mdNote.threadColor as any)) {
              threadColor = mdNote.threadColor;
            } else {
              threadColor = null;
            }
          } else {
            // No thread metadata - put in Unorganized
            threadName = null;
            threadColor = null;
          }
          
          tags = mdNote.tags || [];
          createdDate = parseExportDate(mdNote.createdDate);
          scriptureReference = mdNote.scriptureReference || null;
          scriptureTranslation = mdNote.scriptureTranslation || null;
        }

        // Capitalize content and title
        const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
        const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : null;

        // Check for duplicates
        if (await isDuplicateNote(userId, capitalizedTitle, capitalizedContent)) {
          duplicatesSkipped++;
          continue;
        }

        // Get or create thread (with color if provided)
        const threadId = await getOrCreateThread(userId, threadName || '', threadColor);
        if (!createdThreadIds.has(threadId) && threadId !== 'thread_unorganized') {
          createdThreadIds.add(threadId);
          threadsCreated++;
        }

        // Get next simple note ID
        const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;

        // Determine note type
        let noteType: 'default' | 'scripture' | 'resource' = 'default';
        if (scriptureReference) {
          noteType = 'scripture';
        }

        // Create note
        const newNote = await db.insert(Notes).values({
          id: generateNoteId(),
          content: capitalizedContent,
          title: capitalizedTitle,
          threadId: 'thread_unorganized', // Always start with unorganized
          spaceId: null,
          simpleNoteId: nextSimpleNoteId,
          noteType,
          userId,
          isPublic: false,
          createdAt: createdDate, // Preserve original date
        }).returning().get();

        // Update user metadata
        await db.update(UserMetadata)
          .set({
            highestSimpleNoteId: nextSimpleNoteId,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));

        userMetadata = {
          ...userMetadata!,
          highestSimpleNoteId: nextSimpleNoteId,
          updatedAt: new Date()
        };

        // Add note to thread via junction table (if not unorganized)
        if (threadId !== 'thread_unorganized') {
          await db.insert(NoteThreads).values({
            id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            noteId: newNote.id,
            threadId: threadId,
            createdAt: new Date()
          });

          // Update thread timestamp
          await db.update(Threads)
            .set({ updatedAt: new Date() })
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
        }

        // Create tags
        for (const tagName of tags) {
          try {
            const [tagId, wasCreated] = await getOrCreateTag(userId, tagName);
            
            if (wasCreated) {
              tagsCreated++;
            }

            // Create note-tag relationship
            const existingRelation = await db
              .select()
              .from(NoteTags)
              .where(and(eq(NoteTags.noteId, newNote.id), eq(NoteTags.tagId, tagId)))
              .get();

            if (!existingRelation) {
              await db.insert(NoteTags).values({
                id: `note-tag-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                noteId: newNote.id,
                tagId: tagId,
                isAutoGenerated: false,
                confidence: null,
                createdAt: new Date()
              });
            }
          } catch (tagError) {
            console.error(`Error creating tag "${tagName}":`, tagError);
            errors.push(`Failed to create tag "${tagName}" for note ${i + 1}`);
          }
        }

        // Create scripture metadata if present
        if (scriptureReference && noteType === 'scripture') {
          try {
            const parsed = parseScriptureReference(scriptureReference);
            if (parsed) {
              const verse = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
              const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

              await db.insert(ScriptureMetadata).values({
                id: `scripture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                noteId: newNote.id,
                reference: scriptureReference,
                book: parsed.book,
                chapter: parsed.chapter,
                verse: verse,
                verseEnd: verseEnd,
                translation: scriptureTranslation || 'NET',
                originalText: '', // Would need to fetch from API, but for import we'll leave empty
                createdAt: new Date()
              });
            }
          } catch (scriptureError) {
            console.error(`Error creating scripture metadata:`, scriptureError);
            errors.push(`Failed to create scripture metadata for note ${i + 1}`);
          }
        }

        notesImported++;
      } catch (noteError) {
        console.error(`Error importing note ${i + 1}:`, noteError);
        errors.push(`Failed to import note ${i + 1}: ${noteError instanceof Error ? noteError.message : 'Unknown error'}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      notesImported,
      threadsCreated,
      tagsCreated,
      duplicatesSkipped,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Failed to import data'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

