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
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Notes, Threads, NoteThreads, Comments, Tags, NoteTags,
  UserMetadata, ScriptureMetadata, NoteScriptureReferences, ResourceMetadata,
  eq, and, or, ne, desc, asc, count, like, not, isNull, isNotNull, inArray, sql,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId, generateShareToken, generateTimestampId } from '@/utils/ids';
import { getHarvousSystemUserId } from '../utils/harvous-admin';
import { handleAPIError } from '@/utils/error-handling';
import { validateContent, validateNoteType, validateThreadId, validateSpaceId, normalizeUrl, extractDomain, validateResourceUrl } from '@/utils/validation';
import { rateLimit, rateLimitNoteCreate } from '@/utils/rate-limit';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { debug } from '@/utils/logger';
import { stripNoteLinksToNoteId } from '@/utils/tiptap-helpers';
import { getCurrentSeason } from '@/utils/season-helpers';
import { getThreadGradientCSS } from '@/utils/colors';
import { awardCreationBonusXP, revokeXPOnDeletion, revokeAllXPForItem } from '../utils/xp-system';
import { generateAutoTags, applyAutoTags, removeAutoTags, regenerateAutoTags } from '../utils/auto-tag-generator';
import { processScriptureReferences } from '../utils/process-scripture-references';
import { getNextUntitledNoteName } from '../utils/untitled-naming';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { moveScriptureNotesToThread } from '../utils/move-scripture-notes-to-thread';
import { healScriptureNoteThreadsFromParents } from '../utils/heal-scripture-note-threads';
import { removeScriptureNotesFromThread } from '../utils/remove-scripture-notes-from-thread';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-permissions';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
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
route.post('/api/notes/create', requireAuth, rateLimitNoteCreate(), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

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
    let linkedFromNoteIdRaw: string | null = null;

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
      const lfn = body.linkedFromNoteId;
      linkedFromNoteIdRaw = typeof lfn === 'string' && lfn.trim() ? lfn.trim() : null;
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
      const lfnForm = formData.get('linkedFromNoteId') as string | null;
      linkedFromNoteIdRaw = lfnForm && lfnForm.trim() ? lfnForm.trim() : null;
    }

    let prefetchedResourceMetadata: { title?: string; description?: string; image?: string; articleContent?: string; siteName?: string } | null = null;
    if (resourceMetadataStr) {
      try { prefetchedResourceMetadata = JSON.parse(resourceMetadataStr); } catch {}
    }

    // Validate
    const noteTypeValidation = validateNoteType(noteType);
    if (!noteTypeValidation.isValid) return c.json({ error: noteTypeValidation.error, code: noteTypeValidation.code }, 400);
    const finalNoteType = noteType && noteTypeValidation.isValid ? noteType : 'default';

    let resolvedLinkedFromNoteId: string | null = null;
    if (linkedFromNoteIdRaw) {
      if (finalNoteType !== 'default') {
        return c.json({ error: 'linkedFromNoteId is only allowed for default notes', code: 'INVALID_LINKED_FROM' }, 400);
      }
      const sourceForLink = first(await db.select().from(Notes).where(and(eq(Notes.id, linkedFromNoteIdRaw), eq(Notes.userId, auth.userId))).limit(1));
      if (!sourceForLink) {
        return c.json({ error: 'Source note not found', code: 'INVALID_LINKED_FROM' }, 400);
      }
      resolvedLinkedFromNoteId = linkedFromNoteIdRaw;
    }

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
    let userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
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
        userColor: 'blue',
        currentSeason: season,
        createdAt: nowISO(),
      });
      userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    }

    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    const nextSimpleNoteId = effectiveHighest + 1;
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') finalSpaceId = spaceId;

    const now = nowISO();
    const isScriptureNote = finalNoteType === 'scripture';
    const shouldAutoShare = isScriptureNote && !contentEncrypted;
    const shareToken = shouldAutoShare ? generateShareToken() : null;

    const newNote = first(await db.insert(Notes).values({
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
      linkedFromNoteId: resolvedLinkedFromNoteId,
    }).returning())!;

    await db.update(UserMetadata)
      .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() })
      .where(eq(UserMetadata.userId, auth.userId));

    let noteStaysInUnorganized = true;

    if (threadId && threadId.trim() !== '' && threadId !== 'thread_unorganized' && !threadId.startsWith('thread_onboarding_')) {
      try {
        const targetThread = first(await db.select().from(Threads)
          .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
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
    const finalNote = first(await db.select().from(Notes).where(eq(Notes.id, newNote.id)).limit(1));
    if (finalNote) Object.assign(newNote, finalNote);

    // Auto-tag (fire-and-forget)
    if (finalNoteType !== 'resource' && !contentEncrypted) {
      (async () => {
        try {
          const r = await generateAutoTags(capitalizedTitle || '', capitalizedContent, auth.userId);
          if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId);
        } catch (err) {
          console.error('[auto-tag] Failed to auto-tag new note:', newNote.id, err);
        }
      })().catch((err) => console.error('[auto-tag] Unhandled:', newNote.id, err));
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
            const updatedNote = first(await db.select().from(Notes).where(eq(Notes.id, newNote.id)).limit(1));
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

    // Fire-and-forget scripture processing — note page reprocess-on-view is the safety net
    const actualThreadId = threadId && threadId !== 'thread_unorganized' ? threadId : 'thread_unorganized';
    const contentToProcess = newNote.content;

    if (!contentEncrypted) {
      (async () => {
        try {
          console.log('[api/notes/create] Background scripture processing start', { noteId: newNote.id });
          await processScriptureReferences(newNote.id, auth.userId, actualThreadId, contentToProcess, scriptureVersion || 'NET');
          console.log('[api/notes/create] Background scripture processing complete', { noteId: newNote.id });
        } catch (err: any) {
          console.error('[api/notes/create] Background scripture processing failed:', err?.message ?? err);
        }
      })().catch((err) => console.error('[api/notes/create] Unhandled background scripture error:', newNote.id, err));
    }

    return c.json({
      success: 'Note created!',
      note: newNote,
      scriptureResults: [],
      scriptureDeferred: true,
    });
  } catch (error: any) {
    console.error('[api/notes/create] Error:', error);
    return c.json({ error: error.message || 'Failed to create note' }, 500);
  }
});

