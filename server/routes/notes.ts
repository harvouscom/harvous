/**
 * Notes routes — Hono port of src/pages/api/notes/*.ts
 *
 * Endpoints:
 *   POST /api/notes/create
 *   PUT  /api/notes/update
 *   DELETE /api/notes/delete
 *   GET  /api/notes/next-id
 *   POST /api/notes/connect-link
 *   DELETE /api/notes/connect-link
 *   POST /api/notes/migrate-connections
 *   GET  /api/notes/recent
 *   POST /api/notes/auto-tags
 *   POST /api/notes/cleanup-upgrade-note
 *   DELETE /api/notes/delete-all-unorganized
 *   POST /api/notes/suggest-threads
 *   GET  /api/notes/:id/tags
 *   GET  /api/notes/:id/details
 *   GET  /api/notes/:id/thread
 *   PATCH /api/notes/:id/thread/member-order
 *   POST /api/notes/:id/update-content
 *   POST /api/notes/:id/add-thread
 *   POST /api/notes/:id/remove-thread
 *   POST /api/notes/:id/process-scripture-references
 *   POST /api/notes/:noteId/inline-image
 *   GET  /api/notes/:noteId/share
 *   POST /api/notes/:noteId/share
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Notes, Threads, NoteThreads, StudyThreadEntries, Comments, Tags, NoteTags,
  UserMetadata, ScriptureMetadata, NoteScriptureReferences, NoteConnections, StudyThreadMemberOrders, ResourceMetadata, Spaces,
  eq, and, or, ne, desc, asc, count, like, not, isNull, isNotNull, inArray, sql,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import { generateNoteId, generateShareToken, generateTimestampId } from '@/utils/ids';
import { getHarvousSystemUserId } from '../utils/harvous-admin';
import { handleAPIError } from '@/utils/error-handling';
import { validateContent, validateNoteType, validateThreadId, validateSpaceId, normalizeUrl, extractDomain, validateResourceUrl } from '@/utils/validation';
import { pickStudyThreadRepresentativeNoteId, type StudyThreadSuggestNode } from '@/utils/suggest-study-thread-title';
import { normalizeServerNoteId } from '../utils/normalize-note-id';
import { fetchStudyThreadNoteRows } from '../utils/study-thread-note-rows';
import { resolveStudyThreadClusterNaming } from '../utils/study-thread-cluster-naming';
import { collectStudyThreadGraphForScope } from '../utils/study-thread-space';
import {
  fetchStudyThreadMemberOrder,
  upsertStudyThreadMemberOrder,
  appendStudyThreadMemberOrderOnConnect,
  removeStudyThreadMemberOrderOnDisconnect,
} from '../utils/study-thread-member-order';
import { migrateLinkedFromNoteConnectionsForUser } from '../utils/prototype-user-migration';
import { isStudyThreadNamingColumnMissing } from '../utils/pg-undefined-relation';
import { rateLimit, rateLimitNoteCreate } from '@/utils/rate-limit';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { findKeywordsInText } from '@/utils/bible-study-keywords';
import { conceptOverlaps } from '@/utils/bible-study-concept-overlaps';
import { rankThreadSuggestions, scoreThreadKeywordOverlap } from '@/utils/thread-suggestion-ranking';
import { getRelatedNotesForPassages, getNotePassages, type VerseKey } from '../utils/scripture-knowledge';
import { detectVerseKeysFromNoteText } from '../utils/detect-note-passages';
import { debug } from '@/utils/logger';
import { getCurrentSeason } from '@/utils/season-helpers';
import { getThreadGradientCSS } from '@/utils/colors';
import { awardCreationBonusXP, awardNoteCreatedXP, awardStudyThreadClusterCreatedXPIfNew, revokeXPOnDeletion, revokeAllXPForItem } from '../utils/xp-system';
import { countStudyThreadClustersForUser } from '../utils/study-thread-cluster-count';
import { generateAutoTags, applyAutoTags, removeAutoTags, regenerateAutoTags } from '../utils/auto-tag-generator';
import { processScriptureReferences } from '../utils/process-scripture-references';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import { formatNoteDefaultTitle } from '@/utils/date-formatting';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';
import { moveScriptureNotesToThread } from '../utils/move-scripture-notes-to-thread';
import { healScriptureNoteThreadsFromParents } from '../utils/heal-scripture-note-threads';
import { removeScriptureNotesFromThread } from '../utils/remove-scripture-notes-from-thread';
import { requireSpaceAccess, SpaceAccessError, canAuthorInSpace, canManageSpaceStructure } from '../utils/space-access';
import { batchAuthorAttribution } from '../utils/dashboard-data';
import { mapStudyRow } from './study-threads';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { extractArticleContent } from '@/utils/content-extractor';
import { sortByLastVisited } from '@/utils/sorting';
import { broadcastInvalidation } from '../utils/realtime';
import { broadcastNoteInvalidation } from '../utils/broadcast-shared-space-note';
import { stripHtml } from '@/utils/html-stripper';
import { deleteNotesCascadeForUser, deleteSingleNoteCascadeForUser } from '../utils/delete-note-cascade';
import { isOnboardingSystemNote } from '../utils/purge-onboarding-content';
import { recordDeletedEntities } from '../utils/sync-deletion-log';
import { getUserNoteFingerprints } from '../utils/note-fingerprint';
import { getCrossRefGaps } from '../utils/crossref-gaps';
import { tryRecordVotdAddNoteFromCreatedNote } from '../utils/votd-record-engagement';
import { getConnectSuggestions } from '../utils/connect-suggestions';
import { recordNoteRecallEngaged } from '../utils/note-recall-state';
import {
  dedupeNoteTagsForResponse,
  fetchNoteTagsForResponse,
  parseDismissedAutoTags,
  dismissedAutoTagsForNote,
  autoTagExcludeNames,
  serializeDismissedAutoTags,
} from '../utils/tag-helpers';
import { folderLabelsForTagExclusion } from '@/utils/bible-study-concept-overlaps';
import {
  normalizeSecondaryLabels,
  parseNoteSecondaryCollections,
  serializeNoteSecondaryCollections,
} from '../utils/note-secondary-collections';
const route = new Hono();

function noteJsonWithParsedSecondaries<T extends { secondaryCollections?: string | null; dismissedAutoTags?: string | null }>(note: T) {
  const raw = note.secondaryCollections;
  return {
    ...note,
    secondaryCollections: parseNoteSecondaryCollections(raw ?? null),
    dismissedAutoTags: parseDismissedAutoTags(note.dismissedAutoTags),
  };
}

function folderExcludeLabelsForNote(note: {
  primaryCollection?: string | null;
  secondaryCollections?: string | null | string[];
}): string[] {
  const secondaries = Array.isArray(note.secondaryCollections)
    ? note.secondaryCollections
    : parseNoteSecondaryCollections(note.secondaryCollections);
  return folderLabelsForTagExclusion(note.primaryCollection, secondaries);
}

function autoTagExcludeOptionsForNote(note: {
  primaryCollection?: string | null;
  secondaryCollections?: string | null | string[];
  dismissedAutoTags?: string | null;
}): { excludeLabels: string[]; excludeTagNames: string[] } {
  const folderLabels = folderExcludeLabelsForNote(note);
  const dismissed = dismissedAutoTagsForNote(note);
  return {
    excludeLabels: folderLabels,
    excludeTagNames: autoTagExcludeNames(folderLabels, dismissed),
  };
}

function normalizeOwnedNoteSpaceId(spaceId: string | null): string | null {
  if (!spaceId || !spaceId.trim()) return null;
  const t = spaceId.trim();
  return t.startsWith('space_') ? t : `space_${t}`;
}

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

    const normalizedContent = canonicalizeNoteHtmlLineBreaks(content || '');
    const capitalizedContent =
      normalizedContent && normalizedContent.length > 0
        ? normalizedContent.charAt(0).toUpperCase() + normalizedContent.slice(1)
        : normalizedContent;

    let capitalizedTitle: string;
    if (!title || !title.trim()) {
      capitalizedTitle = truncateAndCapitalizeTitle(formatNoteDefaultTitle(new Date()));
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
    let finalSpaceId: string | null = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') {
      finalSpaceId = spaceId.trim().startsWith('space_') ? spaceId.trim() : `space_${spaceId.trim()}`;
      let targetSpace;
      try {
        targetSpace = await requireSpaceAccess(finalSpaceId, auth.userId);
      } catch (err) {
        if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
        throw err;
      }
      if (!canAuthorInSpace(targetSpace.space, targetSpace.role)) {
        return c.json({ error: 'You cannot add notes to this space', code: 'FORBIDDEN' }, 403);
      }
      if (contentEncrypted && targetSpace.space.type !== 'personal') {
        return c.json({ error: "Locked notes can't be created in shared spaces", code: 'LOCKED_NOTE_IN_SHARED_SPACE' }, 400);
      }
    }

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
      updatedAt: now,
      lastVisited: now,
      linkedFromNoteId: resolvedLinkedFromNoteId,
    }).returning())!;

    await db.update(UserMetadata)
      .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() })
      .where(eq(UserMetadata.userId, auth.userId));

    // Mirror create-from-highlight link into the NoteConnections graph.
    if (resolvedLinkedFromNoteId) {
      try {
        await db.insert(NoteConnections).values({
          id: generateNoteId(),
          fromNoteId: resolvedLinkedFromNoteId,
          toNoteId: newNote.id,
          userId: auth.userId,
          spaceId: finalSpaceId ?? null,
          createdAt: nowISO(),
        });
      } catch {
        // Duplicate or constraint error — connection already exists, safe to ignore.
      }
    }

    let noteStaysInUnorganized = true;

    if (threadId && threadId.trim() !== '' && threadId !== 'thread_unorganized' && !threadId.startsWith('thread_onboarding_')) {
      try {
        const targetThread = first(await db.select().from(Threads).where(eq(Threads.id, threadId)).limit(1));
        const canAttachToOwnThread = targetThread?.userId === auth.userId;
        const canAttachToSpaceThread =
          Boolean(targetThread?.spaceId && finalSpaceId && targetThread.spaceId === finalSpaceId);
        if (targetThread && (canAttachToOwnThread || canAttachToSpaceThread)) {
          if (canAttachToSpaceThread && finalSpaceId) {
            await requireSpaceAccess(finalSpaceId, auth.userId);
          }
          const junctionId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(NoteThreads).values({ id: junctionId, noteId: newNote.id, threadId, createdAt: nowISO() });
          await db.update(Notes).set({ threadId }).where(eq(Notes.id, newNote.id));
          if (canAttachToOwnThread) {
            await db.update(Threads).set({ updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
          } else {
            await db.update(Threads).set({ updatedAt: nowISO() }).where(eq(Threads.id, threadId));
          }
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

    // Non-critical: XP (creation bonus + note-created; UI may hide XP but stats keep recording)
    try {
      await awardCreationBonusXP(auth.userId, 'note');
    } catch {}
    awardNoteCreatedXP(auth.userId, newNote.id, isScriptureNote, capitalizedContent || content || '').catch(() => {});

    // Reload note
    const finalNote = first(await db.select().from(Notes).where(eq(Notes.id, newNote.id)).limit(1));
    if (finalNote) Object.assign(newNote, finalNote);

    // Auto-tag — await so create response includes tags (native parity).
    if (finalNoteType !== 'resource' && !contentEncrypted) {
      try {
        const tagExcludes = autoTagExcludeOptionsForNote(finalNote ?? newNote);
        const r = await generateAutoTags(capitalizedTitle || '', capitalizedContent, auth.userId, 0.7, tagExcludes);
        if (r.suggestions.length > 0) await applyAutoTags(newNote.id, r.suggestions, auth.userId);
      } catch (err) {
        console.error('[auto-tag] Failed to auto-tag new note:', newNote.id, err);
      }
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
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://app.harvous.com)', Accept: 'text/html,application/xhtml+xml' },
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
            const tagExcludes = autoTagExcludeOptionsForNote(newNote);
            const r = await generateAutoTags(titleForTagging, contentForTagging, auth.userId, 0.8, tagExcludes);
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

    let createTags: Awaited<ReturnType<typeof fetchNoteTagsForResponse>> = [];
    if (!contentEncrypted) {
      try {
        createTags = await fetchNoteTagsForResponse(newNote.id, auth.userId);
      } catch (err) {
        console.error('[auto-tag] Failed to load tags for create response:', newNote.id, err);
      }
    }

    void broadcastNoteInvalidation(auth.userId, newNote.spaceId, {
      type: 'note:created',
      id: newNote.id,
      note: {
        spaceId: newNote.spaceId,
        title: newNote.title,
        content: newNote.content,
        updatedAt: newNote.updatedAt ?? newNote.createdAt,
      },
    });

    void tryRecordVotdAddNoteFromCreatedNote(auth.userId, {
      title: newNote.title,
      content: newNote.content,
      createdAt: newNote.createdAt,
    }).catch(() => {});

    return c.json({
      success: 'Note created!',
      note: noteJsonWithParsedSecondaries(newNote as { secondaryCollections?: string | null }),
      tags: createTags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        category: t.category,
        isSystem: t.isSystem,
        isAutoGenerated: t.isAutoGenerated,
        confidence: t.confidence,
      })),
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
    const {
      noteId,
      title,
      content,
      resourceImage,
      contentEncrypted,
      scriptureVersion,
      isPinned: isPinnedRaw,
      primaryCollection: primaryCollectionRaw,
      secondaryCollections: secondaryCollectionsRaw,
      collectionPinned: collectionPinnedRaw,
      collectionUserOverride: collectionUserOverrideRaw,
      dismissedAutoTags: dismissedAutoTagsRaw,
      bumpUpdatedAt: bumpUpdatedAtRaw,
    } = body;
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const contentValidation = validateContent(content, true);
    if (!contentValidation.isValid) return c.json({ error: contentValidation.error, code: contentValidation.code }, 400);

    const existingNote = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    if (!existingNote) return c.json({ error: 'Note not found' }, 404);
    if (isOnboardingSystemNote(existingNote)) {
      return c.json({ error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
    }

    const isEncrypted = contentEncrypted === true;
    const contentForStore = isEncrypted
      ? content
      : canonicalizeNoteHtmlLineBreaks(typeof content === 'string' ? content : '');
    const capitalizedContent = isEncrypted
      ? contentForStore
      : contentForStore.charAt(0).toUpperCase() + contentForStore.slice(1);
    const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;

    // Only bump updatedAt when the note's actual content changed. Folder/pin/tag/collection edits are
    // metadata and must not churn the "last updated" sort order. Critically, this is also the endpoint
    // the native sync push (flushNoteUpdate) and the web editor both flush through — so an auto-folder
    // assignment applied merely by *opening* a note must not re-stamp updatedAt here.
    //
    // The client may explicitly pass `bumpUpdatedAt: false` for normalization-only / cleanup saves
    // (e.g. link-stripping, pill hydration) that should persist content without reordering lists.
    // updatedAt doubles as the sync watermark, so suppressing it means the change won't propagate via
    // delta sync until the next real edit — acceptable for deterministic normalization (recomputed per
    // device).
    const titleChanged = capitalizedTitle !== existingNote.title;
    const contentChanged = capitalizedContent !== existingNote.content;
    const encryptionToggled =
      typeof contentEncrypted === 'boolean' && contentEncrypted !== existingNote.contentEncrypted;
    const contentTouched = titleChanged || contentChanged || encryptionToggled;
    const shouldBumpUpdatedAt = bumpUpdatedAtRaw === false ? false : contentTouched;

    const updateData: any = { title: capitalizedTitle, content: capitalizedContent };
    if (shouldBumpUpdatedAt) updateData.updatedAt = nowISO();
    let nextPrimaryForSecondaries: string | null = existingNote.primaryCollection ?? null;
    if (primaryCollectionRaw !== undefined) {
      updateData.primaryCollection =
        typeof primaryCollectionRaw === 'string' && primaryCollectionRaw.trim().length > 0
          ? primaryCollectionRaw.trim()
          : null;
      nextPrimaryForSecondaries = updateData.primaryCollection;
    }
    if (secondaryCollectionsRaw !== undefined) {
      const arr = Array.isArray(secondaryCollectionsRaw)
        ? secondaryCollectionsRaw.filter((x: unknown): x is string => typeof x === 'string')
        : [];
      updateData.secondaryCollections = serializeNoteSecondaryCollections(
        normalizeSecondaryLabels(arr, nextPrimaryForSecondaries),
      );
    } else if (primaryCollectionRaw !== undefined) {
      const parsed = parseNoteSecondaryCollections(existingNote.secondaryCollections);
      updateData.secondaryCollections = serializeNoteSecondaryCollections(
        normalizeSecondaryLabels(parsed, nextPrimaryForSecondaries),
      );
    }
    if (isPinnedRaw !== undefined) {
      updateData.isPinned = Boolean(isPinnedRaw);
    }
    if (collectionPinnedRaw !== undefined) {
      updateData.collectionPinned = Boolean(collectionPinnedRaw);
    }
    if (collectionUserOverrideRaw !== undefined) {
      updateData.collectionUserOverride = Boolean(collectionUserOverrideRaw);
    }
    if (dismissedAutoTagsRaw !== undefined) {
      const arr = Array.isArray(dismissedAutoTagsRaw)
        ? dismissedAutoTagsRaw.filter((x: unknown): x is string => typeof x === 'string')
        : [];
      updateData.dismissedAutoTags = serializeDismissedAutoTags(arr);
    }
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

    // Update thread timestamps — single bulk UPDATE instead of N sequential round trips.
    const noteThreads = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    const threadIdsToTouch = noteThreads.map((nt) => nt.threadId);
    if (shouldBumpUpdatedAt && threadIdsToTouch.length > 0) {
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(inArray(Threads.id, threadIdsToTouch), eq(Threads.userId, auth.userId)));
    }

    // Re-tag only when title or body changed AND updatedAt is being bumped (a real edit, not
    // normalization-only) — folder/pin edits and non-bumping saves must not churn tags.
    if (!isEncrypted && shouldBumpUpdatedAt && (titleChanged || contentChanged)) {
      try {
        const tagExcludes = autoTagExcludeOptionsForNote(updatedNote);
        const r = await generateAutoTags(capitalizedTitle || '', capitalizedContent, auth.userId, 0.7, tagExcludes);
        if (r.suggestions.length > 0) {
          await removeAutoTags(noteId);
          await applyAutoTags(noteId, r.suggestions, auth.userId);
        }
      } catch (err) {
        console.error('[auto-tag] Failed to re-tag note:', noteId, err);
      }
    }

    // Update resource image
    if (existingNote.noteType === 'resource' && resourceImage !== undefined) {
      try {
        const rm = first(await db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, noteId)).limit(1));
        if (rm) await db.update(ResourceMetadata).set({ sourceImage: resourceImage || null }).where(eq(ResourceMetadata.noteId, noteId));
      } catch {}
    }

    // Scripture processing — deferred (fire-and-forget), mirroring /create. The
    // durable note write above already persisted the user's content; running the
    // 2–5s scripture pass inside the response made every autosave round-trip wait,
    // delaying the optimistic cache patch, tag merge, sidebar/folder-chip update,
    // and the classic-editor save spinner. Pills render instantly client-side; the
    // server pass links them to scripture child-notes + verse text. The
    // reprocess-on-view safety net (PrototypeNotePage / NotePage) plus the
    // note:updated broadcast below settle the linked state shortly after.
    if (!isEncrypted) {
      const contentToProcess = capitalizedContent;
      (async () => {
        try {
          // Omit threadId so processScriptureReferences resolves every NoteThreads row for this note (multi-thread)
          const scriptureResult = await processScriptureReferences(noteId, auth.userId, undefined, contentToProcess, scriptureVersion || 'NET');
          // Notify clients so the linked pills + verse text land without a manual refresh.
          // Carry the processed HTML so listeners can patch in place (no refetch).
          const processed = scriptureResult?.updatedContent;
          void broadcastNoteInvalidation(auth.userId, existingNote.spaceId, {
            type: 'note:updated',
            id: noteId,
            ...(typeof processed === 'string' && processed.length > 0
              ? { note: { content: processed, updatedAt: new Date().toISOString(), spaceId: existingNote.spaceId } }
              : { note: { spaceId: existingNote.spaceId } }),
          });
        } catch (err: any) {
          console.error('[api/notes/update] Background scripture processing failed:', err?.message ?? err);
        }
      })().catch((err) => console.error('[api/notes/update] Unhandled background scripture error:', noteId, err));
    }

    let updateTags: Awaited<ReturnType<typeof fetchNoteTagsForResponse>> = [];
    if (!isEncrypted) {
      try {
        updateTags = await fetchNoteTagsForResponse(noteId, auth.userId);
      } catch (err) {
        console.error('[auto-tag] Failed to load tags for update response:', noteId, err);
      }
    }

    const tagsPatch = updateTags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      category: t.category,
      isSystem: t.isSystem,
      isAutoGenerated: t.isAutoGenerated,
      confidence: t.confidence,
    }));

    // Carry the changed fields so other devices patch their caches in place instead
    // of refetching. Scripture-linked HTML follows in the deferred broadcast above.
    void broadcastNoteInvalidation(auth.userId, updatedNote.spaceId, {
      type: 'note:updated',
      id: noteId,
      note: {
        title: updatedNote.title,
        content: capitalizedContent,
        updatedAt: updatedNote.updatedAt instanceof Date
          ? updatedNote.updatedAt.toISOString()
          : (typeof updatedNote.updatedAt === 'string' ? updatedNote.updatedAt : new Date().toISOString()),
        spaceId: updatedNote.spaceId ?? null,
        threadIds: threadIdsToTouch,
        tags: tagsPatch,
      },
    });

    return c.json({
      success: 'Note updated!',
      note: noteJsonWithParsedSecondaries(updatedNote),
      tags: tagsPatch,
      // Scripture now runs in the background (see above). These remain for client
      // back-compat: callers fall back to their own content + reprocess-on-view.
      scriptureResults: [],
      processedContent: null,
      scriptureProcessingError: false,
      scriptureDeferred: true,
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to update note' }, 500);
  }
});

// ─── POST /api/notes/connect-link ─────────────────────────────────────────────
// Creates an edge in the NoteConnections graph (many-to-many, cycles allowed).
route.post('/api/notes/connect-link', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parentNoteId = typeof body.parentNoteId === 'string' ? body.parentNoteId.trim() : '';
    const linkedNoteId = typeof body.linkedNoteId === 'string' ? body.linkedNoteId.trim() : '';
    if (!parentNoteId || !linkedNoteId) {
      return c.json({ success: false, error: 'parentNoteId and linkedNoteId are required', code: 'INVALID_BODY' }, 400);
    }
    if (parentNoteId === linkedNoteId) {
      return c.json({ success: false, error: 'Cannot connect a note to itself', code: 'SELF_LINK' }, 400);
    }

    const parent = first(
      await db.select({ id: Notes.id, threadId: Notes.threadId, noteType: Notes.noteType, addedBy: Notes.addedBy, spaceId: Notes.spaceId })
        .from(Notes).where(and(eq(Notes.id, parentNoteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    const linked = first(
      await db.select({ id: Notes.id, threadId: Notes.threadId, noteType: Notes.noteType, addedBy: Notes.addedBy, spaceId: Notes.spaceId })
        .from(Notes).where(and(eq(Notes.id, linkedNoteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    if (!parent || !linked) {
      return c.json({ success: false, error: 'Note not found', code: 'NOT_FOUND' }, 404);
    }
    if (isOnboardingSystemNote(parent) || isOnboardingSystemNote(linked)) {
      return c.json({ success: false, error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
    }
    if ((parent.noteType || 'default') !== 'default' || (linked.noteType || 'default') !== 'default') {
      return c.json({ success: false, error: 'Only default notes can be linked.', code: 'INVALID_NOTE_TYPE' }, 400);
    }

    const clusterCountBefore = await countStudyThreadClustersForUser(auth.userId);

    // Insert edge — unique constraint handles the "already linked" case.
    const spaceId =
      normalizeOwnedNoteSpaceId(parent.spaceId ?? null) ??
      normalizeOwnedNoteSpaceId(linked.spaceId ?? null) ??
      null;

    if (spaceId) {
      try {
        const linkAccess = await requireSpaceAccess(spaceId, auth.userId);
        if (
          linkAccess.space.type !== 'personal' &&
          !canManageSpaceStructure(linkAccess.space, linkAccess.role)
        ) {
          return c.json({
            success: false,
            error: 'Only the space owner can create study thread links in a shared space',
            code: 'FORBIDDEN',
          }, 403);
        }
      } catch (err) {
        if (err instanceof SpaceAccessError) {
          return c.json({ success: false, error: err.message, code: err.code }, err.status);
        }
        throw err;
      }
    }

    try {
      await db.insert(NoteConnections).values({
        id: generateNoteId(),
        fromNoteId: parentNoteId,
        toNoteId: linkedNoteId,
        userId: auth.userId,
        spaceId,
        createdAt: nowISO(),
      });
    } catch (err: any) {
      // Unique constraint violation = already connected.
      if (err?.code === '23505' || err?.message?.includes('unique') || err?.message?.includes('duplicate')) {
        if (spaceId) {
          await db
            .update(NoteConnections)
            .set({ spaceId })
            .where(
              and(
                eq(NoteConnections.fromNoteId, parentNoteId),
                eq(NoteConnections.toNoteId, linkedNoteId),
                eq(NoteConnections.userId, auth.userId),
                isNull(NoteConnections.spaceId),
              ),
            );
        }
        return c.json({ success: true, alreadyLinked: true });
      }
      throw err;
    }

    const clusterCountAfter = await countStudyThreadClustersForUser(auth.userId);
    awardStudyThreadClusterCreatedXPIfNew(
      auth.userId,
      clusterCountBefore,
      clusterCountAfter,
      parentNoteId,
    ).catch(() => {});

    try {
      const { graph } = await collectStudyThreadGraphForScope(parentNoteId, auth.userId, {
        preferredSpaceId: spaceId ?? undefined,
        maxNodes: 200,
      });
      const repNoteId =
        pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? parentNoteId;
      await appendStudyThreadMemberOrderOnConnect(
        repNoteId,
        auth.userId,
        [linkedNoteId],
        graph.nodeIds,
      );
    } catch {
      /* member order is best-effort */
    }

    broadcastInvalidation(auth.userId, { type: 'note:updated', id: parentNoteId });
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: linkedNoteId });
    return c.json({ success: true });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/connect-link', action: 'connect_link' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/notes/connect-link ──────────────────────────────────────────
