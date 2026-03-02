/**
 * Notes routes — Hono port of src/pages/api/notes/*.ts
 *
 * Endpoints:
 *   POST /api/notes/create
 *   PUT  /api/notes/update
 *   DELETE /api/notes/delete
 *   GET  /api/notes/next-id
 *   GET  /api/notes/recent
 *   POST /api/notes/auto-tags
 *   POST /api/notes/cleanup-upgrade-note
 *   DELETE /api/notes/delete-all-unorganized
 *   POST /api/notes/suggest-threads
 *   GET  /api/notes/:id/details
 *   POST /api/notes/:id/update-content
 *   POST /api/notes/:id/add-thread
 *   POST /api/notes/:id/remove-thread
 *   POST /api/notes/:id/process-scripture-references
 *   GET  /api/notes/:noteId/share
 *   POST /api/notes/:noteId/share
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import {
  db, Notes, Threads, NoteThreads, Comments, Tags, NoteTags,
  UserMetadata, ScriptureMetadata, NoteScriptureReferences, ResourceMetadata,
  eq, and, or, ne, desc, asc, count, like, not, isNull, isNotNull, inArray, sql,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId, generateShareToken } from '@/utils/ids';
import { handleAPIError } from '@/utils/error-handling';
import { validateContent, validateNoteType, validateThreadId, validateSpaceId, normalizeUrl, extractDomain, validateResourceUrl } from '@/utils/validation';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { debug } from '@/utils/logger';
import { stripNoteLinksToNoteId } from '@/utils/tiptap-helpers';
import { getCurrentSeason } from '@/utils/season-helpers';
import { getThreadGradientCSS } from '@/utils/colors';
import { awardCreationBonusXP, revokeXPOnDeletion, revokeAllXPForItem } from '../utils/xp-system';
import { generateAutoTags, applyAutoTags, removeAutoTags, regenerateAutoTags } from '../utils/auto-tag-generator';
import { processScriptureReferences } from '../utils/process-scripture-references';
import { canCreateNote } from '../utils/subscription';
import { getNextUntitledNoteName } from '../utils/untitled-naming';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { moveScriptureNotesToThread } from '../utils/move-scripture-notes-to-thread';
import { removeScriptureNotesFromThread } from '../utils/remove-scripture-notes-from-thread';
import { requireSpaceAccess } from '../utils/space-permissions';
import { extractArticleContent } from '@/utils/content-extractor';
import { sortByLastVisited } from '@/utils/sorting';
import { stripHtml } from '@/utils/html-stripper';

const route = new Hono();

// ─── Title helpers ────────────────────────────────────────────────────────────
const TITLE_HARD_LIMIT = 50;
const truncateAndCapitalizeTitle = (title: string): string => {
  const truncated = title.slice(0, TITLE_HARD_LIMIT);
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
};

// ─── POST /api/notes/create ──────────────────────────────────────────────────
route.post('/api/notes/create', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    // Check note limit
    const noteLimitCheck = await canCreateNote(auth.userId, auth);
    if (!noteLimitCheck.allowed) {
      return c.json({
        error: noteLimitCheck.reason || "You've used all your notes. Upgrade for unlimited.",
        code: 'NOTE_LIMIT_EXCEEDED',
        currentCount: noteLimitCheck.currentCount,
        limit: noteLimitCheck.limit,
        upgradeUrl: noteLimitCheck.upgradeUrl,
      }, 403);
    }

    // Rate limiting
    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, '/api/notes/create', 'write', ip);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error || 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' }, 429);
    }

    // Parse body: support both JSON (serverless-friendly) and FormData
    const contentType = c.req.raw.headers.get('content-type') ?? '';
    let content: string;
    let title: string;
    let threadId: string;
    let noteType: string;
    let scriptureReference: string | null;
    let scriptureVersion: string | null;
    let resourceUrl: string | null;
    let resourceMetadataStr: string | null;
    let spaceId: string | null;
    let contentEncrypted: boolean;

    if (contentType.includes('application/json')) {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      content = (body.content as string) ?? '';
      title = (body.title as string) ?? '';
      threadId = (body.threadId as string) ?? '';
      noteType = (body.noteType as string) ?? 'default';
      scriptureReference = (body.scriptureReference as string) ?? null;
      scriptureVersion = (body.scriptureVersion as string) ?? null;
      resourceUrl = (body.resourceUrl as string) ?? null;
      const meta = body.resourceMetadata;
      resourceMetadataStr = typeof meta === 'string' ? meta : (meta != null ? JSON.stringify(meta) : null);
      spaceId = (body.spaceId as string) ?? null;
      contentEncrypted = body.contentEncrypted === true || body.contentEncrypted === 'true';
    } else {
      const formData = await c.req.formData();
      content = formData.get('content') as string;
      title = formData.get('title') as string;
      threadId = formData.get('threadId') as string;
      noteType = formData.get('noteType') as string;
      scriptureReference = formData.get('scriptureReference') as string | null;
      scriptureVersion = formData.get('scriptureVersion') as string | null;
      resourceUrl = formData.get('resourceUrl') as string | null;
      resourceMetadataStr = formData.get('resourceMetadata') as string | null;
      spaceId = formData.get('spaceId') as string | null;
      contentEncrypted = formData.get('contentEncrypted') === 'true';
    }

    let prefetchedResourceMetadata: { title?: string; description?: string; image?: string; articleContent?: string; siteName?: string } | null = null;
    if (resourceMetadataStr) {
      try { prefetchedResourceMetadata = JSON.parse(resourceMetadataStr); } catch {}
    }

    // Validate
    const noteTypeValidation = validateNoteType(noteType);
    if (!noteTypeValidation.isValid) return c.json({ error: noteTypeValidation.error, code: noteTypeValidation.code }, 400);
    const finalNoteType = noteType && noteTypeValidation.isValid ? noteType : 'default';

    const contentRequired = finalNoteType !== 'resource';
    const contentValidation = validateContent(content, contentRequired);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);

    const threadIdValidation = validateThreadId(threadId);
    if (!threadIdValidation.isValid) return c.json({ error: threadIdValidation.error, code: threadIdValidation.code }, 400);

    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) return c.json({ error: spaceIdValidation.error, code: spaceIdValidation.code }, 400);

    let validatedResourceUrl: string | null = null;
    let isPDF = false;
    if (finalNoteType === 'resource') {
      if (!resourceUrl || !resourceUrl.trim()) return c.json({ error: 'Resource URL is required', code: 'URL_REQUIRED' }, 400);
      const urlValidation = validateResourceUrl(resourceUrl);
      if (!urlValidation.isValid) return c.json({ error: urlValidation.error, code: urlValidation.code || 'INVALID_URL' }, 400);
      validatedResourceUrl = urlValidation.normalizedUrl!;
      isPDF = urlValidation.isPDF || false;
    }

    const capitalizedContent = content && content.length > 0
      ? content.charAt(0).toUpperCase() + content.slice(1)
      : content || '';

    let capitalizedTitle: string;
    if (!title || !title.trim()) {
      capitalizedTitle = await getNextUntitledNoteName(auth.userId);
    } else {
      capitalizedTitle = truncateAndCapitalizeTitle(title);
    }

    await ensureUnorganizedThread(auth.userId);
    const finalThreadId = 'thread_unorganized';

    // Get or create user metadata for simpleNoteId
    let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId })
        .from(Notes)
        .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId))
        .limit(1);
      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`,
        userId: auth.userId,
        highestSimpleNoteId: highestExistingId,
        userColor: 'paper',
        currentSeason: season,
        createdAt: nowISO(),
      });
      userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    }

    const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') finalSpaceId = spaceId;

    const now = nowISO();
    const isScriptureNote = finalNoteType === 'scripture';
    const shouldAutoShare = isScriptureNote && !contentEncrypted;
    const shareToken = shouldAutoShare ? generateShareToken() : null;

    const newNote = await db.insert(Notes).values({
      id: generateNoteId(),
      content: capitalizedContent,
      title: capitalizedTitle,
      threadId: finalThreadId,
      spaceId: finalSpaceId,
      simpleNoteId: nextSimpleNoteId,
      noteType: finalNoteType,
      userId: auth.userId,
      isPublic: shouldAutoShare,
      shareToken,
      shareTokenCreatedAt: shouldAutoShare ? now : null,
      contentEncrypted,
      createdAt: now,
      lastVisited: now,
    }).returning().get();

    await db.update(UserMetadata)
      .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() })
      .where(eq(UserMetadata.userId, auth.userId));

    let noteStaysInUnorganized = true;

    if (threadId && threadId.trim() !== '' && threadId !== 'thread_unorganized' && !threadId.startsWith('thread_onboarding_')) {
      try {
        const targetThread = await db.select().from(Threads)
          .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
        if (targetThread) {
          const junctionId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(NoteThreads).values({ id: junctionId, noteId: newNote.id, threadId, createdAt: nowISO() });
          await db.update(Notes).set({ threadId }).where(eq(Notes.id, newNote.id));
          await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
          noteStaysInUnorganized = false;
        }
      } catch (error) {
        console.error('[api/notes/create] Error adding note to specific thread:', error);
      }
    }

    if (noteStaysInUnorganized) {
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, auth.userId)));
    }

    // Non-critical: XP
    try { await awardCreationBonusXP(auth.userId, 'note'); } catch {}

    // Reload note
    const finalNote = await db.select().from(Notes).where(eq(Notes.id, newNote.id)).get();
    if (finalNote) Object.assign(newNote, finalNote);

    // Auto-tag (fire-and-forget)
    if (finalNoteType !== 'resource' && !contentEncrypted) {
      (async () => {
        try {
          const r = await generateAutoTags(capitalizedTitle || '', capitalizedContent, auth.userId!, 0.8);
          if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId!);
        } catch {}
      })().catch(() => {});
    }

    // Scripture metadata
    if (finalNoteType === 'scripture' && scriptureReference) {
      try {
        const normalizedReference = normalizeScriptureReference(scriptureReference);
        const parsed = parseScriptureReference(normalizedReference);
        if (parsed) {
          const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
          const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;
          await db.insert(ScriptureMetadata).values({
            id: `scripture_${newNote.id}_${Date.now()}`,
            noteId: newNote.id,
            reference: normalizedReference,
            book: parsed.book,
            chapter: parsed.chapter,
            verse: verseStart,
            verseEnd: verseEnd || null,
            translation: scriptureVersion || 'NET',
            originalText: capitalizedContent,
            createdAt: nowISO(),
          });
        }
      } catch (error) {
        console.error('Error creating ScriptureMetadata (non-critical):', error);
      }
    }

    // Resource metadata
    if (finalNoteType === 'resource' && validatedResourceUrl) {
      try {
        let resourceMetadata: any = { ...prefetchedResourceMetadata };
        if (!isPDF) {
          try {
            const htmlResponse = await fetch(validatedResourceUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://harvous.com)', Accept: 'text/html,application/xhtml+xml' },
              signal: AbortSignal.timeout(15000),
            });
            if (htmlResponse.ok) {
              const html = await htmlResponse.text();
              const articleContent = await extractArticleContent(html, validatedResourceUrl);
              if (articleContent) resourceMetadata = { ...resourceMetadata, articleContent };
            }
          } catch {}
        }
        await db.insert(ResourceMetadata).values({
          id: `resource_${newNote.id}_${Date.now()}`,
          noteId: newNote.id,
          sourceUrl: validatedResourceUrl,
          sourceDomain: extractDomain(validatedResourceUrl),
          sourceName: resourceMetadata?.siteName || null,
          sourceTitle: resourceMetadata?.title || null,
          sourceDescription: resourceMetadata?.description || null,
          sourceImage: resourceMetadata?.image || null,
          createdAt: nowISO(),
        });
        if (resourceMetadata) {
          const updateData: any = { updatedAt: nowISO() };
          if (resourceMetadata.title) updateData.title = truncateAndCapitalizeTitle(resourceMetadata.title);
          if (resourceMetadata.articleContent) updateData.content = resourceMetadata.articleContent;
          else if (resourceMetadata.description) updateData.content = resourceMetadata.description;
          if (updateData.title || updateData.content) {
            await db.update(Notes).set(updateData).where(eq(Notes.id, newNote.id));
            const updatedNote = await db.select().from(Notes).where(eq(Notes.id, newNote.id)).get();
            if (updatedNote) {
              Object.assign(newNote, updatedNote);
              if (updateData.title) capitalizedTitle = updateData.title;
            }
          }
          // Auto-tag resource notes
          try {
            const contentForTagging = updateData.content || newNote.content || '';
            const titleForTagging = updateData.title || capitalizedTitle || '';
            const r = await generateAutoTags(titleForTagging, contentForTagging, auth.userId, 0.8);
            if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId);
          } catch {}
        }
      } catch (error) {
        console.error('Error creating ResourceMetadata (non-critical):', error);
      }
    }

    // Defer scripture processing so create responds in ~1–2s; run in background and update note content when done
    const actualThreadId = threadId && threadId !== 'thread_unorganized' ? threadId : 'thread_unorganized';
    const latestNote = finalNoteType === 'resource'
      ? await db.select().from(Notes).where(eq(Notes.id, newNote.id)).get()
      : null;
    const contentToProcess = latestNote?.content || newNote.content;

    if (!contentEncrypted) {
      processScriptureReferences(newNote.id, auth.userId!, actualThreadId, contentToProcess).catch((err: any) => {
        console.error('[api/notes/create] Deferred scripture processing failed:', err?.message ?? err);
      });
    }

    return c.json({
      success: 'Note created!',
      note: newNote,
      scriptureResults: [],
      scriptureProcessingError: false,
      scriptureDeferred: true
    });
  } catch (error: any) {
    console.error('[api/notes/create] Error:', error);
    return c.json({ error: error.message || 'Failed to create note' }, 500);
  }
});

// ─── PUT /api/notes/update ──────────────────────────────────────────────────
route.put('/api/notes/update', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, '/api/notes/update', 'write', ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: 'RATE_LIMIT_EXCEEDED' }, 429);

    const body = await c.req.json();
    const { noteId, title, content, resourceImage, contentEncrypted } = body;
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const contentValidation = validateContent(content, true);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);

    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: 'Note not found' }, 404);

    const isEncrypted = contentEncrypted === true;
    const capitalizedContent = isEncrypted ? content : (content.charAt(0).toUpperCase() + content.slice(1));
    const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;

    const updateData: any = { title: capitalizedTitle, content: capitalizedContent, updatedAt: nowISO() };
    if (typeof contentEncrypted === 'boolean') {
      updateData.contentEncrypted = contentEncrypted;
      if (contentEncrypted === true) {
        updateData.isPublic = false;
        updateData.shareToken = null;
        updateData.shareTokenCreatedAt = null;
      }
    }

    const updatedNote = await db.update(Notes).set(updateData)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).returning().get();
    if (!updatedNote) return c.json({ error: 'Failed to update note' }, 500);

    // Update thread timestamps
    const noteThreads = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, noteId)).all();
    for (const nt of noteThreads) {
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, nt.threadId), eq(Threads.userId, auth.userId)));
    }

    // Re-tag (fire-and-forget)
    if (!isEncrypted) {
      (async () => {
        try {
          await removeAutoTags(noteId);
          const r = await generateAutoTags(capitalizedTitle || '', capitalizedContent, auth.userId!, 0.8);
          if (r.suggestions.length > 0) await applyAutoTags(noteId, r.suggestions, auth.userId!);
        } catch {}
      })().catch(() => {});
    }

    // Update resource image
    if (existingNote.noteType === 'resource' && resourceImage !== undefined) {
      try {
        const rm = await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).get();
        if (rm) await db.update(ResourceMetadata).set({ sourceImage: resourceImage || null }).where(eq(ResourceMetadata.noteId, noteId));
      } catch {}
    }

    // Process scripture references (awaited)
    let scriptureResults: any[] = [];
    let processedContent: string | null = null;
    let scriptureProcessingError = false;
    if (!isEncrypted) {
      try {
        let actualThreadId = 'thread_unorganized';
        const threadRelation = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, noteId)).limit(1).get();
        if (threadRelation) actualThreadId = threadRelation.threadId;
        const scriptureResult = await processScriptureReferences(noteId, auth.userId, actualThreadId, capitalizedContent);
        scriptureResults = scriptureResult.results || [];
        processedContent = scriptureResult.updatedContent || null;
      } catch (error: any) {
        scriptureProcessingError = true;
        console.error('[api/notes/update] Scripture processing failed:', error?.message);
      }
    }

    return c.json({ success: 'Note updated!', note: updatedNote, scriptureResults, processedContent, scriptureProcessingError });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update note' }, 500);
  }
});

// ─── DELETE /api/notes/delete ────────────────────────────────────────────────
route.delete('/api/notes/delete', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, '/api/notes/delete', 'write', ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: 'RATE_LIMIT_EXCEEDED' }, 429);

    const noteId = c.req.query('noteId');
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: 'Note not found or access denied' }, 404);

    const threadId = existingNote.threadId;
    const noteCreatedAt = existingNote.createdAt;

    await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));

    // Strip note links (non-critical)
    try {
      const notesWithLinks = await db.select({ id: Notes.id, content: Notes.content }).from(Notes)
        .where(and(eq(Notes.userId, auth.userId), not(eq(Notes.contentEncrypted, true)), like(Notes.content, '%data-note-id=%'))).all();
      for (const note of notesWithLinks) {
        if (!note.content?.includes('data-note-id')) continue;
        const stripped = stripNoteLinksToNoteId(note.content, noteId);
        if (stripped !== note.content) {
          await db.update(Notes).set({ content: stripped, updatedAt: nowISO() }).where(and(eq(Notes.id, note.id), eq(Notes.userId, auth.userId)));
        }
      }
    } catch {}

    // Revoke XP (fire-and-forget)
    (async () => {
      try {
        await revokeXPOnDeletion(auth.userId!, noteId, new Date(noteCreatedAt as string));
        await revokeAllXPForItem(auth.userId!, noteId);
      } catch {}
    })().catch(() => {});

    return c.json({ success: 'Note erased!', noteId, threadId });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/delete', action: 'delete_note' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/next-id ──────────────────────────────────────────────────
route.get('/api/notes/next-id', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    let userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (!userMetadata) {
      const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes)
        .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
        .orderBy(desc(Notes.simpleNoteId)).limit(1);
      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      const season = getCurrentSeason();
      await db.insert(UserMetadata).values({
        id: `user_metadata_${auth.userId}`, userId: auth.userId, highestSimpleNoteId: highestExistingId,
        currentSeason: season, createdAt: nowISO(),
      });
      userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    }
    const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    const formattedId = `N${nextSimpleNoteId.toString().padStart(3, '0')}`;
    return c.json({ nextNoteId: nextSimpleNoteId, formattedId });
  } catch (error: any) {
    console.error('Error getting next note ID:', error);
    return c.json({ error: error.message || 'Failed to get next note ID' }, 500);
  }
});

// ─── GET /api/notes/recent ──────────────────────────────────────────────────
route.get('/api/notes/recent', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Unauthorized' }, 401);

    const limitParam = c.req.query('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const maxLimit = Math.max(1, limit);

    const notes = await db.select({
      id: Notes.id, title: Notes.title, content: Notes.content, contentEncrypted: Notes.contentEncrypted,
      threadId: Notes.threadId, spaceId: Notes.spaceId, simpleNoteId: Notes.simpleNoteId,
      isPublic: Notes.isPublic, isFeatured: Notes.isFeatured,
      createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, lastVisited: Notes.lastVisited,
    }).from(Notes).where(eq(Notes.userId, auth.userId))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt), asc(Notes.id)
      ).limit(maxLimit);

    const formattedNotes = notes.map(note => ({
      ...note,
      title: note.title || 'Untitled Note',
      contentEncrypted: note.contentEncrypted || false,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
    }));

    return c.json(formattedNotes);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/recent', action: 'get_recent_notes' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/auto-tags ──────────────────────────────────────────────
route.post('/api/notes/auto-tags', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Unauthorized' }, 401);

    const { noteId, noteTitle, noteContent, action = 'generate' } = await c.req.json();
    if (!noteId || !noteTitle || !noteContent) return c.json({ error: 'Note ID, title, and content are required' }, 400);

    let result;
    switch (action) {
      case 'generate':
        result = await generateAutoTags(noteTitle, noteContent, auth.userId);
        break;
      case 'apply': {
        const suggestions = await generateAutoTags(noteTitle, noteContent, auth.userId);
        const applied = await applyAutoTags(noteId, suggestions.suggestions, auth.userId);
        result = { ...suggestions, applied };
        break;
      }
      case 'regenerate':
        result = await regenerateAutoTags(noteId, noteTitle, noteContent, auth.userId);
        break;
      default:
        return c.json({ error: 'Invalid action' }, 400);
    }

    return c.json({ success: true, result });
  } catch (error) {
    console.error('Error with auto tags:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/notes/cleanup-upgrade-note ───────────────────────────────────
route.post('/api/notes/cleanup-upgrade-note', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, '/api/notes/cleanup-upgrade-note', 'write', ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: 'RATE_LIMIT_EXCEEDED' }, 429);

    const { noteId, simpleNoteId } = await c.req.json();
    if (!noteId || !simpleNoteId) return c.json({ error: 'Note ID and simple note ID are required' }, 400);

    const existingNote = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    if (!existingNote) return c.json({ error: 'Note not found or access denied' }, 404);
    if (existingNote.simpleNoteId !== simpleNoteId) return c.json({ error: 'Simple note ID mismatch' }, 400);

    const noteCreatedAt = existingNote.createdAt;

    await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
    await db.delete(Comments).where(eq(Comments.noteId, noteId));
    await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));

    await revokeXPOnDeletion(auth.userId, noteId, new Date(noteCreatedAt as string));
    await revokeAllXPForItem(auth.userId, noteId);

    await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));

    const userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).get();
    if (userMetadata) {
      if (userMetadata.highestSimpleNoteId === simpleNoteId) {
        await db.update(UserMetadata).set({ highestSimpleNoteId: simpleNoteId - 1, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      } else if (userMetadata.highestSimpleNoteId > simpleNoteId) {
        const existing = await db.select({ simpleNoteId: Notes.simpleNoteId }).from(Notes)
          .where(and(eq(Notes.userId, auth.userId), isNotNull(Notes.simpleNoteId)))
          .orderBy(desc(Notes.simpleNoteId)).limit(1);
        const newHighestId = existing.length > 0 ? (existing[0].simpleNoteId || 0) : 0;
        await db.update(UserMetadata).set({ highestSimpleNoteId: newHighestId, updatedAt: nowISO() }).where(eq(UserMetadata.userId, auth.userId));
      }
    }

    return c.json({ success: true, message: 'Note cleaned up and highestSimpleNoteId reset' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/cleanup-upgrade-note', action: 'cleanup_upgrade_note' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/notes/delete-all-unorganized ───────────────────────────────
route.delete('/api/notes/delete-all-unorganized', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Unauthorized' }, 401);

    await db.delete(Notes).where(and(eq(Notes.userId, auth.userId), eq(Notes.threadId, 'thread_unorganized')));
    return c.json({ success: true, message: 'All notes deleted from unorganized thread' });
  } catch (error) {
    console.error('Error deleting unorganized thread notes:', error);
    return c.json({ error: 'Failed to erase notes from unorganized thread' }, 500);
  }
});

// ─── POST /api/notes/suggest-threads ────────────────────────────────────────
route.post('/api/notes/suggest-threads', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Unauthorized' }, 401);

    const { title, content } = await c.req.json();
    if (!title && !content) return c.json({ error: 'Title or content is required', code: 'MISSING_CONTENT' }, 400);
    const noteText = `${title || ''} ${content || ''}`.trim();
    if (!noteText) return c.json({ error: 'Note text is required', code: 'EMPTY_CONTENT' }, 400);

    const extractKeywords = (text: string) => text.toLowerCase().split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !['the','and','for','are','but','not','you','all','can','her','was','one','our','out','day','get','has','him','his','how','its','may','new','now','old','see','two','way','who','boy','did','let','put','say','she','too','use'].includes(w));

    const calculateSimilarity = (t1: string, t2: string) => {
      const w1 = new Set(t1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      const w2 = new Set(t2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      const intersection = new Set([...w1].filter(w => w2.has(w)));
      const union = new Set([...w1, ...w2]);
      return union.size === 0 ? 0 : intersection.size / union.size;
    };

    const suggestions: Array<{ threadId: string; title: string; color: string | null; score: number; reason: string }> = [];

    // Strategy 1: Recent threads
    const recentThreadRelations = await db.select({ threadId: NoteThreads.threadId, createdAt: NoteThreads.createdAt })
      .from(NoteThreads).innerJoin(Notes, eq(NoteThreads.noteId, Notes.id))
      .where(eq(Notes.userId, auth.userId)).orderBy(desc(NoteThreads.createdAt)).limit(50);
    const recentThreadIds = [...new Set(recentThreadRelations.map(r => r.threadId))].filter(id => id !== 'thread_unorganized').slice(0, 10);
    if (recentThreadIds.length > 0) {
      const recentThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color })
        .from(Threads).where(and(inArray(Threads.id, recentThreadIds), eq(Threads.userId, auth.userId))).all();
      recentThreads.forEach((thread, idx) => {
        suggestions.push({ threadId: thread.id, title: thread.title, color: thread.color, score: 0.3 * (1 - idx / recentThreads.length), reason: 'Recently used' });
      });
    }

    // Strategy 2: Keyword matching
    const keywords = extractKeywords(noteText);
    if (keywords.length > 0) {
      const allThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color })
        .from(Threads).where(eq(Threads.userId, auth.userId)).all();
      allThreads.forEach(thread => {
        if (thread.id === 'thread_unorganized') return;
        const threadKeywords = extractKeywords(thread.title);
        const matching = keywords.filter(kw => threadKeywords.some(tk => tk.includes(kw) || kw.includes(tk)));
        if (matching.length > 0) {
          const score = 0.5 * (matching.length / keywords.length);
          const existing = suggestions.findIndex(s => s.threadId === thread.id);
          if (existing >= 0) { suggestions[existing].score = Math.max(suggestions[existing].score, score); suggestions[existing].reason = 'Similar keywords'; }
          else suggestions.push({ threadId: thread.id, title: thread.title, color: thread.color, score, reason: 'Similar keywords' });
        }
      });
    }

    // Strategy 3: Similar notes
    const allUserNotes = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content })
      .from(Notes).where(eq(Notes.userId, auth.userId)).limit(100);
    const similarNotes: Array<{ noteId: string; similarity: number }> = [];
    allUserNotes.forEach(note => {
      const t = `${note.title || ''} ${note.content || ''}`.trim();
      if (t) { const s = calculateSimilarity(noteText, t); if (s > 0.2) similarNotes.push({ noteId: note.id, similarity: s }); }
    });
    similarNotes.sort((a, b) => b.similarity - a.similarity);
    const topSimilarNoteIds = similarNotes.slice(0, 10).map(n => n.noteId);
    if (topSimilarNoteIds.length > 0) {
      const similarNoteThreads = await db.select({ threadId: NoteThreads.threadId, noteId: NoteThreads.noteId })
        .from(NoteThreads).where(inArray(NoteThreads.noteId, topSimilarNoteIds)).all();
      const threadSimMap: Record<string, number> = {};
      similarNoteThreads.forEach(nt => {
        if (nt.threadId === 'thread_unorganized') return;
        const ns = similarNotes.find(n => n.noteId === nt.noteId)?.similarity || 0;
        threadSimMap[nt.threadId] = Math.max(threadSimMap[nt.threadId] || 0, ns);
      });
      const simThreadIds = Object.keys(threadSimMap);
      if (simThreadIds.length > 0) {
        const threads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color })
          .from(Threads).where(and(inArray(Threads.id, simThreadIds), eq(Threads.userId, auth.userId))).all();
        threads.forEach(thread => {
          const score = 0.7 * threadSimMap[thread.id];
          const existing = suggestions.findIndex(s => s.threadId === thread.id);
          if (existing >= 0) { suggestions[existing].score = Math.max(suggestions[existing].score, score); suggestions[existing].reason = 'Similar to your notes'; }
          else suggestions.push({ threadId: thread.id, title: thread.title, color: thread.color, score, reason: 'Similar to your notes' });
        });
      }
    }

    // Deduplicate & sort
    const unique = suggestions.reduce((acc, curr) => {
      const ex = acc.find(s => s.threadId === curr.threadId);
      if (!ex) acc.push(curr);
      else if (curr.score > ex.score) acc[acc.indexOf(ex)] = curr;
      return acc;
    }, [] as typeof suggestions);
    unique.sort((a, b) => b.score - a.score);
    const top = unique.slice(0, 5);

    return c.json({
      success: true,
      suggestedThreadIds: top.map(s => s.threadId),
      suggestedThreads: top.map(s => ({ id: s.threadId, title: s.title, color: s.color, reason: s.reason })),
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/suggest-threads', action: 'suggest_threads' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/:id/details ─────────────────────────────────────────────
route.get('/api/notes/:id/details', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const noteId = c.req.param('id');
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    // Owner path
    let note = await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).get();
    let isMemberView = false;

    if (!note) {
      const noteById = await db.select().from(Notes).where(eq(Notes.id, noteId)).get();
      if (!noteById) return c.json({ error: 'Note not found or access denied' }, 404);
      let spaceIdForAccess = noteById.spaceId;
      if (!spaceIdForAccess) {
        const threadWithSpace = await db.select({ spaceId: Threads.spaceId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
          .limit(1)
          .get();
        spaceIdForAccess = threadWithSpace?.spaceId ?? null;
      }
      if (!spaceIdForAccess) return c.json({ error: 'Note not found or access denied' }, 404);
      try { await requireSpaceAccess(spaceIdForAccess, auth.userId); } catch (err) {
        if (err instanceof Response) return new Response(err.body, { status: err.status, headers: err.headers });
        throw err;
      }
      note = noteById;
      isMemberView = true;
    }

    // Scripture version
    let version: string | undefined;
    if (note.noteType === 'scripture') {
      try {
        const sm = await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId)).get();
        version = sm?.translation;
      } catch { version = undefined; }
    }

    // Resource metadata
    let resourceTitle: string | null = null, resourceDescription: string | null = null, resourceImage: string | null = null;
    if (note.noteType === 'resource') {
      try {
        const rm = await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).get();
        resourceTitle = rm?.sourceTitle || null;
        resourceDescription = rm?.sourceDescription || null;
        resourceImage = rm?.sourceImage || null;
      } catch {}
    }

    // All user threads
    const allUserThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color, isPublic: Threads.isPublic, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
      .from(Threads).where(eq(Threads.userId, auth.userId)).all();

    // Junction threads
    let allThreads: any[] = [];
    try {
      const junctionThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
        .from(Threads).innerJoin(NoteThreads, eq(NoteThreads.threadId, Threads.id))
        .where(and(eq(NoteThreads.noteId, noteId), eq(Threads.userId, auth.userId))).all();
      // Include unorganized so note detail returns it when the note is in unorganized (nav shows "Unorganized" not "Thread").
      allThreads = junctionThreads;
    } catch { allThreads = []; }

    if (isMemberView) {
      try {
        const memberSpaceThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
          .from(NoteThreads).innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId))).all();
        const accessibleSpaceIds = new Set<string>();
        for (const t of memberSpaceThreads) {
          if (!t.spaceId) continue;
          try {
            await requireSpaceAccess(t.spaceId, auth.userId!);
            accessibleSpaceIds.add(t.spaceId);
          } catch {}
        }
        const memberThreads = memberSpaceThreads.filter(t => t.spaceId && accessibleSpaceIds.has(t.spaceId) && t.title !== 'Unorganized');
        allThreads = [...memberThreads, ...allThreads];
      } catch {}
    }

    // Format threads with counts and backgroundGradient for nav/NotePage
    const formattedThreads = await Promise.all(allThreads.map(async (thread: any) => {
      const useTotalCount = isMemberView && thread.spaceId;
      const junctionCountResult = useTotalCount
        ? await db.select({ count: count() }).from(NoteThreads).where(eq(NoteThreads.threadId, thread.id)).get()
        : await db.select({ count: count() }).from(Notes)
            .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
            .where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.userId, auth.userId!))).get();
      return {
        ...thread,
        subtitle: thread.subtitle || 'Thread',
        count: junctionCountResult?.count || 0,
        backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color),
      };
    }));

    // Comments
    const comments = await db.select({ id: Comments.id, content: Comments.content, createdAt: Comments.createdAt, updatedAt: Comments.updatedAt })
      .from(Comments).where(and(eq(Comments.noteId, noteId), eq(Comments.userId, auth.userId))).orderBy(Comments.createdAt);

    // Tags
    const noteTags = await db.select({ id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem, isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence })
      .from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, auth.userId))).orderBy(Tags.name);

    // Referencing notes (for scripture notes)
    let referencingNotes: any[] = [];
    if (note.noteType === 'scripture') {
      try {
        let junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
          .where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId)))
          .orderBy(desc(Notes.updatedAt)).all();

        // Heal on read
        if (junctionEntries.length === 0) {
          try {
            const notesWithPill = await db.select({ id: Notes.id }).from(Notes)
              .where(and(eq(Notes.userId, auth.userId), ne(Notes.noteType, 'scripture'), like(Notes.content, `%data-note-id="${noteId}"%`))).all();
            for (const refNote of notesWithPill) {
              try {
                const ex = await db.select().from(NoteScriptureReferences).where(and(eq(NoteScriptureReferences.noteId, refNote.id), eq(NoteScriptureReferences.scriptureNoteId, noteId))).limit(1).get();
                if (!ex) await db.insert(NoteScriptureReferences).values({ id: `note-scripture-${refNote.id}-${noteId}-${Date.now()}`, noteId: refNote.id, scriptureNoteId: noteId, createdAt: nowISO() });
              } catch {}
            }
            if (notesWithPill.length > 0) {
              junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt })
                .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
                .where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId)))
                .orderBy(desc(Notes.updatedAt)).all();
            }
          } catch {}
        }

        // Resource metadata for referencing notes
        const resourceNoteIds = junctionEntries.filter(e => e.noteType === 'resource').map(e => e.id);
        let resourceMetadataMap: Record<string, any> = {};
        if (resourceNoteIds.length > 0) {
          try {
            const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
              .from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds)).all();
            resourceMetadataMap = Object.fromEntries(rmList.map(m => [m.noteId, m]));
          } catch {}
        }

        referencingNotes = junctionEntries.map(entry => {
          const rm = entry.noteType === 'resource' ? resourceMetadataMap[entry.id] : null;
          return { ...entry, noteType: entry.noteType || 'default', resourceTitle: rm?.sourceTitle || null, resourceDescription: rm?.sourceDescription || null, resourceImage: rm?.sourceImage || null };
        });
      } catch { referencingNotes = []; }
    }

    return c.json({
      success: true,
      note: { ...note, contentEncrypted: note.contentEncrypted || false, noteType: note.noteType || 'default', addedBy: note.addedBy || 'user', version, resourceTitle, resourceDescription, resourceImage },
      threads: formattedThreads,
      allUserThreads: allUserThreads.map(t => ({ id: t.id, title: t.title, color: t.color, isPublic: t.isPublic, createdAt: t.createdAt, updatedAt: t.updatedAt })),
      comments: comments.map(c => ({ id: c.id, content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt })),
      tags: noteTags.map(t => ({ id: t.id, name: t.name, color: t.color, category: t.category, isSystem: t.isSystem, isAutoGenerated: t.isAutoGenerated, confidence: t.confidence })),
      referencingNotes,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/details', action: 'get_note_details' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:id/update-content ─────────────────────────────────────
route.post('/api/notes/:id/update-content', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, '/api/notes/[id]/update-content', 'write', ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: 'RATE_LIMIT_EXCEEDED' }, 429);

    const id = c.req.param('id');
    const { content, contentEncrypted } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'Note ID is required' }, 400);
    if (!content || typeof content !== 'string') return c.json({ success: false, error: 'Content is required' }, 400);

    const note = await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).get();
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const updateData: any = { content, updatedAt: nowISO() };
    if (typeof contentEncrypted === 'boolean') {
      updateData.contentEncrypted = contentEncrypted;
      if (contentEncrypted === true) { updateData.isPublic = false; updateData.shareToken = null; updateData.shareTokenCreatedAt = null; }
    }

    await db.update(Notes).set(updateData).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId)));
    return c.json({ success: true, message: 'Note content updated' });
  } catch (error) {
    console.error('Error updating note content:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/notes/:id/add-thread ─────────────────────────────────────────
route.post('/api/notes/:id/add-thread', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, '/api/notes/[id]/add-thread', 'write', ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: 'RATE_LIMIT_EXCEEDED' }, 429);

    const id = c.req.param('id');
    const { threadId } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'Note ID is required' }, 400);
    if (!threadId) return c.json({ success: false, error: 'Thread ID is required' }, 400);
    if (threadId.startsWith('thread_onboarding_')) return c.json({ success: false, error: "This thread doesn't take new notes." }, 400);

    const note = await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).get();
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const targetThread = await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).get();
    if (!targetThread) return c.json({ success: false, error: 'Target thread not found' }, 404);

    const existingRelation = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId))).get();
    if (existingRelation) return c.json({ success: true, alreadyInThread: true });

    const existingThreadRelations = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, id)).all();
    const isInUnorganized = existingThreadRelations.length === 0 || note.threadId === 'thread_unorganized';

    try {
      const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({ id: noteThreadId, noteId: id, threadId, createdAt: nowISO() });
      if (isInUnorganized && threadId !== 'thread_unorganized') {
        await db.update(Notes).set({ threadId }).where(eq(Notes.id, id));
      }
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));

      // Fire and forget
      moveScriptureNotesToThread(id, threadId, auth.userId).catch(() => {});
    } catch (insertError) {
      const standardError = handleAPIError(insertError, { endpoint: '/api/notes/[id]/add-thread', action: 'add_note_to_thread' });
      return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
    }

    return c.json({ success: true, message: 'Note added to thread', note: { id: note.id, threadId } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/add-thread', action: 'add_note_to_thread' });
    return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:id/remove-thread ──────────────────────────────────────
route.post('/api/notes/:id/remove-thread', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const ip = getClientIP(c.req.raw);
    const rateLimit = rateLimitMiddleware(auth.userId, '/api/notes/[id]/remove-thread', 'write', ip);
    if (!rateLimit.allowed) return c.json({ error: rateLimit.error, code: 'RATE_LIMIT_EXCEEDED' }, 429);

    const id = c.req.param('id');
    const { threadId } = await c.req.json();
    if (!id) return c.json({ success: false, error: 'Note ID is required' }, 400);
    if (!threadId) return c.json({ success: false, error: 'Thread ID is required' }, 400);

    const note = await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).get();
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const existingRelation = await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId))).get();
    if (!existingRelation) return c.json({ success: false, error: 'Note is not in this thread' }, 400);

    try {
      await db.delete(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)));
      const remainingThreads = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, id)).all();
      if (remainingThreads.length === 0) {
        await ensureUnorganizedThread(auth.userId);
        await db.update(Notes).set({ threadId: 'thread_unorganized' }).where(eq(Notes.id, id));
      }
      removeScriptureNotesFromThread(id, threadId, auth.userId).catch(() => {});
    } catch (deleteError) {
      const standardError = handleAPIError(deleteError, { endpoint: '/api/notes/[id]/remove-thread', action: 'remove_note_from_thread' });
      return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
    }

    return c.json({ success: true, message: 'Note removed from thread', note: { id: note.id, threadId } });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/remove-thread', action: 'remove_note_from_thread' });
    return c.json({ success: false, error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:id/process-scripture-references ───────────────────────
route.post('/api/notes/:id/process-scripture-references', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const noteId = c.req.param('id');
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const noteRow = await db.select({ id: Notes.id, userId: Notes.userId, spaceId: Notes.spaceId, content: Notes.content }).from(Notes).where(eq(Notes.id, noteId)).get();
    if (!noteRow) return c.json({ error: 'Note not found' }, 404);

    if (noteRow.userId !== auth.userId) {
      let spaceIdForAccess = noteRow.spaceId;
      if (!spaceIdForAccess) {
        const threadWithSpace = await db.select({ spaceId: Threads.spaceId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
          .limit(1)
          .get();
        spaceIdForAccess = threadWithSpace?.spaceId ?? null;
      }
      if (!spaceIdForAccess) return c.json({ error: 'Note not found' }, 404);
      try {
        await requireSpaceAccess(spaceIdForAccess, auth.userId);
      } catch {
        return c.json({ error: 'Note not found' }, 404);
      }
      return c.json({ results: [], updatedContent: noteRow.content ?? '' });
    }

    let threadId: string | undefined;
    let contentOverride: string | undefined;
    try {
      const body = await c.req.json();
      threadId = body?.threadId;
      contentOverride = body?.contentOverride;
    } catch {
      // Empty or invalid JSON body is ok; processScriptureReferences will read from DB
    }
    const result = await processScriptureReferences(noteId, auth.userId, threadId, contentOverride);
    return c.json(result);
  } catch (error: any) {
    console.error('Error processing scripture references:', error);
    return c.json({ error: error.message || 'Error processing scripture references' }, 500);
  }
});

// ─── POST /api/notes/:noteId/visit ──────────────────────────────────────────
route.post('/api/notes/:noteId/visit', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    let noteId = c.req.param('noteId');
    if (!noteId) return c.json({ error: 'Note ID required' }, 400);
    if (noteId.startsWith('note/')) noteId = 'note_' + noteId.slice(5);

    const note = await db.select({ id: Notes.id, userId: Notes.userId, spaceId: Notes.spaceId }).from(Notes).where(eq(Notes.id, noteId)).get();
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== auth.userId) {
      let spaceIdForAccess = note.spaceId;
      if (!spaceIdForAccess) {
        const threadWithSpace = await db.select({ spaceId: Threads.spaceId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
          .limit(1)
          .get();
        spaceIdForAccess = threadWithSpace?.spaceId ?? null;
      }
      if (!spaceIdForAccess) return c.json({ error: 'Note not found' }, 404);
      try {
        await requireSpaceAccess(spaceIdForAccess, auth.userId);
      } catch {
        return c.json({ error: 'Note not found' }, 404);
      }
    }
    await db.update(Notes).set({ lastVisited: nowISO() }).where(eq(Notes.id, noteId));
    return c.json({ ok: true });
  } catch (error: any) {
    console.error('[visit] Error updating note lastVisited:', error);
    return c.json({ error: error.message || 'Failed to update visit' }, 500);
  }
});

// ─── GET /api/notes/:noteId/share ───────────────────────────────────────────
route.get('/api/notes/:noteId/share', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const noteId = c.req.param('noteId');
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const note = await db.select({ id: Notes.id, isPublic: Notes.isPublic, shareToken: Notes.shareToken, shareTokenCreatedAt: Notes.shareTokenCreatedAt, userId: Notes.userId, noteType: Notes.noteType, contentEncrypted: Notes.contentEncrypted })
      .from(Notes).where(eq(Notes.id, noteId)).get();
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== auth.userId) return c.json({ error: 'You do not have permission to access this note' }, 403);

    let effectiveShareToken = note.shareToken;
    let effectiveShareTokenCreatedAt = note.shareTokenCreatedAt;
    const isScriptureNote = note.noteType === 'scripture';
    const needsToken = isScriptureNote && !note.shareToken && !note.contentEncrypted;

    if (needsToken) {
      const now = nowISO();
      effectiveShareToken = generateShareToken();
      effectiveShareTokenCreatedAt = now;
      await db.update(Notes).set({ isPublic: true, shareToken: effectiveShareToken, shareTokenCreatedAt: now, updatedAt: now })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    }

    const origin = new URL(c.req.url).origin;
    const shareUrl = effectiveShareToken ? `${origin}/shared/note/${effectiveShareToken}` : null;

    return c.json({
      isPublic: needsToken ? true : note.isPublic,
      shareToken: effectiveShareToken,
      shareUrl,
      shareTokenCreatedAt: effectiveShareTokenCreatedAt,
      noteType: note.noteType || 'default',
      contentEncrypted: note.contentEncrypted || false,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[noteId]/share', action: 'get_share_status', noteId: c.req.param('noteId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:noteId/share ──────────────────────────────────────────
route.post('/api/notes/:noteId/share', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) return c.json({ error: 'Authentication required' }, 401);

    const noteId = c.req.param('noteId');
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const { action } = await c.req.json();
    if (!action || !['enable', 'disable', 'refresh'].includes(action)) return c.json({ error: 'Invalid action' }, 400);

    const note = await db.select({ id: Notes.id, isPublic: Notes.isPublic, shareToken: Notes.shareToken, userId: Notes.userId, contentEncrypted: Notes.contentEncrypted })
      .from(Notes).where(eq(Notes.id, noteId)).get();
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== auth.userId) return c.json({ error: 'You do not have permission' }, 403);

    if (note.contentEncrypted && (action === 'enable' || action === 'refresh')) {
      return c.json({ error: 'Remove the lock first to share it.', code: 'ENCRYPTED_NOTE_CANNOT_SHARE' }, 400);
    }

    const now = nowISO();
    let newShareToken: string | null = null;
    let isPublic = note.isPublic;

    if (action === 'enable') {
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Notes).set({ isPublic: true, shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    } else if (action === 'disable') {
      newShareToken = null;
      isPublic = false;
      await db.update(Notes).set({ isPublic: false, shareToken: null, shareTokenCreatedAt: null, updatedAt: now })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    } else if (action === 'refresh') {
      if (!note.isPublic) return c.json({ error: 'Cannot refresh share link for a private note' }, 400);
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Notes).set({ shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now })
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    }

    const origin = new URL(c.req.url).origin;
    const shareUrl = newShareToken ? `${origin}/shared/note/${newShareToken}` : null;

    return c.json({ success: true, isPublic, shareToken: newShareToken, shareUrl, shareTokenCreatedAt: action !== 'disable' ? now : null });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[noteId]/share', action: 'update_share_status', noteId: c.req.param('noteId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;