// ─── PUT /api/notes/update ──────────────────────────────────────────────────
route.put('/api/notes/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = await c.req.json();
    const { noteId, title, content, resourceImage, contentEncrypted, scriptureVersion } = body;
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const contentValidation = validateContent(content, true);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);

    const existingNote = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
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

    const updatedNote = first(await db.update(Notes).set(updateData)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).returning())!;
    if (!updatedNote) return c.json({ error: 'Failed to update note' }, 500);

    // Update thread timestamps
    const noteThreads = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    for (const nt of noteThreads) {
      await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, nt.threadId), eq(Threads.userId, auth.userId)));
    }

    // Re-tag (fire-and-forget) — generate first, only remove+apply if successful
    if (!isEncrypted) {
      (async () => {
        try {
          const r = await generateAutoTags(capitalizedTitle || '', capitalizedContent, auth.userId);
          if (r.suggestions.length > 0) {
            await removeAutoTags(noteId);
            await applyAutoTags(noteId, r.suggestions, auth.userId);
          }
        } catch (err) {
          console.error('[auto-tag] Failed to re-tag note:', noteId, err);
        }
      })().catch((err) => console.error('[auto-tag] Unhandled re-tag:', noteId, err));
    }

    // Update resource image
    if (existingNote.noteType === 'resource' && resourceImage !== undefined) {
      try {
        const rm = first(await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).limit(1));
        if (rm) await db.update(ResourceMetadata).set({ sourceImage: resourceImage || null }).where(eq(ResourceMetadata.noteId, noteId));
      } catch {}
    }

    // Process scripture references (awaited)
    let scriptureResults: any[] = [];
    let processedContent: string | null = null;
    let scriptureProcessingError = false;
    if (!isEncrypted) {
      try {
        // Omit threadId so processScriptureReferences resolves every NoteThreads row for this note (multi-thread)
        const scriptureResult = await processScriptureReferences(noteId, auth.userId, undefined, capitalizedContent, scriptureVersion || 'NET');
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
route.delete('/api/notes/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = c.req.query('noteId');
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const existingNote = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    if (!existingNote) return c.json({ error: 'Note not found or access denied' }, 404);

    const threadId = existingNote.threadId;
    const noteCreatedAt = existingNote.createdAt;

    await db.update(Notes).set({ linkedFromNoteId: null, updatedAt: nowISO() }).where(eq(Notes.linkedFromNoteId, noteId));

    await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    await db.delete(NoteScriptureReferences).where(or(eq(NoteScriptureReferences.noteId, noteId), eq(NoteScriptureReferences.scriptureNoteId, noteId)));
    await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
    await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
    await db.delete(Comments).where(eq(Comments.noteId, noteId));
    await db.delete(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId));
    await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));

    // Strip note links (non-critical)
    try {
      const notesWithLinks = await db.select({ id: Notes.id, content: Notes.content }).from(Notes)
        .where(and(eq(Notes.userId, auth.userId), not(eq(Notes.contentEncrypted, true)), like(Notes.content, '%data-note-id=%')));
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
        await revokeXPOnDeletion(auth.userId, noteId, new Date(noteCreatedAt as string));
        await revokeAllXPForItem(auth.userId, noteId);
      } catch {}
    })().catch(() => {});

    return c.json({ success: 'Note erased!', noteId, threadId });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/delete', action: 'delete_note' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/next-id ──────────────────────────────────────────────────