// Removes an edge from the NoteConnections graph.
route.delete('/api/notes/connect-link', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const fromNoteId = typeof body.fromNoteId === 'string' ? body.fromNoteId.trim() : '';
    const toNoteId = typeof body.toNoteId === 'string' ? body.toNoteId.trim() : '';
    if (!fromNoteId || !toNoteId) {
      return c.json({ success: false, error: 'fromNoteId and toNoteId are required', code: 'INVALID_BODY' }, 400);
    }

    const existing = first(
      await db.select({ id: NoteConnections.id })
        .from(NoteConnections)
        .where(and(
          eq(NoteConnections.fromNoteId, fromNoteId),
          eq(NoteConnections.toNoteId, toNoteId),
          eq(NoteConnections.userId, auth.userId),
        ))
        .limit(1),
    );

    await db.delete(NoteConnections)
      .where(and(
        eq(NoteConnections.fromNoteId, fromNoteId),
        eq(NoteConnections.toNoteId, toNoteId),
        eq(NoteConnections.userId, auth.userId),
      ));

    if (existing) {
      await recordDeletedEntities(auth.userId, 'noteConnection', [existing.id]);
    }

    try {
      const { graph } = await collectStudyThreadGraphForScope(fromNoteId, auth.userId, { maxNodes: 200 });
      const repNoteId =
        pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? fromNoteId;
      const memberSet = new Set(graph.nodeIds);
      if (!memberSet.has(fromNoteId)) {
        await removeStudyThreadMemberOrderOnDisconnect(repNoteId, auth.userId, fromNoteId);
      }
      if (!memberSet.has(toNoteId)) {
        await removeStudyThreadMemberOrderOnDisconnect(repNoteId, auth.userId, toNoteId);
      }
    } catch {
      /* member order is best-effort */
    }

    broadcastInvalidation(auth.userId, { type: 'note:updated', id: fromNoteId });
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: toNoteId });
    return c.json({ success: true });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/connect-link', action: 'disconnect_link' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/migrate-connections ─────────────────────────────────────