route.get('/api/notes/next-id', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
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
      userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
    }
    const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
    const nextSimpleNoteId = effectiveHighest + 1;
    const formattedId = `N${nextSimpleNoteId.toString().padStart(3, '0')}`;
    return c.json({ nextNoteId: nextSimpleNoteId, formattedId });
  } catch (error: any) {
    console.error('Error getting next note ID:', error);
    return c.json({ error: error.message || 'Failed to get next note ID' }, 500);
  }
});

// ─── GET /api/notes/recent ──────────────────────────────────────────────────
route.get('/api/notes/recent', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

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
route.post('/api/notes/auto-tags', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

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
route.post('/api/notes/cleanup-upgrade-note', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { noteId, simpleNoteId } = await c.req.json();
    if (!noteId || !simpleNoteId) return c.json({ error: 'Note ID and simple note ID are required' }, 400);

    const existingNote = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    if (!existingNote) return c.json({ error: 'Note not found or access denied' }, 404);
    if (existingNote.simpleNoteId !== simpleNoteId) return c.json({ error: 'Simple note ID mismatch' }, 400);

    const noteCreatedAt = existingNote.createdAt;

    await db.update(Notes).set({ linkedFromNoteId: null, updatedAt: nowISO() }).where(eq(Notes.linkedFromNoteId, noteId));

    await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    await db.delete(NoteScriptureReferences).where(or(eq(NoteScriptureReferences.noteId, noteId), eq(NoteScriptureReferences.scriptureNoteId, noteId)));
    await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
    await db.delete(Comments).where(eq(Comments.noteId, noteId));
    await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
    await db.delete(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId));

    await revokeXPOnDeletion(auth.userId, noteId, new Date(noteCreatedAt as string));
    await revokeAllXPForItem(auth.userId, noteId);

    await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));

    const userMetadata = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, auth.userId)).limit(1));
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
route.delete('/api/notes/delete-all-unorganized', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const unorgNotes = await db.select({ id: Notes.id, createdAt: Notes.createdAt }).from(Notes)
      .where(and(eq(Notes.userId, auth.userId), eq(Notes.threadId, 'thread_unorganized')));
    const noteIds = unorgNotes.map(n => n.id);

    if (noteIds.length > 0) {
      await db.update(Notes).set({ linkedFromNoteId: null, updatedAt: nowISO() }).where(and(eq(Notes.userId, auth.userId), inArray(Notes.linkedFromNoteId, noteIds)));
      for (const note of unorgNotes) {
        await db.delete(NoteThreads).where(eq(NoteThreads.noteId, note.id));
        await db.delete(NoteScriptureReferences).where(or(eq(NoteScriptureReferences.noteId, note.id), eq(NoteScriptureReferences.scriptureNoteId, note.id)));
        await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, note.id));
        await db.delete(NoteTags).where(eq(NoteTags.noteId, note.id));
        await db.delete(Comments).where(eq(Comments.noteId, note.id));
        await db.delete(ResourceMetadata).where(eq(ResourceMetadata.noteId, note.id));
        // Revoke XP (fire-and-forget to match main delete pattern)
        (async () => {
          try {
            await revokeXPOnDeletion(auth.userId, note.id, new Date(note.createdAt as string));
            await revokeAllXPForItem(auth.userId, note.id);
          } catch {}
        })().catch(() => {});
      }
      await db.delete(Notes).where(and(eq(Notes.userId, auth.userId), eq(Notes.threadId, 'thread_unorganized')));
    }

    return c.json({ success: true, message: 'All notes deleted from unorganized thread' });
  } catch (error) {
    console.error('Error deleting unorganized thread notes:', error);
    return c.json({ error: 'Failed to erase notes from unorganized thread' }, 500);
  }
});

// ─── POST /api/notes/suggest-threads ────────────────────────────────────────
route.post('/api/notes/suggest-threads', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

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
        .from(Threads).where(and(inArray(Threads.id, recentThreadIds), eq(Threads.userId, auth.userId)));
      recentThreads.forEach((thread, idx) => {
        suggestions.push({ threadId: thread.id, title: thread.title, color: thread.color, score: 0.3 * (1 - idx / recentThreads.length), reason: 'Recently used' });
      });
    }

    // Strategy 2: Keyword matching
    const keywords = extractKeywords(noteText);
    if (keywords.length > 0) {
      const allThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color })
        .from(Threads).where(eq(Threads.userId, auth.userId));
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
        .from(NoteThreads).where(inArray(NoteThreads.noteId, topSimilarNoteIds));
      const threadSimMap: Record<string, number> = {};
      similarNoteThreads.forEach(nt => {
        if (nt.threadId === 'thread_unorganized') return;
        const ns = similarNotes.find(n => n.noteId === nt.noteId)?.similarity || 0;
        threadSimMap[nt.threadId] = Math.max(threadSimMap[nt.threadId] || 0, ns);
      });
      const simThreadIds = Object.keys(threadSimMap);
      if (simThreadIds.length > 0) {
        const threads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color })
          .from(Threads).where(and(inArray(Threads.id, simThreadIds), eq(Threads.userId, auth.userId)));
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
route.get('/api/notes/:id/details', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'id');

    // Owner path
    let note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    let isMemberView = false;

    if (!note) {
      const noteById = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
      if (!noteById) return c.json({ error: 'Note not found or access denied' }, 404);
      let spaceIdForAccess = noteById.spaceId;
      if (!spaceIdForAccess) {
        const threadWithSpace = first(await db.select({ spaceId: Threads.spaceId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
          .limit(1));
        spaceIdForAccess = threadWithSpace?.spaceId ?? null;
      }
      if (!spaceIdForAccess) return c.json({ error: 'Note not found or access denied' }, 404);
      try { await requireSpaceAccess(spaceIdForAccess, auth.userId); } catch (err) {
        if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
        throw err;
      }
      note = noteById;
      isMemberView = true;
    }

    // Scripture version
    let version: string | undefined;
    if (note.noteType === 'scripture') {
      try {
        const sm = first(await db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId)).limit(1));
        version = sm?.translation;
      } catch { version = undefined; }
    }

    // Resource metadata
    let resourceTitle: string | null = null, resourceDescription: string | null = null, resourceImage: string | null = null;
    if (note.noteType === 'resource') {
      try {
        const rm = first(await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).limit(1));
        resourceTitle = rm?.sourceTitle || null;
        resourceDescription = rm?.sourceDescription || null;
        resourceImage = rm?.sourceImage || null;
      } catch {}
    }

    // All user threads
    const allUserThreads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color, isPublic: Threads.isPublic, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
      .from(Threads).where(eq(Threads.userId, auth.userId));
    const selectableUserThreads = allUserThreads.filter((thread) => {
      if (thread.id === 'thread_unorganized') return false;
      return thread.title?.trim().toLowerCase() !== 'unorganized';
    });

    // Junction threads
    let allThreads: any[] = [];
    try {
      const junctionThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
        .from(Threads).innerJoin(NoteThreads, eq(NoteThreads.threadId, Threads.id))
        .where(and(
          eq(NoteThreads.noteId, noteId),
          // thread_unorganized is a globally-unique row (single PK); include it regardless of which user created the row.
          or(eq(Threads.userId, auth.userId), eq(Threads.id, 'thread_unorganized')),
        ));
      allThreads = junctionThreads;
    } catch { allThreads = []; }

    // Heal-on-read: scripture notes can list under threads via NoteScriptureReferences without NoteThreads rows
    if (note.noteType === 'scripture' && note.userId === auth.userId) {
      try {
        const healed = await healScriptureNoteThreadsFromParents(noteId, auth.userId);
        if (healed) {
          const junctionThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
            .from(Threads).innerJoin(NoteThreads, eq(NoteThreads.threadId, Threads.id))
            .where(and(
              eq(NoteThreads.noteId, noteId),
              or(eq(Threads.userId, auth.userId), eq(Threads.id, 'thread_unorganized')),
            ));
          allThreads = junctionThreads;
          const refreshed = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1));
          if (refreshed) note = refreshed;
        }
      } catch (healErr) {
        console.error('[api/notes/:id/details] healScriptureNoteThreadsFromParents:', healErr);
      }
    }

    // Notes that live only in unorganized have no NoteThreads row; include unorganized thread so nav shows "Unorganized".
    if (!isMemberView && allThreads.length === 0 && note.threadId === 'thread_unorganized') {
      await ensureUnorganizedThread(auth.userId);
      const unorganizedRow = first(await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
        .from(Threads)
        .where(and(eq(Threads.id, 'thread_unorganized'), eq(Threads.userId, auth.userId)))
        .limit(1));
      if (unorganizedRow) {
        const unorganizedCountResult = first(await db.select({ count: count() })
          .from(Notes)
          .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
          .where(and(eq(Notes.userId, auth.userId), isNull(NoteThreads.id)))
          .limit(1));
        allThreads = [{
          ...unorganizedRow,
          title: 'Unorganized',
          subtitle: unorganizedRow.subtitle || 'Thread',
          count: unorganizedCountResult?.count || 0,
          backgroundGradient: getThreadGradientCSS(unorganizedRow.color || 'paper'),
        }];
      }
    }

    if (isMemberView) {
      try {
        const memberSpaceThreads = await db.select({ id: Threads.id, title: Threads.title, subtitle: Threads.subtitle, color: Threads.color, spaceId: Threads.spaceId, isPublic: Threads.isPublic, isPinned: Threads.isPinned, createdAt: Threads.createdAt, updatedAt: Threads.updatedAt })
          .from(NoteThreads).innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)));
        const accessibleSpaceIds = new Set<string>();
        for (const t of memberSpaceThreads) {
          if (!t.spaceId) continue;
          try {
            await requireSpaceAccess(t.spaceId, auth.userId);
            accessibleSpaceIds.add(t.spaceId);
          } catch {}
        }
        const memberThreads = memberSpaceThreads.filter(
          t => t.spaceId && accessibleSpaceIds.has(t.spaceId) && t.id !== 'thread_unorganized',
        );
        allThreads = [...memberThreads, ...allThreads];
      } catch {}
    }

    // Member view: NoteThreads→space thread rows can be missing while note.spaceId + Notes.threadId still point at the space thread.
    if (isMemberView && allThreads.length === 0 && note.spaceId && note.threadId && note.threadId !== 'thread_unorganized') {
      try {
        await requireSpaceAccess(note.spaceId, auth.userId);
        const fallbackThread = first(
          await db
            .select({
              id: Threads.id,
              title: Threads.title,
              subtitle: Threads.subtitle,
              color: Threads.color,
              spaceId: Threads.spaceId,
              isPublic: Threads.isPublic,
              isPinned: Threads.isPinned,
              createdAt: Threads.createdAt,
              updatedAt: Threads.updatedAt,
            })
            .from(Threads)
            .where(and(eq(Threads.id, note.threadId), eq(Threads.spaceId, note.spaceId)))
            .limit(1),
        );
        if (fallbackThread) {
          allThreads = [fallbackThread];
        }
      } catch {
        /* ignore */
      }
    }

    // Format threads with counts and backgroundGradient for nav/NotePage
    const formattedThreads = await Promise.all(allThreads.map(async (thread: any) => {
      let threadCount = 0;
      if (thread.id === 'thread_unorganized') {
        const unorganizedCountResult = first(await db.select({ count: count() })
          .from(Notes)
          .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
          .where(and(eq(Notes.userId, auth.userId), isNull(NoteThreads.id)))
          .limit(1));
        threadCount = unorganizedCountResult?.count || 0;
      } else {
        const useTotalCount = isMemberView && thread.spaceId;
        const junctionCountResult = useTotalCount
          ? first(await db.select({ count: count() }).from(NoteThreads).where(eq(NoteThreads.threadId, thread.id)).limit(1))
          : first(await db.select({ count: count() }).from(Notes)
              .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
              .where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.userId, auth.userId))).limit(1));
        threadCount = junctionCountResult?.count || 0;
      }
      return {
        ...thread,
        subtitle: thread.subtitle || 'Thread',
        count: thread.count != null ? thread.count : threadCount,
        backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color),
      };
    }));

    // Comments
    const comments = await db.select({ id: Comments.id, content: Comments.content, createdAt: Comments.createdAt, updatedAt: Comments.updatedAt })
      .from(Comments).where(and(eq(Comments.noteId, noteId), eq(Comments.userId, auth.userId))).orderBy(Comments.createdAt);

    // Tags on the note: join Tags owned by the note author (not the viewer).
    // Members viewing system-owned shared notes must see Harvous auto-tags; those Tag rows use Notes.userId.
    const noteTags = await db.select({ id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem, isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence })
      .from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, note.userId))).orderBy(Tags.name);

    // Referencing notes (for scripture notes)
    let referencingNotes: any[] = [];
    if (note.noteType === 'scripture') {
      try {
        let junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt })
          .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
          .where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId)))
          .orderBy(desc(Notes.updatedAt));

        // Heal on read
        if (junctionEntries.length === 0) {
          try {
            const notesWithPill = await db.select({ id: Notes.id }).from(Notes)
              .where(and(eq(Notes.userId, auth.userId), ne(Notes.noteType, 'scripture'), like(Notes.content, `%data-note-id="${noteId}"%`)));
            for (const refNote of notesWithPill) {
              try {
                const ex = first(await db.select().from(NoteScriptureReferences).where(and(eq(NoteScriptureReferences.noteId, refNote.id), eq(NoteScriptureReferences.scriptureNoteId, noteId))).limit(1));
                if (!ex) await db.insert(NoteScriptureReferences).values({ id: `note-scripture-${refNote.id}-${noteId}-${Date.now()}`, noteId: refNote.id, scriptureNoteId: noteId, createdAt: nowISO() });
              } catch {}
            }
            if (notesWithPill.length > 0) {
              junctionEntries = await db.select({ id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt })
                .from(NoteScriptureReferences).innerJoin(Notes, eq(NoteScriptureReferences.noteId, Notes.id))
                .where(and(eq(NoteScriptureReferences.scriptureNoteId, noteId), eq(Notes.userId, auth.userId)))
                .orderBy(desc(Notes.updatedAt));
            }
          } catch {}
        }

        // Resource metadata for referencing notes
        const resourceNoteIds = junctionEntries.filter(e => e.noteType === 'resource').map(e => e.id);
        let resourceMetadataMap: Record<string, any> = {};
        if (resourceNoteIds.length > 0) {
          try {
            const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
              .from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
            resourceMetadataMap = Object.fromEntries(rmList.map(m => [m.noteId, m]));
          } catch {}
        }

        referencingNotes = junctionEntries.map(entry => {
          const rm = entry.noteType === 'resource' ? resourceMetadataMap[entry.id] : null;
          return { ...entry, noteType: entry.noteType || 'default', resourceTitle: rm?.sourceTitle || null, resourceDescription: rm?.sourceDescription || null, resourceImage: rm?.sourceImage || null };
        });
      } catch { referencingNotes = []; }
    }

    let linkedFromNotes: any[] = [];
    const linkedFromId = note.linkedFromNoteId;
    if (linkedFromId && note.noteType === 'default' && !isMemberView && note.userId === auth.userId) {
      try {
        const src = first(await db.select({
          id: Notes.id, title: Notes.title, content: Notes.content, simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType, createdAt: Notes.createdAt, updatedAt: Notes.updatedAt,
        })
          .from(Notes)
          .where(and(eq(Notes.id, linkedFromId), eq(Notes.userId, note.userId)))
          .limit(1));
        if (src) {
          let lfResourceTitle: string | null = null, lfResourceDescription: string | null = null, lfResourceImage: string | null = null;
          if (src.noteType === 'resource') {
            try {
              const rm = first(await db.select({ sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
                .from(ResourceMetadata).where(eq(ResourceMetadata.noteId, src.id)).limit(1));
              lfResourceTitle = rm?.sourceTitle || null;
              lfResourceDescription = rm?.sourceDescription || null;
              lfResourceImage = rm?.sourceImage || null;
            } catch { /* ignore */ }
          }
          linkedFromNotes = [{
            ...src,
            noteType: src.noteType || 'default',
            resourceTitle: lfResourceTitle,
            resourceDescription: lfResourceDescription,
            resourceImage: lfResourceImage,
          }];
        }
      } catch { linkedFromNotes = []; }
    }

    return c.json({
      success: true,
      note: { ...note, simpleNoteId: note.simpleNoteId ?? null, contentEncrypted: note.contentEncrypted || false, noteType: note.noteType || 'default', addedBy: note.addedBy || 'user', version, resourceTitle, resourceDescription, resourceImage },
      threads: formattedThreads,
      allUserThreads: selectableUserThreads.map(t => ({ id: t.id, title: t.title, color: t.color, isPublic: t.isPublic, createdAt: t.createdAt, updatedAt: t.updatedAt })),
      comments: comments.map(c => ({ id: c.id, content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt })),
      tags: noteTags.map(t => ({ id: t.id, name: t.name, color: t.color, category: t.category, isSystem: t.isSystem, isAutoGenerated: t.isAutoGenerated, confidence: t.confidence })),
      referencingNotes,
      linkedFromNotes,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/details', action: 'get_note_details' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/:id/update-content ─────────────────────────────────────
route.post('/api/notes/:id/update-content', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const id = requireParam(c, 'id');
    const { content, contentEncrypted } = await c.req.json();
    if (!content || typeof content !== 'string') return c.json({ success: false, error: 'Content is required' }, 400);

    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).limit(1));
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
route.post('/api/notes/:id/add-thread', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const id = requireParam(c, 'id');
    const { threadId } = await c.req.json();
    if (!threadId) return c.json({ success: false, error: 'Thread ID is required' }, 400);
    if (threadId.startsWith('thread_onboarding_')) return c.json({ success: false, error: "This thread doesn't take new notes." }, 400);

    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).limit(1));
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const targetThread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
    if (!targetThread) return c.json({ success: false, error: 'Target thread not found' }, 404);

    const existingRelation = first(await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId))).limit(1));
    if (existingRelation) return c.json({ success: true, alreadyInThread: true });

    const existingThreadRelations = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, id));
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
route.post('/api/notes/:id/remove-thread', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const id = requireParam(c, 'id');
    const { threadId } = await c.req.json();
    if (!threadId) return c.json({ success: false, error: 'Thread ID is required' }, 400);

    // Find note owned by current user, or fall back to Harvous admin notes in user-owned threads
    let note = first(await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId))).limit(1));
    let isAdminNote = false;

    if (!note) {
      let systemUserId: string | null = null;
      try { systemUserId = getHarvousSystemUserId(); } catch { /* env not set */ }
      if (systemUserId) {
        const adminNote = first(await db.select().from(Notes).where(and(eq(Notes.id, id), eq(Notes.userId, systemUserId))).limit(1));
        if (adminNote) {
          // Allow removal only when the thread being removed is owned by this user
          const userThread = first(await db.select({ id: Threads.id }).from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
          if (userThread) { note = adminNote; isAdminNote = true; }
        }
      }
    }

    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const existingRelation = first(await db.select().from(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId))).limit(1));
    if (!existingRelation) return c.json({ success: false, error: 'Note is not in this thread' }, 400);

    try {
      await db.delete(NoteThreads).where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)));

      if (isAdminNote) {
        // Admin note: check whether the user still has any of their own threads for this note
        const remainingUserThreads = await db
          .select({ threadId: NoteThreads.threadId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, id), eq(Threads.userId, auth.userId)));
        if (remainingUserThreads.length === 0) {
          // Move to unorganized via a junction row so details API returns it correctly
          await ensureUnorganizedThread(auth.userId);
          await db.insert(NoteThreads)
            .values({ id: generateTimestampId('notethread'), noteId: id, threadId: 'thread_unorganized', createdAt: nowISO() })
            .onConflictDoNothing();
        }
        // Do NOT update Notes.threadId — that's the system note's primary home
      } else {
        const remainingThreads = await db.select().from(NoteThreads).where(eq(NoteThreads.noteId, id));
        if (remainingThreads.length === 0) {
          await ensureUnorganizedThread(auth.userId);
          await db.update(Notes).set({ threadId: 'thread_unorganized' }).where(eq(Notes.id, id));
        } else if (note.threadId === threadId) {
          // If removed thread was the primary, update to next remaining thread
          await db.update(Notes).set({ threadId: remainingThreads[0].threadId }).where(eq(Notes.id, id));
        }
        removeScriptureNotesFromThread(id, threadId, auth.userId).catch(() => {});
      }
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
route.post('/api/notes/:id/process-scripture-references', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'id');

    const noteRow = first(await db.select({ id: Notes.id, userId: Notes.userId, spaceId: Notes.spaceId, content: Notes.content }).from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!noteRow) return c.json({ error: 'Note not found' }, 404);

    if (noteRow.userId !== auth.userId) {
      let spaceIdForAccess = noteRow.spaceId;
      if (!spaceIdForAccess) {
        const threadWithSpace = first(await db.select({ spaceId: Threads.spaceId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
          .limit(1));
        spaceIdForAccess = threadWithSpace?.spaceId ?? null;
      }
      if (!spaceIdForAccess) return c.json({ error: 'Note not found' }, 404);
      try {
        await requireSpaceAccess(spaceIdForAccess, auth.userId);
      } catch {
        return c.json({ error: 'Note not found' }, 404);
      }
    }

    let threadId: string | undefined;
    let contentOverride: string | undefined;
    let translation: string | undefined;
    try {
      const body = await c.req.json();
      threadId = body?.threadId;
      contentOverride = body?.contentOverride;
      translation = body?.translation;
    } catch {
      // Empty or invalid JSON body is ok; processScriptureReferences will read from DB
    }
    // Always run as the note owner: lookups, scripture child notes, and metadata are keyed to Notes.userId.
    // Space members may trigger processing for admin/system-owned shared notes; content updates apply for everyone.
    const result = await processScriptureReferences(noteId, noteRow.userId, threadId, contentOverride, translation || 'NET');
    return c.json(result);
  } catch (error: any) {
    console.error('Error processing scripture references:', error);
    return c.json({ error: error.message || 'Error processing scripture references' }, 500);
  }
});