// One-time, idempotent backfill: creates NoteConnections rows from all existing
// Notes.linkedFromNoteId values for the authenticated user.
route.post('/api/notes/migrate-connections', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { migrated, skipped } = await migrateLinkedFromNoteConnectionsForUser(auth.userId);
    return c.json({ success: true, migrated, skipped });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/migrate-connections', action: 'migrate_connections' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/:id/thread ───────────────────────────────────────────────
// Returns the study thread graph for a note: bidirectional BFS over NoteConnections.
// Response is flat: { focusNoteId, nodes[], edges[], nodeCount }.
route.get('/api/notes/:id/thread', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const focusNoteId = normalizeServerNoteId(requireParam(c, 'id'));

    const focus = first(
      await db
        .select({ id: Notes.id, spaceId: Notes.spaceId })
        .from(Notes)
        .where(and(eq(Notes.id, focusNoteId), eq(Notes.userId, auth.userId)))
        .limit(1),
    );
    if (!focus) return c.json({ success: false, error: 'Note not found' }, 404);

    const preferredSpaceId =
      typeof c.req.query('spaceId') === 'string' ? c.req.query('spaceId') : undefined;
    const { graph } = await collectStudyThreadGraphForScope(focusNoteId, auth.userId, {
      preferredSpaceId,
      maxNodes: 200,
    });
    const { nodeIds, edges: uniqueEdges, degreeMap } = graph;

    const noteRows = await fetchStudyThreadNoteRows(nodeIds, auth.userId);

    const repNoteId =
      pickStudyThreadRepresentativeNoteId(degreeMap.keys(), degreeMap) ?? focusNoteId;

    // Batch resource metadata.
    const resourceIds = noteRows.filter((n) => n.noteType === 'resource').map((n) => n.id);
    let resourceMap: Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null }> = {};
    if (resourceIds.length > 0) {
      try {
        const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
          .from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceIds));
        resourceMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
      } catch { resourceMap = {}; }
    }

    const nodes = noteRows.map((n) => {
      const rm = n.noteType === 'resource' ? resourceMap[n.id] : null;
      return {
        id: n.id,
        title: n.title,
        content: n.content,
        simpleNoteId: n.simpleNoteId ?? null,
        noteType: n.noteType || 'default',
        resourceTitle: rm?.sourceTitle ?? null,
        resourceDescription: rm?.sourceDescription ?? null,
        resourceImage: rm?.sourceImage ?? null,
        updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
      };
    });

    const suggestNodes: StudyThreadSuggestNode[] = noteRows.map((n) => {
      const rm = n.noteType === 'resource' ? resourceMap[n.id] : null;
      return {
        id: n.id,
        title: n.title,
        content: n.content,
        noteType: n.noteType,
        resourceTitle: rm?.sourceTitle ?? null,
        resourceDescription: rm?.sourceDescription ?? null,
        updatedAt: n.updatedAt ? n.updatedAt.toISOString() : null,
      };
    });
    const naming = resolveStudyThreadClusterNaming(noteRows, suggestNodes, repNoteId);
    const memberOrder = await fetchStudyThreadMemberOrder(naming.repNoteId, auth.userId);

    return c.json({
      success: true,
      focusNoteId,
      repNoteId: naming.repNoteId,
      threadTitle: naming.threadTitle,
      suggestedTitle: naming.suggestedTitle,
      studyThreadUserOverride: naming.studyThreadUserOverride,
      studyThreadPinned: naming.studyThreadPinned,
      memberOrder,
      nodes,
      edges: uniqueEdges,
      nodeCount: nodes.length,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/thread', action: 'get_note_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── PATCH /api/notes/:id/thread/member-order ────────────────────────────────
// Persists user-defined note order for a study-thread cluster.
route.patch('/api/notes/:id/thread/member-order', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const focusNoteId = normalizeServerNoteId(requireParam(c, 'id'));
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const orderedNoteIds = Array.isArray(body.orderedNoteIds)
      ? body.orderedNoteIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : null;
    if (!orderedNoteIds || orderedNoteIds.length === 0) {
      return c.json({ success: false, error: 'orderedNoteIds is required', code: 'INVALID_BODY' }, 400);
    }

    const focus = first(
      await db
        .select({ id: Notes.id })
        .from(Notes)
        .where(and(eq(Notes.id, focusNoteId), eq(Notes.userId, auth.userId)))
        .limit(1),
    );
    if (!focus) return c.json({ success: false, error: 'Note not found' }, 404);

    const preferredSpaceId =
      typeof c.req.query('spaceId') === 'string' ? c.req.query('spaceId') : undefined;
    const { graph } = await collectStudyThreadGraphForScope(focusNoteId, auth.userId, {
      preferredSpaceId,
      maxNodes: 200,
    });
    const repNoteId =
      pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? focusNoteId;
    const memberSet = new Set(graph.nodeIds);

    const uniqueIds: string[] = [];
    const seen = new Set<string>();
    for (const id of orderedNoteIds) {
      if (!memberSet.has(id) || seen.has(id)) continue;
      uniqueIds.push(id);
      seen.add(id);
    }
    if (uniqueIds.length !== graph.nodeIds.length) {
      return c.json(
        {
          success: false,
          error: 'orderedNoteIds must include every note in the thread exactly once',
          code: 'INVALID_ORDER',
        },
        400,
      );
    }

    await upsertStudyThreadMemberOrder(repNoteId, auth.userId, uniqueIds);
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: repNoteId });
    return c.json({ success: true, repNoteId, memberOrder: uniqueIds });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/[id]/thread/member-order',
      action: 'update_thread_member_order',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── PATCH /api/notes/:id/study-thread-title ────────────────────────────────
// Sets (or clears) the custom study-thread name on the representative note.
route.patch('/api/notes/:id/study-thread-title', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = normalizeServerNoteId(requireParam(c, 'id'));
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const hasTitleField = Object.prototype.hasOwnProperty.call(body, 'title');
    const title = hasTitleField
      ? typeof body.title === 'string'
        ? body.title.trim() || null
        : null
      : undefined;
    const userOverride =
      typeof body.userOverride === 'boolean' ? body.userOverride : undefined;
    const pinned = typeof body.pinned === 'boolean' ? body.pinned : undefined;

    const note = first(
      await db
        .select({ id: Notes.id, spaceId: Notes.spaceId })
        .from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)))
        .limit(1),
    );
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);

    const preferredSpaceId =
      typeof c.req.query('spaceId') === 'string' ? c.req.query('spaceId') : undefined;
    const { graph } = await collectStudyThreadGraphForScope(noteId, auth.userId, {
      preferredSpaceId,
      maxNodes: 200,
    });
    const repNoteId =
      pickStudyThreadRepresentativeNoteId(graph.degreeMap.keys(), graph.degreeMap) ?? noteId;
    const clusterIds = graph.nodeIds.length > 0 ? graph.nodeIds : [repNoteId];

    const applyNamingToCluster = async (payload: Record<string, unknown>, ids: string[]) => {
      if (ids.length === 0) return;
      await db
        .update(Notes)
        .set(payload as Record<string, unknown>)
        .where(and(inArray(Notes.id, ids), eq(Notes.userId, auth.userId)));
    };

    const clusterCountBefore = await countStudyThreadClustersForUser(auth.userId);

    try {
      if (userOverride === false) {
        await applyNamingToCluster(
          {
            studyThreadTitle: null,
            studyThreadUserOverride: false,
            studyThreadLastAutoSuggestedAt: new Date(),
            updatedAt: nowISO(),
          },
          clusterIds,
        );
      } else if (title !== undefined) {
        const manualPayload: Record<string, unknown> = {
          studyThreadTitle: title,
          studyThreadUserOverride: userOverride ?? true,
          updatedAt: nowISO(),
        };
        await applyNamingToCluster(manualPayload, clusterIds);
      }

      if (pinned !== undefined) {
        await db
          .update(Notes)
          .set({ studyThreadPinned: pinned, updatedAt: nowISO() })
          .where(and(eq(Notes.id, repNoteId), eq(Notes.userId, auth.userId)));
      }
    } catch (error) {
      if (!isStudyThreadNamingColumnMissing(error)) throw error;
      const fallback: Record<string, unknown> = { updatedAt: nowISO() };
      if (title !== undefined) {
        fallback.studyThreadTitle = title;
        fallback.studyThreadUserOverride =
          userOverride !== undefined ? userOverride : title ? true : false;
      } else if (userOverride !== undefined) {
        fallback.studyThreadUserOverride = userOverride;
      }
      if (userOverride === false) {
        fallback.studyThreadTitle = null;
      }
      if (Object.keys(fallback).length > 1) {
        await applyNamingToCluster(fallback, clusterIds);
      }
    }

    const clusterCountAfter = await countStudyThreadClustersForUser(auth.userId);
    const awardTitle = typeof title === 'string' ? title : undefined;
    awardStudyThreadClusterCreatedXPIfNew(
      auth.userId,
      clusterCountBefore,
      clusterCountAfter,
      repNoteId,
      awardTitle,
    ).catch(() => {});

    broadcastInvalidation(auth.userId, { type: 'note:updated', id: repNoteId });
    return c.json({
      success: true,
      title: title !== undefined ? title : undefined,
      userOverride,
      pinned,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/[id]/study-thread-title', action: 'update_study_thread_title' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/notes/delete ────────────────────────────────────────────────
route.delete('/api/notes/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const noteId = c.req.query('noteId');
    const deleteSource = c.req.header('X-Harvous-Delete-Source') ?? c.req.query('source') ?? 'unknown';
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const existingNote = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    if (!existingNote) return c.json({ error: 'Note not found or access denied' }, 404);

    console.info('[api/notes/delete]', {
      userId: auth.userId,
      noteId,
      source: deleteSource,
      noteType: existingNote.noteType,
    });

    const threadId = existingNote.threadId;
    const noteCreatedAt = existingNote.createdAt;

    const deleted = await deleteSingleNoteCascadeForUser(auth.userId, noteId);
    if (deleted.deletedNoteIds.length === 0) {
      return c.json({ error: 'Note not found or access denied' }, 404);
    }
    await recordDeletedEntities(auth.userId, 'note', deleted.deletedNoteIds);
    await recordDeletedEntities(auth.userId, 'studyThread', deleted.deletedStudyThreadIds);

    // Revoke XP (fire-and-forget)
    (async () => {
      try {
        await revokeXPOnDeletion(auth.userId, noteId, new Date(noteCreatedAt as string));
        await revokeAllXPForItem(auth.userId, noteId);
      } catch {}
    })().catch(() => {});

    void broadcastNoteInvalidation(auth.userId, existingNote.spaceId, { type: 'note:deleted', id: noteId });

    return c.json({ success: true, deletedId: noteId, noteId, threadId });
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

// ─── GET /api/notes/fingerprints ────────────────────────────────────────────
// Memory layer: the user's passage memory fingerprints (meaning + tone + themes per note).
// Powers forgetting-aware resurfacing (Workstream B) on the Home view and the inspector read-out.
route.get('/api/notes/fingerprints', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const fingerprints = await getUserNoteFingerprints(auth.userId);
    const compact = fingerprints.map((f) => ({
      noteId: f.noteId,
      meaningWeight: f.meaningWeight,
      emotionalTone: f.emotionalTone,
      themes: f.themes,
      people: f.people,
      places: f.places,
      passageCount: f.passageCount,
      canonSection: f.canonSection,
      canonSectionLabel: f.canonSectionLabel,
      testament: f.testament,
      canonSections: f.canonSections,
      recallStabilityDays: f.recallStabilityDays,
      lastRecallEngagedAt: f.lastRecallEngagedAt?.toISOString() ?? null,
    }));
    return c.json({ success: true, fingerprints: compact });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/fingerprints', action: 'get_fingerprints' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/crossref-gaps ──────────────────────────────────────────────
// Generative recall Phase 2: passages cross-referenced FROM the user's cited passages that they
// haven't written about yet. Powers the "A link worth making" generative card in the recall carousel.
route.get('/api/notes/crossref-gaps', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const gaps = await getCrossRefGaps(auth.userId, { limit: 5 });
    return c.json({ success: true, gaps });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/crossref-gaps', action: 'get_crossref_gaps' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/connect-suggestions ───────────────────────────────────────
// Generative recall Phase 2: strongly-related note pairs with no existing connection edge.
// Powers the "connect two related notes" card; one-tap creates the edge via POST /api/notes/connect-link.
route.get('/api/notes/connect-suggestions', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const suggestions = await getConnectSuggestions(auth.userId, { limit: 3 });
    return c.json({ success: true, suggestions });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/connect-suggestions', action: 'get_connect_suggestions' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/recall-engaged ───────────────────────────────────────────
// Workstream B: user opened a resurfaced note — bump stability and record engagement time.
route.post('/api/notes/recall-engaged', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const { noteId } = await c.req.json();
    if (!noteId || typeof noteId !== 'string') {
      return c.json({ error: 'Note ID is required' }, 400);
    }

    const result = await recordNoteRecallEngaged(auth.userId, noteId.trim());
    if (!result) {
      return c.json({ error: 'Note not found or recall state unavailable' }, 404);
    }

    return c.json({
      success: true,
      noteId: result.noteId,
      recallStabilityDays: result.recallStabilityDays,
      lastRecallEngagedAt: result.lastRecallEngagedAt?.toISOString() ?? null,
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/recall-engaged', action: 'recall_engaged' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/notes/auto-tags ──────────────────────────────────────────────
route.post('/api/notes/auto-tags', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const { noteId, noteTitle, noteContent, action = 'generate' } = await c.req.json();
    if (!noteId || !noteTitle || !noteContent) return c.json({ error: 'Note ID, title, and content are required' }, 400);

    const noteRow = first(
      await db.select({
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        dismissedAutoTags: Notes.dismissedAutoTags,
      }).from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    const tagExcludes = noteRow ? autoTagExcludeOptionsForNote(noteRow) : { excludeLabels: [], excludeTagNames: [] };

    let result;
    switch (action) {
      case 'generate':
        result = await generateAutoTags(noteTitle, noteContent, auth.userId, 0.7, tagExcludes);
        break;
      case 'apply': {
        const suggestions = await generateAutoTags(noteTitle, noteContent, auth.userId, 0.7, tagExcludes);
        const applied = await applyAutoTags(noteId, suggestions.suggestions, auth.userId);
        result = { ...suggestions, applied };
        break;
      }
      case 'regenerate':
        result = await regenerateAutoTags(noteId, noteTitle, noteContent, auth.userId, 0.7, {
          ...tagExcludes,
          clearDismissed: true,
        });
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

    const deleted = await deleteSingleNoteCascadeForUser(auth.userId, noteId);
    if (deleted.deletedNoteIds.length === 0) {
      return c.json({ error: 'Note not found or access denied' }, 404);
    }
    await recordDeletedEntities(auth.userId, 'note', deleted.deletedNoteIds);
    await recordDeletedEntities(auth.userId, 'studyThread', deleted.deletedStudyThreadIds);

    await revokeXPOnDeletion(auth.userId, noteId, new Date(noteCreatedAt as string));
    await revokeAllXPForItem(auth.userId, noteId);

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
      const deleted = await deleteNotesCascadeForUser(auth.userId, noteIds);
      await recordDeletedEntities(auth.userId, 'note', deleted.deletedNoteIds);
      await recordDeletedEntities(auth.userId, 'studyThread', deleted.deletedStudyThreadIds);
      for (const note of unorgNotes) {
        if (!deleted.deletedNoteIds.includes(note.id)) continue;
        // Revoke XP (fire-and-forget to match main delete pattern)
        (async () => {
          try {
            await revokeXPOnDeletion(auth.userId, note.id, new Date(note.createdAt as string));
            await revokeAllXPForItem(auth.userId, note.id);
          } catch {}
        })().catch(() => {});
      }
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

    const body = await c.req.json();
    const title = typeof body.title === 'string' ? body.title : '';
    const content = typeof body.content === 'string' ? body.content : '';
    const noteId = typeof body.noteId === 'string' && body.noteId.trim() ? body.noteId.trim() : undefined;

    if (!title && !content) return c.json({ error: 'Title or content is required', code: 'MISSING_CONTENT' }, 400);
    const noteText = `${title || ''} ${content || ''}`.trim();
    if (!noteText) return c.json({ error: 'Note text is required', code: 'EMPTY_CONTENT' }, 400);

    const passageMap = new Map<string, VerseKey>();
    for (const v of detectVerseKeysFromNoteText(title, content)) {
      passageMap.set(`${v.book}|${v.chapter}|${v.verse}`, v);
    }
    if (noteId) {
      for (const v of await getNotePassages(noteId)) {
        passageMap.set(`${v.book}|${v.chapter}|${v.verse}`, v);
      }
    }
    const sourcePassages = [...passageMap.values()];

    const relatedNotes =
      sourcePassages.length > 0
        ? await getRelatedNotesForPassages(auth.userId, sourcePassages, {
            limit: 15,
            excludeNoteId: noteId,
          })
        : [];

    const relatedNoteIds = relatedNotes.map((r) => r.noteId);
    const noteIdToThreadIds = new Map<string, string[]>();
    if (relatedNoteIds.length > 0) {
      const noteThreadRows = await db
        .select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId })
        .from(NoteThreads)
        .where(inArray(NoteThreads.noteId, relatedNoteIds));
      for (const row of noteThreadRows) {
        const list = noteIdToThreadIds.get(row.noteId) ?? [];
        list.push(row.threadId);
        noteIdToThreadIds.set(row.noteId, list);
      }
    }

    const recentThreadRelations = await db
      .select({ threadId: NoteThreads.threadId, createdAt: NoteThreads.createdAt })
      .from(NoteThreads)
      .innerJoin(Notes, eq(NoteThreads.noteId, Notes.id))
      .where(eq(Notes.userId, auth.userId))
      .orderBy(desc(NoteThreads.createdAt))
      .limit(50);
    const recentThreadIds = [...new Set(recentThreadRelations.map((r) => r.threadId))].filter(
      (id) => id !== 'thread_unorganized',
    ).slice(0, 10);

    const allThreads = await db
      .select({ id: Threads.id, title: Threads.title, color: Threads.color })
      .from(Threads)
      .where(eq(Threads.userId, auth.userId));

    const noteKeywordNames = findKeywordsInText(noteText).map((k) => k.keyword.name);
    const keywordNamesFromText = (text: string) => findKeywordsInText(text).map((k) => k.keyword.name);

    const threadKeywordScores = new Map<string, number>();
    for (const thread of allThreads) {
      if (thread.id === 'thread_unorganized') continue;
      const overlap = scoreThreadKeywordOverlap(
        noteKeywordNames,
        thread.title,
        keywordNamesFromText,
        conceptOverlaps,
      );
      if (overlap > 0) threadKeywordScores.set(thread.id, overlap);
    }

    const ranked = rankThreadSuggestions(
      {
        relatedNotes,
        noteIdToThreadIds,
        threadKeywordScores,
        recentThreadIds,
        threadMeta: allThreads.map((t) => ({ id: t.id, title: t.title, color: t.color })),
      },
      { limit: 5 },
    );

    const metaById = new Map(allThreads.map((t) => [t.id, t]));
    const top = ranked.map((s) => {
      const meta = metaById.get(s.threadId)!;
      return { threadId: s.threadId, title: meta.title, color: meta.color, score: s.score, reason: s.reason };
    });

    return c.json({
      success: true,
      suggestedThreadIds: top.map((s) => s.threadId),
      suggestedThreads: top.map((s) => ({ id: s.threadId, title: s.title, color: s.color, reason: s.reason })),
    });
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/notes/suggest-threads', action: 'suggest_threads' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/notes/:id/tags ────────────────────────────────────────────────
route.get('/api/notes/:id/tags', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'id');

    const note = first(
      await db.select({ id: Notes.id, userId: Notes.userId }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
    );
    if (!note) return c.json({ error: 'Note not found' }, 404);

    const ownerUserId = note.userId === auth.userId ? auth.userId : note.userId;
    const tags = await fetchNoteTagsForResponse(noteId, ownerUserId);

    return c.json({
      success: true,
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        category: t.category,
        isSystem: t.isSystem,
        isAutoGenerated: t.isAutoGenerated,
        confidence: t.confidence,
      })),
    });
  } catch (error: any) {
    return c.json({ error: error.message || 'Failed to load note tags' }, 500);
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

    // Notes that live only in unorganized have no NoteThreads row; include unorganized thread so nav shows My Pile.
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
          title: unorganizedRow.title || MY_PILE_THREAD_TITLE,
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

    // Format threads with counts and backgroundGradient for nav/NotePage.
    // Counts are batched into at most three grouped queries (instead of one query
    // per thread) keyed by threadId: total junction counts for member-space threads,
    // owner-scoped counts for regular threads, and a single count for unorganized.
    const regularThreadIds = allThreads
      .filter((t: any) => t.id !== 'thread_unorganized' && !(isMemberView && t.spaceId))
      .map((t: any) => t.id);
    const memberTotalThreadIds = allThreads
      .filter((t: any) => t.id !== 'thread_unorganized' && isMemberView && t.spaceId)
      .map((t: any) => t.id);
    const hasUnorganized = allThreads.some((t: any) => t.id === 'thread_unorganized');

    const [regularCountRows, memberTotalCountRows, unorganizedCountResult] = await Promise.all([
      regularThreadIds.length > 0
        ? db.select({ threadId: NoteThreads.threadId, count: count() })
            .from(Notes)
            .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
            .where(and(inArray(NoteThreads.threadId, regularThreadIds), eq(Notes.userId, auth.userId)))
            .groupBy(NoteThreads.threadId)
        : Promise.resolve([] as Array<{ threadId: string; count: number }>),
      memberTotalThreadIds.length > 0
        ? db.select({ threadId: NoteThreads.threadId, count: count() })
            .from(NoteThreads)
            .where(inArray(NoteThreads.threadId, memberTotalThreadIds))
            .groupBy(NoteThreads.threadId)
        : Promise.resolve([] as Array<{ threadId: string; count: number }>),
      hasUnorganized
        ? db.select({ count: count() })
            .from(Notes)
            .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
            .where(and(eq(Notes.userId, auth.userId), isNull(NoteThreads.id)))
            .limit(1)
            .then(rows => first(rows))
        : Promise.resolve(undefined),
    ]);

    const threadCountMap = new Map<string, number>();
    for (const row of regularCountRows) threadCountMap.set(row.threadId, row.count);
    for (const row of memberTotalCountRows) threadCountMap.set(row.threadId, row.count);
    const unorganizedCount = unorganizedCountResult?.count || 0;

    const formattedThreads = allThreads.map((thread: any) => {
      const threadCount = thread.id === 'thread_unorganized'
        ? unorganizedCount
        : (threadCountMap.get(thread.id) || 0);
      return {
        ...thread,
        subtitle: thread.subtitle || 'Thread',
        count: thread.count != null ? thread.count : threadCount,
        backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color),
      };
    });

    // Comments
    const comments = await db.select({ id: Comments.id, content: Comments.content, createdAt: Comments.createdAt, updatedAt: Comments.updatedAt })
      .from(Comments).where(and(eq(Comments.noteId, noteId), eq(Comments.userId, auth.userId))).orderBy(Comments.createdAt);

    // Tags on the note: join Tags owned by the note author (not the viewer).
    // Members viewing system-owned shared notes must see Harvous auto-tags; those Tag rows use Notes.userId.
    const noteTags = await db.select({ id: Tags.id, name: Tags.name, color: Tags.color, category: Tags.category, isSystem: Tags.isSystem, isAutoGenerated: NoteTags.isAutoGenerated, confidence: NoteTags.confidence, createdAt: NoteTags.createdAt })
      .from(NoteTags).innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, note.userId))).orderBy(Tags.name);

    const dedupedNoteTags = dedupeNoteTagsForResponse(noteTags);

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

    // Read connections from the NoteConnections graph (many-to-many).
    // linkedFromNotes = edges where this note is the *target* (incoming).
    // linkedToNotes   = edges where this note is the *source* (outgoing).
    let linkedFromNotes: any[] = [];
    let linkedToNotes: any[] = [];
    if (!isMemberView && note.userId === auth.userId) {
      try {
        const [incomingEdges, outgoingEdges] = await Promise.all([
          db.select({ fromNoteId: NoteConnections.fromNoteId, createdAt: NoteConnections.createdAt })
            .from(NoteConnections)
            .where(and(eq(NoteConnections.toNoteId, noteId), eq(NoteConnections.userId, auth.userId)))
            .orderBy(asc(NoteConnections.createdAt))
            .limit(100),
          db.select({ toNoteId: NoteConnections.toNoteId, createdAt: NoteConnections.createdAt })
            .from(NoteConnections)
            .where(and(eq(NoteConnections.fromNoteId, noteId), eq(NoteConnections.userId, auth.userId)))
            .orderBy(asc(NoteConnections.createdAt))
            .limit(100),
        ]);

        const allConnectedIds = [
          ...incomingEdges.map((e) => e.fromNoteId),
          ...outgoingEdges.map((e) => e.toNoteId),
        ];

        if (allConnectedIds.length > 0) {
          const connectedRows = await db.select({
            id: Notes.id, title: Notes.title, content: Notes.content,
            simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
            createdAt: Notes.createdAt, updatedAt: Notes.updatedAt,
          }).from(Notes)
            .where(and(inArray(Notes.id, allConnectedIds), eq(Notes.userId, auth.userId)));

          const connResourceIds = connectedRows.filter((r) => r.noteType === 'resource').map((r) => r.id);
          let connResourceMap: Record<string, { sourceTitle: string | null; sourceDescription: string | null; sourceImage: string | null }> = {};
          if (connResourceIds.length > 0) {
            try {
              const rmList = await db.select({ noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle, sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage })
                .from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, connResourceIds));
              connResourceMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
            } catch { connResourceMap = {}; }
          }

          const rowById = Object.fromEntries(connectedRows.map((r) => [r.id, r]));
          const toRef = (id: string): any | null => {
            const r = rowById[id];
            if (!r) return null;
            const rm = r.noteType === 'resource' ? connResourceMap[r.id] : null;
            return { ...r, noteType: r.noteType || 'default', resourceTitle: rm?.sourceTitle ?? null, resourceDescription: rm?.sourceDescription ?? null, resourceImage: rm?.sourceImage ?? null };
          };

          linkedFromNotes = incomingEdges.map((e) => toRef(e.fromNoteId)).filter(Boolean);
          linkedToNotes = outgoingEdges.map((e) => toRef(e.toNoteId)).filter(Boolean);
        }
      } catch { linkedFromNotes = []; linkedToNotes = []; }
    }

    let studyThreads: any[] = [];
    let loadUnionedStudyThreads = false;
    if (note.spaceId) {
      const spaceRow = first(
        await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, note.spaceId)).limit(1),
      );
      loadUnionedStudyThreads = spaceRow?.type === 'shared' || spaceRow?.type === 'public';
    }

    if ((!isMemberView && note.userId === auth.userId) || loadUnionedStudyThreads) {
      try {
        const stRows = await db
          .select()
          .from(StudyThreadEntries)
          .where(
            loadUnionedStudyThreads
              ? and(eq(StudyThreadEntries.parentNoteId, noteId), eq(StudyThreadEntries.isArchived, false))
              : and(eq(StudyThreadEntries.parentNoteId, noteId), eq(StudyThreadEntries.userId, auth.userId)),
          )
          .orderBy(desc(StudyThreadEntries.highlightListEditedAt), desc(StudyThreadEntries.createdAt));
        const authorMap = loadUnionedStudyThreads
          ? await batchAuthorAttribution(stRows.map((row) => row.userId))
          : {};
        studyThreads = stRows.map((row) => {
          const mapped = mapStudyRow(row);
          if (!loadUnionedStudyThreads) return mapped;
          const author = authorMap[row.userId];
          return {
            ...mapped,
            authorDisplayName: author?.displayName ?? 'A Harvous User',
            authorColor: author?.userColor ?? 'blue',
            isOwnHighlight: row.userId === auth.userId,
          };
        });
      } catch {
        studyThreads = [];
      }
    }

    return c.json({
      success: true,
      note: {
        ...noteJsonWithParsedSecondaries(note),
        simpleNoteId: note.simpleNoteId ?? null,
        contentEncrypted: note.contentEncrypted || false,
        noteType: note.noteType || 'default',
        addedBy: note.addedBy || 'user',
        version,
        resourceTitle,
        resourceDescription,
        resourceImage,
      },
      threads: formattedThreads,
      allUserThreads: selectableUserThreads.map(t => ({ id: t.id, title: t.title, color: t.color, isPublic: t.isPublic, createdAt: t.createdAt, updatedAt: t.updatedAt })),
      comments: comments.map(c => ({ id: c.id, content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt })),
      tags: dedupedNoteTags.map(t => ({ id: t.id, name: t.name, color: t.color, category: t.category, isSystem: t.isSystem, isAutoGenerated: t.isAutoGenerated, confidence: t.confidence })),
      referencingNotes,
      linkedFromNotes,
      linkedToNotes,
      studyThreads,
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
    if (isOnboardingSystemNote(note)) {
      return c.json({ success: false, error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
    }

    const isEncryptedContent = contentEncrypted === true;
    const contentForStore = isEncryptedContent
      ? content
      : canonicalizeNoteHtmlLineBreaks(content);
    const updateData: any = { content: contentForStore, updatedAt: nowISO() };
    if (typeof contentEncrypted === 'boolean') {
      updateData.contentEncrypted = contentEncrypted;
      if (contentEncrypted === true) { updateData.isPublic = false; updateData.shareToken = null; updateData.shareTokenCreatedAt = null; }
    }

    await db.update(Notes).set(updateData).where(and(eq(Notes.id, id), eq(Notes.userId, auth.userId)));
    broadcastInvalidation(auth.userId, { type: 'note:updated', id });
    return c.json({ success: true, message: 'Note content updated' });
  } catch (error) {
    console.error('Error updating note content:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── POST /api/notes/:noteId/inline-image ───────────────────────────────────
route.post('/api/notes/:noteId/inline-image', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const noteId = requireParam(c, 'noteId');

    const note = first(
      await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1),
    );
    if (!note) return c.json({ success: false, error: 'Note not found' }, 404);
    if (isOnboardingSystemNote(note)) {
      return c.json({ success: false, error: 'This note is read-only.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);
    }

    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'Image file is required' }, 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'application/octet-stream';
    const { uploadInlineNoteImage } = await import('../utils/note-inline-image-upload');
    const result = await uploadInlineNoteImage({
      userId: auth.userId,
      noteId,
      bytes,
      mimeType,
    });

    if (!result.ok) {
      return c.json({ success: false, error: result.error }, result.status);
    }

    return c.json({ success: true, url: result.url });
  } catch (error) {
    console.error('Error uploading inline note image:', error);
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

    broadcastInvalidation(auth.userId, { type: 'note:updated', id });
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

    broadcastInvalidation(auth.userId, { type: 'note:updated', id });
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
    // This endpoint is the load/backfill path (opening a note materializes legacy pills) — skip the parent
    // auto-tag so merely viewing a note never appends new tags, and skip the updatedAt bump so merely
    // viewing a note never changes its "last updated" sort order. Genuine writes (create/update/sync/import)
    // call processScriptureReferences directly and keep both tagging and the updatedAt bump.
    const result = await processScriptureReferences(noteId, noteRow.userId, threadId, contentOverride, translation || 'NET', { skipParentAutoTag: true, skipUpdatedAt: true });
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

    const note = first(
      await db
        .select({
          id: Notes.id,
          threadId: Notes.threadId,
          addedBy: Notes.addedBy,
          isPublic: Notes.isPublic,
          shareToken: Notes.shareToken,
          shareTokenCreatedAt: Notes.shareTokenCreatedAt,
          userId: Notes.userId,
          noteType: Notes.noteType,
          contentEncrypted: Notes.contentEncrypted,
        })
        .from(Notes)
        .where(eq(Notes.id, noteId))
        .limit(1)
    );
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== auth.userId) return c.json({ error: 'You do not have permission to access this note' }, 403);
    if (isOnboardingSystemNote(note)) return c.json({ error: 'This note cannot be shared.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);

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

    const note = first(
      await db
        .select({
          id: Notes.id,
          threadId: Notes.threadId,
          addedBy: Notes.addedBy,
          isPublic: Notes.isPublic,
          shareToken: Notes.shareToken,
          userId: Notes.userId,
          contentEncrypted: Notes.contentEncrypted,
        })
        .from(Notes)
        .where(eq(Notes.id, noteId))
        .limit(1)
    );
    if (!note) return c.json({ error: 'Note not found' }, 404);
    if (note.userId !== auth.userId) return c.json({ error: 'You do not have permission' }, 403);
    if (isOnboardingSystemNote(note)) return c.json({ error: 'This note cannot be shared.', code: 'ONBOARDING_NOTE_READ_ONLY' }, 400);

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