// ─── POST /api/notes/:noteId/visit ──────────────────────────────────────────
route.post('/api/notes/:noteId/visit', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let noteId = requireParam(c, 'noteId');
    if (noteId.startsWith('note/')) noteId = 'note_' + noteId.slice(5);

    const note = first(await db.select({ id: Notes.id, userId: Notes.userId, spaceId: Notes.spaceId }).from(Notes).where(eq(Notes.id, noteId)).limit(1));
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== auth.userId) {
      let spaceIdForAccess = note.spaceId;
      if (!spaceIdForAccess) {
        const threadWithSpace = first(await db.select({ spaceId: Threads.spaceId })
          .from(NoteThreads)
          .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
          .where(and(eq(NoteThreads.noteId, noteId), isNotNull(Threads.spaceId)))
          .limit(1));
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
route.get('/api/notes/:noteId/share', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'noteId');

    const note = first(await db.select({ id: Notes.id, isPublic: Notes.isPublic, shareToken: Notes.shareToken, shareTokenCreatedAt: Notes.shareTokenCreatedAt, userId: Notes.userId, noteType: Notes.noteType, contentEncrypted: Notes.contentEncrypted })
      .from(Notes).where(eq(Notes.id, noteId)).limit(1));
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
route.post('/api/notes/:noteId/share', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = requireParam(c, 'noteId');

    const { action } = await c.req.json();
    if (!action || !['enable', 'disable', 'refresh'].includes(action)) return c.json({ error: 'Invalid action' }, 400);

    const note = first(await db.select({ id: Notes.id, isPublic: Notes.isPublic, shareToken: Notes.shareToken, userId: Notes.userId, contentEncrypted: Notes.contentEncrypted })
      .from(Notes).where(eq(Notes.id, noteId)).limit(1));
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
