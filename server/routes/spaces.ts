/**
 * Spaces routes — Hono port of src/pages/api/spaces/*.ts
 *
 * Endpoints:
 *   POST   /api/spaces/create
 *   DELETE /api/spaces/delete
 *   GET    /api/spaces/items
 *   POST   /api/spaces/:spaceId/update
 *   GET    /api/spaces/:spaceId/notes
 *   POST   /api/spaces/:spaceId/folders/remove
 *   POST   /api/spaces/:spaceId/threads/remove
 *   GET    /api/spaces/:spaceId/study-thread-highlights
 *   GET    /api/spaces/:spaceId/scripture-index
 *   GET    /api/spaces/:spaceId/study-threads/by-scripture
 *   GET    /api/spaces/:spaceId/study-threads
 *   GET    /api/spaces/:spaceId/connect-note-candidates
 *   GET    /api/spaces/:spaceId/items
 *   GET    /api/spaces/:spaceId/bootstrap
 *   GET    /api/spaces/:spaceId/prefetch
 *   POST   /api/spaces/:spaceId/add-note
 *   POST   /api/spaces/:spaceId/add-thread
 *   POST   /api/spaces/:spaceId/add-items
 *   POST   /api/spaces/:spaceId/remove-items
 *   GET    /api/spaces/:spaceId/share-link
 *   POST   /api/spaces/:spaceId/share-link
 *   GET    /api/spaces/:spaceId/members
 *   POST   /api/spaces/:spaceId/members/invite
 *   DELETE /api/spaces/:spaceId/members/:userId
 *   POST   /api/spaces/join/:token
 *   GET    /api/spaces/join-preview/:token
 */

import { Hono } from 'hono';
import { getTableColumns } from 'drizzle-orm';
import { getAuth, getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Spaces, Notes, Threads, NoteThreads, Members, SpaceInvitations, UserMetadata, ResourceMetadata, ScriptureMetadata,
  StudyThreadEntries, NoteConnections,
  eq, and, ne, count, inArray, desc, asc, sql, isNull, isNotNull, gt, or,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import { parseNoteSecondaryCollections, serializeNoteSecondaryCollections } from '../utils/note-secondary-collections';
import { computeNoteFolderRemovalPatch } from '@/utils/folder-bulk-actions';
import { normalizeThreadClusterMemberIds } from '@/utils/thread-cluster-bulk-actions';
import { broadcastInvalidation } from '../utils/realtime';
import { recordDeletedEntities } from '../utils/sync-deletion-log';
import {
  getSpacesWithCounts,
  getNotesForSpace,
  getNotesForSpaceForMember,
  getThreadsForSpace,
  getThreadsForSpaceBySpaceId,
  getThreadColorsForNotesBatch,
} from '../utils/dashboard-data';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-permissions';
import { awardCreationBonusXP } from '../utils/xp-system';
import {
  canCreateSharedSpace,
  canOwnerAddOneMoreSharedSpace,
  canAddMemberToSpace,
  canAddMemberToSpaceByOwnerId,
  getTierForAuth,
  getTierLimits,
  getSharedSpacesOwnedCount,
  getSpaceMemberCount,
} from '../utils/tier-limits';
import { getThreadGradientCSS } from '@/utils/colors';
import { handleAPIError } from '@/utils/error-handling';
import { validateTitle, validateColor } from '@/utils/validation';
import { rateLimit } from '@/utils/rate-limit';
import { generateSpaceId, generateShareToken } from '@/utils/ids';
import { idToUrl } from '@/utils/url-helpers';
import { getHarvousSystemUserId } from '../utils/harvous-admin';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { buildSpaceScriptureIndex } from '../utils/build-space-scripture-index';
import {
  NOT_ONBOARDING_NOTES_THREAD,
  NOT_ONBOARDING_SYSTEM_NOTES,
  isOnboardingSystemNote,
} from '../utils/purge-onboarding-content';
import { buildSpaceReferencesIndex } from '../utils/build-space-references-index';
import { mapStudyRow } from './study-threads';
import { isStudyThreadEntriesTableMissing } from '../utils/pg-undefined-relation';
import {
  pickStudyThreadRepresentativeNoteId,
  suggestStudyThreadTitleFromNodes,
  type StudyThreadSuggestNode,
} from '@/utils/suggest-study-thread-title';
import { fetchStudyThreadNoteRows } from '../utils/study-thread-note-rows';
import { resolveStudyThreadClusterNaming } from '../utils/study-thread-cluster-naming';
import { studyThreadEligibleForHighlightList } from '@/utils/study-thread-highlight-eligibility';

const route = new Hono();

function normalizePrototypeSpaceId(spaceIdRaw: string): string {
  return spaceIdRaw.startsWith('space_') ? spaceIdRaw : `space_${spaceIdRaw}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseItemIds(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return trimmed.split(',').filter(id => id.trim());
    }
  }
  return trimmed.split(',').filter(id => id.trim());
}

// ─── POST /api/spaces/create ────────────────────────────────────────────────
route.post('/api/spaces/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const formData = await c.req.formData();
    const title = formData.get('title') as string;
    const color = (formData.get('color') as string) || 'paper';
    const isPublic = formData.get('isPublic') === 'true';
    const selectedNoteIds = parseItemIds(formData.get('selectedNoteIds') as string | null);
    const selectedThreadIds = parseItemIds(formData.get('selectedThreadIds') as string | null);

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);

    if (isPublic) {
      const canCreate = await canCreateSharedSpace(auth.userId, auth);
      if (!canCreate.allowed) {
        return c.json({
          error: canCreate.reason || "You've used all your shared spaces. Upgrade for unlimited.",
          code: 'SHARED_SPACE_LIMIT_EXCEEDED', currentCount: canCreate.currentCount,
          limit: canCreate.limit, upgradeUrl: '/upgrade',
        }, 403);
      }
    }

    const backgroundGradient = getThreadGradientCSS(color);
    const now = nowISO();

    const newSpace = first(await db.insert(Spaces).values({
      id: generateSpaceId(),
      title: capitalizedTitle,
      description: null,
      color,
      backgroundGradient,
      userId: auth.userId,
      isPublic,
      isActive: true,
      order: 0,
      createdAt: now,
    }).returning())!;

    for (const noteId of selectedNoteIds) {
      try {
        const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
        if (note) await db.update(Notes).set({ spaceId: newSpace.id, updatedAt: nowISO() }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      } catch (error) { console.error(`Error updating note ${noteId}:`, error); }
    }

    for (const threadId of selectedThreadIds) {
      try {
        if (threadId === 'thread_unorganized') continue;
        const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
        if (thread) await db.update(Threads).set({ spaceId: newSpace.id, updatedAt: nowISO() }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
      } catch (error) { console.error(`Error updating thread ${threadId}:`, error); }
    }

    awardCreationBonusXP(auth.userId, 'space').catch(() => {});

    return c.json({ success: 'Space created!', space: newSpace, addedNotes: selectedNoteIds.length, addedThreads: selectedThreadIds.length });
  } catch (error: any) {
    console.error('Error creating space:', error);
    return c.json({ error: error.message || 'Error creating space' }, 500);
  }
});

// ─── DELETE /api/spaces/delete ──────────────────────────────────────────────
route.delete('/api/spaces/delete', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = c.req.query('spaceId');
    if (!spaceId) return c.json({ error: 'Space ID is required' }, 400);

    const space = first(await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).limit(1));
    if (!space) return c.json({ error: 'Space not found or access denied' }, 404);

    await db.delete(Members).where(eq(Members.spaceId, spaceId));
    await db.delete(SpaceInvitations).where(eq(SpaceInvitations.spaceId, spaceId));

    // Detach threads and notes (preserve content)
    const spaceThreads = await db.select({ id: Threads.id }).from(Threads).where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, auth.userId)));
    for (const t of spaceThreads) {
      await db.update(Threads).set({ spaceId: null }).where(eq(Threads.id, t.id));
    }
    const spaceNotes = await db.select({ id: Notes.id }).from(Notes).where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, auth.userId)));
    for (const n of spaceNotes) {
      await db.update(Notes).set({ spaceId: null }).where(eq(Notes.id, n.id));
    }

    await db.delete(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId)));

    return c.json({ success: 'Space deleted!', spaceId });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/delete', action: 'delete_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/items ──────────────────────────────────────────────────
route.get('/api/spaces/items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const allNotesRaw = await db.select({
      id: Notes.id, title: Notes.title, content: Notes.content,
      threadId: Notes.threadId, spaceId: Notes.spaceId,
      simpleNoteId: Notes.simpleNoteId, noteType: Notes.noteType,
      createdAt: Notes.createdAt, updatedAt: Notes.updatedAt,
      lastVisited: Notes.lastVisited, contentEncrypted: Notes.contentEncrypted,
      addedBy: Notes.addedBy,
      primaryCollection: Notes.primaryCollection,
      secondaryCollections: Notes.secondaryCollections,
      collectionPinned: Notes.collectionPinned,
      collectionUserOverride: Notes.collectionUserOverride,
    }).from(Notes).where(eq(Notes.userId, auth.userId));
    // Exclude onboarding notes so they don't appear in the "Add to Space" panel
    const allNotes = allNotesRaw.filter(n => n.addedBy !== 'system');

    // Enrich with resource metadata, scripture versions, and thread colors (mesh gradient on clients)
    const resourceNoteIds = allNotes.filter(n => n.noteType === 'resource').map(n => n.id);
    const scriptureNoteIds = allNotes.filter(n => n.noteType === 'scripture').map(n => n.id);
    const allNoteIds = allNotes.map(n => n.id);

    const [resourceMetadataMap, scriptureVersionMap, threadColorsMap] = await Promise.all([
      (async (): Promise<Record<string, any>> => {
        if (resourceNoteIds.length === 0) return {};
        try {
          const rm = await db.select({
            noteId: ResourceMetadata.noteId, sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription, sourceImage: ResourceMetadata.sourceImage,
          }).from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, resourceNoteIds));
          return Object.fromEntries(rm.map(m => [m.noteId, m]));
        } catch {
          return {};
        }
      })(),
      (async (): Promise<Record<string, string>> => {
        if (scriptureNoteIds.length === 0) return {};
        try {
          const sm = await db
            .select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
            .from(ScriptureMetadata)
            .where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
          return Object.fromEntries(sm.map(m => [m.noteId, m.translation]));
        } catch {
          return {};
        }
      })(),
      getThreadColorsForNotesBatch(allNoteIds, auth.userId),
    ]);

    const notesWithMetadata = allNotes.map(note => {
      const rm = note.noteType === 'resource' ? resourceMetadataMap[note.id] : null;
      const scriptureVersion = note.noteType === 'scripture'
        ? (scriptureVersionMap[note.id] || 'NET')
        : null;
      const threadColors = threadColorsMap.get(note.id);
      return {
        ...note, lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
        secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
        resourceTitle: rm?.sourceTitle || null, resourceDescription: rm?.sourceDescription || null, resourceImage: rm?.sourceImage || null,
        version: scriptureVersion,
        scriptureTranslation: scriptureVersion,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
      };
    });

    // Threads with note counts (exclude unorganized and onboarding threads)
    const allThreadsRaw = await db.select({
      id: Threads.id, title: Threads.title, color: Threads.color,
      spaceId: Threads.spaceId, createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt, lastVisited: Threads.lastVisited,
    }).from(Threads).where(and(eq(Threads.userId, auth.userId), ne(Threads.id, 'thread_unorganized')));
    const allThreads = allThreadsRaw.filter(t => !t.id.startsWith('thread_onboarding_'));

    const threadIds = allThreads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).innerJoin(Notes, eq(Notes.id, NoteThreads.noteId))
        .where(and(inArray(NoteThreads.threadId, threadIds), eq(Notes.userId, auth.userId)))
        .groupBy(NoteThreads.threadId);
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }

    const threadsWithCounts = allThreads.map(t => ({
      ...t, noteCount: noteCountsMap.get(t.id) || 0,
      lastUpdated: t.lastVisited || t.updatedAt || t.createdAt,
    }));

    return c.json({ notes: notesWithMetadata, threads: threadsWithCounts });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/items', action: 'get_space_items' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/update ───────────────────────────────────────
route.post('/api/spaces/:spaceId/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    const formData = await c.req.formData();
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const isPublic = formData.get('isPublic') === 'true';

    const space = first(await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).limit(1));
    if (!space) return c.json({ error: 'Space not found or access denied' }, 404);

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);
    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    // Tier check when toggling public
    if (isPublic && !space.isPublic) {
      const canCreate = await canCreateSharedSpace(auth.userId, auth);
      if (!canCreate.allowed) {
        return c.json({ error: canCreate.reason, code: 'SHARED_SPACE_LIMIT_EXCEEDED', currentCount: canCreate.currentCount, limit: canCreate.limit, upgradeUrl: '/upgrade' }, 403);
      }
    }

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const backgroundGradient = getThreadGradientCSS(color);

    const updatedSpace = first(await db.update(Spaces).set({
      title: capitalizedTitle, color, backgroundGradient, isPublic, updatedAt: nowISO(),
    }).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).returning())!;

    return c.json({ success: 'Space updated!', space: updatedSpace });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/update', action: 'update_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/notes ─────────────────────────────────────────
route.get('/api/spaces/:spaceId/notes', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const excludeLegacyScripture =
      c.req.query('excludeLegacyScripture') === '1' || c.req.query('excludeLegacyScripture') === 'true';
    const sortByLastUpdated = c.req.query('sortBy') === 'updated';

    const result = await getNotesForSpace(spaceId, auth.userId, limit, offset, {
      excludeLegacyScriptureNotes: excludeLegacyScripture,
      sortByLastUpdated,
    });
    return c.json({ notes: result.notes, hasMore: result.hasMore, total: result.total, offset, limit });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/notes', action: 'get_space_notes' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/folders/remove ───────────────────────────────
/** Remove a folder label from all notes in the space (notes are kept; labels move to Unsorted). */
route.post('/api/spaces/:spaceId/folders/remove', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const body = await c.req.json().catch(() => ({}));
    const folderName = typeof body.folderName === 'string' ? body.folderName.trim() : '';
    if (!folderName) return c.json({ error: 'Folder name is required' }, 400);

    const noteRows = await db
      .select({
        id: Notes.id,
        threadId: Notes.threadId,
        addedBy: Notes.addedBy,
        primaryCollection: Notes.primaryCollection,
        secondaryCollections: Notes.secondaryCollections,
        collectionPinned: Notes.collectionPinned,
        collectionUserOverride: Notes.collectionUserOverride,
      })
      .from(Notes)
      .where(
        and(
          eq(Notes.spaceId, spaceIdNorm),
          eq(Notes.userId, auth.userId),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_SYSTEM_NOTES,
        ),
      );

    let updatedCount = 0;
    for (const note of noteRows) {
      if (isOnboardingSystemNote(note)) continue;

      const patch = computeNoteFolderRemovalPatch(
        {
          primaryCollection: note.primaryCollection,
          secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
          collectionPinned: note.collectionPinned,
          collectionUserOverride: note.collectionUserOverride,
        },
        folderName,
      );
      if (!patch) continue;

      const updateData: Record<string, unknown> = {
        primaryCollection: patch.primaryCollection,
        secondaryCollections: serializeNoteSecondaryCollections(patch.secondaryCollections),
        collectionPinned: patch.collectionPinned,
        collectionUserOverride: patch.collectionUserOverride,
        updatedAt: nowISO(),
      };
      if (patch.collectionLastAutoUpdatedAt === null) {
        updateData.collectionLastAutoUpdatedAt = null;
      }

      await db.update(Notes).set(updateData).where(and(eq(Notes.id, note.id), eq(Notes.userId, auth.userId)));
      updatedCount += 1;
    }

    return c.json({ success: true, updatedCount });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/folders/remove',
      action: 'remove_folder',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/threads/remove ───────────────────────────────
/** Disconnect all notes in a study-thread cluster (notes are kept). */
route.post('/api/spaces/:spaceId/threads/remove', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const body = await c.req.json().catch(() => ({}));
    const memberIds = normalizeThreadClusterMemberIds(body.memberIds);
    if (memberIds.length === 0) return c.json({ error: 'memberIds is required' }, 400);

    const memberSet = new Set(memberIds);
    const edgeRows = await db
      .select({
        id: NoteConnections.id,
        fromNoteId: NoteConnections.fromNoteId,
        toNoteId: NoteConnections.toNoteId,
      })
      .from(NoteConnections)
      .where(
        and(
          eq(NoteConnections.userId, auth.userId),
          eq(NoteConnections.spaceId, spaceIdNorm),
          inArray(NoteConnections.fromNoteId, memberIds),
          inArray(NoteConnections.toNoteId, memberIds),
        ),
      );

    const edges = edgeRows.filter(
      (edge) => memberSet.has(edge.fromNoteId) && memberSet.has(edge.toNoteId),
    );
    if (edges.length === 0) {
      return c.json({ success: true, removedEdgeCount: 0 });
    }

    const edgeIds = edges.map((edge) => edge.id);
    await db.delete(NoteConnections).where(inArray(NoteConnections.id, edgeIds));
    await recordDeletedEntities(auth.userId, 'noteConnection', edgeIds);

    const touchedNoteIds = new Set<string>();
    for (const edge of edges) {
      touchedNoteIds.add(edge.fromNoteId);
      touchedNoteIds.add(edge.toNoteId);
    }
    for (const noteId of touchedNoteIds) {
      broadcastInvalidation(auth.userId, { type: 'note:updated', id: noteId });
    }

    return c.json({ success: true, removedEdgeCount: edges.length });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/threads/remove',
      action: 'remove_thread_cluster',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/study-thread-highlights ───────────────────────
route.get('/api/spaces/:spaceId/study-thread-highlights', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    // Broad SQL filter (indexed-friendly primitives only); exact eligibility matches native in JS.
    // Avoids raw `trim(coalesce(...))` fragments that have failed against some Postgres/Supabase setups.
    // Include `miniNote` rows so snippet-only highlights (legacy web creates) are fetched; JS narrows to list-eligible rows.
    const highlightCandidates = or(
      eq(StudyThreadEntries.entryKindRaw, 'scriptureLink'),
      eq(StudyThreadEntries.entryKindRaw, 'miniNote'),
      eq(StudyThreadEntries.entryKindRaw, 'linkedNote'),
      eq(StudyThreadEntries.entryKindRaw, 'reference'),
      and(isNotNull(StudyThreadEntries.anchorLocation), isNotNull(StudyThreadEntries.anchorLength), gt(StudyThreadEntries.anchorLength, 0)),
    );

    let rows;
    try {
      rows = await db
        .select({
          ...getTableColumns(StudyThreadEntries),
          parentNoteTitle: Notes.title,
        })
        .from(StudyThreadEntries)
        .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
        .where(
          and(
            eq(StudyThreadEntries.isArchived, false),
            ne(StudyThreadEntries.entryKindRaw, 'workspace'),
            highlightCandidates,
            eq(StudyThreadEntries.userId, auth.userId),
            eq(Notes.userId, auth.userId),
            eq(Notes.spaceId, spaceIdNorm),
          ),
        )
        .orderBy(desc(StudyThreadEntries.highlightListEditedAt), desc(StudyThreadEntries.createdAt));
    } catch (e) {
      if (isStudyThreadEntriesTableMissing(e)) {
        console.warn(
          '[api/spaces/study-thread-highlights] StudyThreadEntries table missing; returning empty list. Run `npm run db:push` or apply server/db/manual/create-study-thread-entries.sql.',
        );
        return c.json({ success: true, studyThreads: [] });
      }
      throw e;
    }

    const eligibleRows = rows.filter((row) => studyThreadEligibleForHighlightList(row));

    return c.json({
      success: true,
      studyThreads: eligibleRows.map((row) => {
        const { parentNoteTitle, ...entry } = row;
        return {
          ...mapStudyRow(entry),
          parentNoteTitle: parentNoteTitle ?? '',
        };
      }),
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/study-thread-highlights',
      action: 'study_thread_highlights',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/scripture-index ───────────────────────────────
route.get('/api/spaces/:spaceId/scripture-index', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const noteRows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        updatedAt: Notes.updatedAt,
        createdAt: Notes.createdAt,
      })
      .from(Notes)
      .where(
        and(
          eq(Notes.spaceId, spaceIdNorm),
          eq(Notes.userId, auth.userId),
          eq(Notes.contentEncrypted, false),
          ne(Notes.noteType, 'scripture'),
          NOT_ONBOARDING_NOTES_THREAD,
          NOT_ONBOARDING_SYSTEM_NOTES,
        ),
      );

    const payload = buildSpaceScriptureIndex(
      noteRows.map((n) => ({
        id: n.id,
        title: n.title ?? null,
        content: n.content ?? null,
        updatedAt: n.updatedAt ? String(n.updatedAt) : null,
        createdAt: String(n.createdAt),
      })),
    );

    return c.json({ success: true, ...payload });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/scripture-index',
      action: 'scripture_index',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/references-index ──────────────────────────────
route.get('/api/spaces/:spaceId/references-index', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const noteRows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(
        and(eq(Notes.spaceId, spaceIdNorm), eq(Notes.userId, auth.userId), eq(Notes.contentEncrypted, false)),
      );

    const payload = buildSpaceReferencesIndex(
      noteRows.map((n) => ({
        id: n.id,
        title: n.title ?? null,
        content: n.content ?? null,
        updatedAt: n.updatedAt ? String(n.updatedAt) : null,
      })),
    );

    return c.json({ success: true, ...payload });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/references-index',
      action: 'references_index',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/study-threads/by-scripture ─────────────────────
route.get('/api/spaces/:spaceId/study-threads/by-scripture', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceIdNorm = normalizePrototypeSpaceId(requireParam(c, 'spaceId'));
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const refRaw = c.req.query('reference') ?? '';
    const translation = (c.req.query('translation') ?? '').trim() || 'NET';
    const norm = normalizeScriptureReference(refRaw.trim()) ?? refRaw.trim();
    if (!norm) return c.json({ error: 'reference query required' }, 400);

    let rows;
    try {
      rows = await db
        .select({
          ...getTableColumns(StudyThreadEntries),
          parentNoteTitle: Notes.title,
        })
        .from(StudyThreadEntries)
        .innerJoin(Notes, eq(StudyThreadEntries.parentNoteId, Notes.id))
        .where(
          and(
            eq(StudyThreadEntries.userId, auth.userId),
            eq(Notes.userId, auth.userId),
            eq(Notes.spaceId, spaceIdNorm),
            eq(StudyThreadEntries.entryKindRaw, 'scriptureLink'),
            eq(StudyThreadEntries.scriptureReference, norm),
            eq(StudyThreadEntries.scripturePassageTranslation, translation),
          ),
        )
        .orderBy(desc(StudyThreadEntries.highlightListEditedAt), desc(StudyThreadEntries.createdAt));
    } catch (e) {
      if (isStudyThreadEntriesTableMissing(e)) {
        console.warn(
          '[api/spaces/study-threads/by-scripture] StudyThreadEntries table missing; returning empty list.',
        );
        return c.json({ success: true, studyThreads: [] });
      }
      throw e;
    }

    return c.json({
      success: true,
      studyThreads: rows.map((row) => {
        const { parentNoteTitle, ...entry } = row;
        return {
          ...mapStudyRow(entry),
          parentNoteTitle: parentNoteTitle ?? '',
        };
      }),
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/study-threads/by-scripture',
      action: 'study_threads_by_scripture_space',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/study-threads ───────────────────────────────────
// Returns connected components of the NoteConnections graph as "study threads".
// Each component is represented by its highest-degree node (most connections).
route.get('/api/spaces/:spaceId/study-threads', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceIdRaw = requireParam(c, 'spaceId');
    const spaceIdNorm = spaceIdRaw.startsWith('space_') ? spaceIdRaw : `space_${spaceIdRaw}`;
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    // Load all NoteConnections for this user in this space.
    const edges = await db
      .select({ fromNoteId: NoteConnections.fromNoteId, toNoteId: NoteConnections.toNoteId })
      .from(NoteConnections)
      .where(and(eq(NoteConnections.userId, auth.userId), eq(NoteConnections.spaceId, spaceIdNorm)));

    if (edges.length === 0) {
      return c.json({ threads: [] });
    }

    // Build adjacency list and degree count.
    const adj = new Map<string, Set<string>>();
    const degree = new Map<string, number>();
    for (const e of edges) {
      if (!adj.has(e.fromNoteId)) adj.set(e.fromNoteId, new Set());
      if (!adj.has(e.toNoteId)) adj.set(e.toNoteId, new Set());
      adj.get(e.fromNoteId)!.add(e.toNoteId);
      adj.get(e.toNoteId)!.add(e.fromNoteId);
      degree.set(e.fromNoteId, (degree.get(e.fromNoteId) ?? 0) + 1);
      degree.set(e.toNoteId, (degree.get(e.toNoteId) ?? 0) + 1);
    }

    // BFS to find connected components.
    const allNodeIds = [...adj.keys()];
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const start of allNodeIds) {
      if (visited.has(start)) continue;
      const component: string[] = [];
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const node = queue.shift()!;
        component.push(node);
        for (const neighbor of adj.get(node) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(component);
    }

    const repIds = components.map((members) => pickStudyThreadRepresentativeNoteId(members, degree)!);

    const allMemberIds = [...new Set(components.flat())];
    const memberRows = await fetchStudyThreadNoteRows(allMemberIds, auth.userId);

    const memberMap = new Map(memberRows.map((r) => [r.id, r]));

    const resourceIds = memberRows.filter((n) => n.noteType === 'resource').map((n) => n.id);
    let resourceMap: Record<
      string,
      { sourceTitle: string | null; sourceDescription: string | null }
    > = {};
    if (resourceIds.length > 0) {
      try {
        const rmList = await db
          .select({
            noteId: ResourceMetadata.noteId,
            sourceTitle: ResourceMetadata.sourceTitle,
            sourceDescription: ResourceMetadata.sourceDescription,
          })
          .from(ResourceMetadata)
          .where(inArray(ResourceMetadata.noteId, resourceIds));
        resourceMap = Object.fromEntries(rmList.map((m) => [m.noteId, m]));
      } catch {
        resourceMap = {};
      }
    }

    const toSuggestNode = (id: string): StudyThreadSuggestNode | null => {
      const n = memberMap.get(id);
      if (!n) return null;
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
    };

    // Build response, sorted by component size desc then recency.
    const threads = components
      .map((members, i) => {
        const repId = repIds[i];
        const rep = memberMap.get(repId);
        const memberRows = members
          .map((id) => memberMap.get(id))
          .filter((row): row is NonNullable<typeof row> => row != null);
        const suggestNodes = members.map(toSuggestNode).filter((n): n is StudyThreadSuggestNode => n != null);
        const naming = resolveStudyThreadClusterNaming(memberRows, suggestNodes, repId);
        return {
          id: repId,
          title: naming.threadTitle,
          suggestedTitle: naming.suggestedTitle,
          hasCustomTitle: naming.studyThreadUserOverride,
          studyThreadPinned: naming.studyThreadPinned,
          noteCount: members.length,
          updatedAt: rep?.updatedAt ? rep.updatedAt.toISOString() : null,
          memberIds: members,
        };
      })
      .sort((a, b) => {
        if (b.noteCount !== a.noteCount) return b.noteCount - a.noteCount;
        const tA = a.updatedAt ?? '';
        const tB = b.updatedAt ?? '';
        return tB.localeCompare(tA);
      });

    return c.json({ threads });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/study-threads',
      action: 'get_study_threads',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/connect-note-candidates ─────────────────────────
route.get('/api/spaces/:spaceId/connect-note-candidates', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceIdRaw = requireParam(c, 'spaceId');
    const spaceIdNorm = spaceIdRaw.startsWith('space_') ? spaceIdRaw : `space_${spaceIdRaw}`;
    try {
      await requireSpaceAccess(spaceIdNorm, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const q = (c.req.query('q') ?? '').trim();
    const excludeNoteIdRaw = (c.req.query('excludeNoteId') ?? '').trim();

    const limitParsed = parseInt(c.req.query('limit') || '15', 10);
    const limit = Math.min(Number.isFinite(limitParsed) ? limitParsed : 15, 30);

    const baseFilters = [
      eq(Notes.userId, auth.userId),
      eq(Notes.spaceId, spaceIdNorm),
      eq(Notes.noteType, 'default'),
    ];
    if (excludeNoteIdRaw) baseFilters.push(ne(Notes.id, excludeNoteIdRaw));

    const filters = q.length >= 1
      ? [...baseFilters, sql`COALESCE(${Notes.title}, '') ILIKE ${'%' + q + '%'}`]
      : baseFilters;

    const rows = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        noteType: Notes.noteType,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(and(...filters))
      .orderBy(desc(Notes.updatedAt))
      .limit(limit);

    return c.json({
      notes: rows.map((r) => ({
        id: r.id,
        title: r.title ?? '',
        noteType: r.noteType || 'default',
      })),
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/[spaceId]/connect-note-candidates',
      action: 'connect_note_candidates',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/items ─────────────────────────────────────────
route.get('/api/spaces/:spaceId/items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try {
      accessInfo = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    if (accessInfo.role === 'owner') {
      const [notesResult, threads] = await Promise.all([
        getNotesForSpace(spaceId, auth.userId),
        getThreadsForSpace(spaceId, auth.userId),
      ]);
      return c.json({ notes: notesResult.notes, threads });
    } else {
      const [notesResult, threads] = await Promise.all([
        getNotesForSpaceForMember(spaceId, accessInfo.space.userId),
        getThreadsForSpaceBySpaceId(spaceId),
      ]);
      return c.json({ notes: notesResult.notes, threads });
    }
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/items', action: 'get_space_items' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/bootstrap ──────────────────────────────────────
// Returns space metadata + items in one response for faster initial load (one round-trip).
route.get('/api/spaces/:spaceId/bootstrap', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try {
      accessInfo = await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const spaceRow = accessInfo.space;
    const spaceDetail = {
      id: spaceRow.id,
      title: spaceRow.title,
      color: spaceRow.color,
      backgroundGradient: spaceRow.backgroundGradient || getThreadGradientCSS(spaceRow.color || 'paper'),
      ownerId: spaceRow.userId,
      memberCount: 0,
      isPublic: spaceRow.isPublic,
    };

    const [notesResult, threads] =
      accessInfo.role === 'owner'
        ? await Promise.all([
            getNotesForSpace(spaceId, auth.userId),
            getThreadsForSpace(spaceId, auth.userId),
          ])
        : await Promise.all([
            getNotesForSpaceForMember(spaceId, spaceRow.userId),
            getThreadsForSpaceBySpaceId(spaceId),
          ]);

    return c.json(
      { space: spaceDetail, items: { threads, notes: notesResult.notes } },
      200,
      { 'Cache-Control': 'private, no-cache' },
    );
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/bootstrap', action: 'get_space_bootstrap' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/prefetch ──────────────────────────────────────
route.get('/api/spaces/:spaceId/prefetch', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    // Try owner path first
    const ownerSpaces = await getSpacesWithCounts(auth.userId);
    const ownerSpace = ownerSpaces.find((s: any) => s.id === spaceId);
    if (ownerSpace) {
      return c.json({
        space: {
          id: ownerSpace.id,
          title: ownerSpace.title,
          color: ownerSpace.color,
          backgroundGradient: ownerSpace.backgroundGradient,
          totalItemCount: ownerSpace.totalItemCount,
          isPublic: ownerSpace.isPublic,
          ownerId: auth.userId,
          memberCount: 0,
        },
      }, 200, { 'Cache-Control': 'private, no-cache' });
    }

    // Member path
    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).limit(1));
    if (!space) return c.json({ error: 'Space not found' }, 404);

    const member = first(await db.select().from(Members).where(and(eq(Members.spaceId, spaceId), eq(Members.userId, auth.userId))).limit(1));
    if (!member) return c.json({ error: 'Access denied' }, 403);

    const noteCountResult = first(await db.select({ count: count() }).from(Notes).where(eq(Notes.spaceId, spaceId)).limit(1));
    const threadCountResult = first(await db.select({ count: count() }).from(Threads).where(eq(Threads.spaceId, spaceId)).limit(1));
    const totalItemCount = (noteCountResult?.count || 0) + (threadCountResult?.count || 0);

    return c.json({
      space: {
        id: space.id,
        title: space.title,
        color: space.color,
        backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper'),
        totalItemCount,
        isPublic: space.isPublic,
        ownerId: space.userId,
        memberCount: 0,
      },
    }, 200, { 'Cache-Control': 'private, no-cache' });
  } catch (error: any) {
    console.error('Error prefetching space:', error);
    return c.json({ error: 'Failed to fetch space data' }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/add-note ─────────────────────────────────────
route.post('/api/spaces/:spaceId/add-note', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    try { await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { noteId } = await c.req.json();
    if (!noteId) return c.json({ error: 'Note ID is required' }, 400);

    const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
    if (!note) return c.json({ error: 'Note not found or access denied' }, 404);
    if (note.addedBy === 'system') return c.json({ error: 'Cannot add onboarding notes to a space' }, 400);

    await db.update(Notes).set({ spaceId }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    return c.json({ success: true, message: 'Note added to space' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/add-note', action: 'add_note_to_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/add-thread ───────────────────────────────────
route.post('/api/spaces/:spaceId/add-thread', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    try { await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { threadId } = await c.req.json();
    if (!threadId) return c.json({ error: 'Thread ID is required' }, 400);
    if (threadId === 'thread_unorganized') return c.json({ error: 'Cannot add unorganized thread to a space' }, 400);
    if (threadId.startsWith('thread_onboarding_')) return c.json({ error: 'Cannot add onboarding thread to a space' }, 400);

    const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
    if (!thread) return c.json({ error: 'Thread not found or access denied' }, 404);

    await db.update(Threads).set({ spaceId }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    await db.update(Notes).set({ spaceId }).where(and(eq(Notes.threadId, threadId), eq(Notes.userId, auth.userId)));
    return c.json({ success: true, message: 'Thread added to space' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/add-thread', action: 'add_thread_to_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/add-items ────────────────────────────────────
route.post('/api/spaces/:spaceId/add-items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    try { await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { noteIds = [], threadIds = [] } = await c.req.json();
    const errors: string[] = [];
    let updatedNotes = 0, updatedThreads = 0;

    for (const noteId of noteIds) {
      try {
        const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
        if (!note) { errors.push(`Note ${noteId} not found`); continue; }
        if (note.addedBy === 'system') { errors.push('Cannot add onboarding notes to a space'); continue; }
        await db.update(Notes).set({ spaceId }).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
        updatedNotes++;
      } catch (e: any) { errors.push(`Note ${noteId}: ${e.message}`); }
    }

    for (const threadId of threadIds) {
      try {
        if (threadId === 'thread_unorganized') { errors.push('Cannot add unorganized thread'); continue; }
        if (threadId.startsWith('thread_onboarding_')) { errors.push('Cannot add onboarding thread'); continue; }
        const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
        if (!thread) { errors.push(`Thread ${threadId} not found`); continue; }
        await db.update(Threads).set({ spaceId }).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
        await db.update(Notes).set({ spaceId }).where(and(eq(Notes.threadId, threadId), eq(Notes.userId, auth.userId)));
        updatedThreads++;
      } catch (e: any) { errors.push(`Thread ${threadId}: ${e.message}`); }
    }

    return c.json({ success: true, updatedNotes, updatedThreads, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/add-items', action: 'add_items_to_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/remove-items ─────────────────────────────────
route.post('/api/spaces/:spaceId/remove-items', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { noteIds = [], threadIds = [] } = await c.req.json();
    const errors: string[] = [];
    let removedNotes = 0, removedThreads = 0;
    const isOwner = accessInfo.role === 'owner';

    for (const noteId of noteIds) {
      try {
        const note = first(await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.spaceId, spaceId))).limit(1));
        if (!note) { errors.push(`Note ${noteId} not found in space`); continue; }
        if (!isOwner && note.userId !== auth.userId) { errors.push(`Note ${noteId}: no permission`); continue; }
        await db.update(Notes).set({ spaceId: null }).where(eq(Notes.id, noteId));
        removedNotes++;
      } catch (e: any) { errors.push(`Note ${noteId}: ${e.message}`); }
    }

    for (const threadId of threadIds) {
      try {
        if (threadId === 'thread_unorganized') { errors.push('Cannot remove unorganized thread'); continue; }
        const thread = first(await db.select().from(Threads).where(and(eq(Threads.id, threadId), eq(Threads.spaceId, spaceId))).limit(1));
        if (!thread) { errors.push(`Thread ${threadId} not found in space`); continue; }
        if (!isOwner && thread.userId !== auth.userId) { errors.push(`Thread ${threadId}: no permission`); continue; }
        await db.update(Threads).set({ spaceId: null }).where(eq(Threads.id, threadId));
        // Also null Notes.spaceId for notes in this thread that belong to this space
        await db.update(Notes).set({ spaceId: null }).where(and(eq(Notes.threadId, threadId), eq(Notes.spaceId, spaceId)));
        removedThreads++;
      } catch (e: any) { errors.push(`Thread ${threadId}: ${e.message}`); }
    }

    return c.json({ success: true, removedNotes, removedThreads, errors: errors.length > 0 ? errors : undefined });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/remove-items', action: 'remove_items_from_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/pin-item ──────────────────────────────────────
route.post('/api/spaces/:spaceId/pin-item', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    if (accessInfo.role !== 'owner') {
      return c.json({ error: 'Only the space owner can pin items', code: 'FORBIDDEN' }, 403);
    }

    const { itemId, itemType, isPinned } = await c.req.json();
    if (!itemId || !itemType || typeof isPinned !== 'boolean') {
      return c.json({ error: 'itemId, itemType, and isPinned are required', code: 'BAD_REQUEST' }, 400);
    }

    if (itemType === 'note') {
      const note = first(await db.select({ id: Notes.id }).from(Notes).where(and(eq(Notes.id, itemId), eq(Notes.spaceId, spaceId))).limit(1));
      if (!note) return c.json({ error: 'Note not found in space', code: 'NOT_FOUND' }, 404);
      await db.update(Notes).set({ isPinned }).where(eq(Notes.id, itemId));
    } else if (itemType === 'thread') {
      const thread = first(await db.select({ id: Threads.id }).from(Threads).where(and(eq(Threads.id, itemId), eq(Threads.spaceId, spaceId))).limit(1));
      if (!thread) return c.json({ error: 'Thread not found in space', code: 'NOT_FOUND' }, 404);
      await db.update(Threads).set({ isPinned }).where(eq(Threads.id, itemId));
    } else {
      return c.json({ error: 'itemType must be "note" or "thread"', code: 'BAD_REQUEST' }, 400);
    }

    return c.json({ success: true });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/pin-item', action: 'pin_space_item' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/share-link ────────────────────────────────────
route.get('/api/spaces/:spaceId/share-link', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    try { await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const space = first(await db.select({ id: Spaces.id, isPublic: Spaces.isPublic, shareToken: Spaces.shareToken, userId: Spaces.userId })
      .from(Spaces).where(eq(Spaces.id, spaceId)).limit(1));
    if (!space) return c.json({ error: 'Space not found' }, 404);

    if (!space.isPublic) return c.json({ isPublic: false, shareToken: null, shareUrl: null });

    let effectiveShareToken = space.shareToken;
    if (!effectiveShareToken && space.userId === auth.userId) {
      // Auto-generate token for owner
      const tierCheck = await canCreateSharedSpace(auth.userId, auth);
      if (!tierCheck.allowed) return c.json({ error: tierCheck.reason, code: 'SHARED_SPACE_LIMIT_EXCEEDED' }, 403);
      effectiveShareToken = generateShareToken();
      await db.update(Spaces).set({ shareToken: effectiveShareToken, updatedAt: nowISO() }).where(eq(Spaces.id, spaceId));
    }

    const origin = new URL(c.req.url).origin;
    const shareUrl = effectiveShareToken ? `${origin}/spaces/join/${effectiveShareToken}` : null;

    return c.json({ isPublic: true, shareToken: effectiveShareToken, shareUrl });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/share-link', action: 'get_share_link' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/share-link ───────────────────────────────────
route.post('/api/spaces/:spaceId/share-link', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    const space = first(await db.select().from(Spaces).where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, auth.userId))).limit(1));
    if (!space) return c.json({ error: 'Space not found or access denied' }, 404);

    const { action } = await c.req.json();
    if (action !== 'refresh') return c.json({ error: 'Invalid action' }, 400);

    const newShareToken = generateShareToken();
    await db.update(Spaces).set({ shareToken: newShareToken, updatedAt: nowISO() }).where(eq(Spaces.id, spaceId));

    const origin = new URL(c.req.url).origin;
    return c.json({ success: true, shareToken: newShareToken, shareUrl: `${origin}/spaces/join/${newShareToken}` });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/share-link', action: 'refresh_share_link' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/members ───────────────────────────────────────
route.get('/api/spaces/:spaceId/members', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    let accessInfo: { role: string; space: any };
    try { accessInfo = await requireSpaceAccess(spaceId, auth.userId); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const isOwner = accessInfo.role === 'owner';
    const space = accessInfo.space;

    // Get members
    const members = await db.select().from(Members).where(eq(Members.spaceId, spaceId));
    const memberUserIds = members.map(m => m.userId);
    const allUserIds = [space.userId, ...memberUserIds];

    // Get user metadata for all
    let userMetadataMap: Record<string, any> = {};
    if (allUserIds.length > 0) {
      const metadata = await db.select().from(UserMetadata).where(inArray(UserMetadata.userId, allUserIds));
      userMetadataMap = Object.fromEntries(metadata.map(m => [m.userId, m]));
    }

    let isHarvousOwned = false;
    try {
      isHarvousOwned = space.userId === getHarvousSystemUserId();
    } catch {
      // env var not set in this environment — treat as normal user
    }

    const ownerMeta = userMetadataMap[space.userId] || {};
    const toDisplayName = (firstName: string | null, lastName: string | null, fallback: string) => {
      const first = firstName || '';
      const lastInitial = lastName ? lastName.charAt(0).toUpperCase() : '';
      return first ? (lastInitial ? `${first} ${lastInitial}.` : first) : fallback;
    };

    const ownerFirstName = isHarvousOwned ? 'Harvous' : (ownerMeta.firstName || null);
    const ownerLastName = isHarvousOwned ? null : (ownerMeta.lastName || null);
    const ownerDisplayName = isHarvousOwned
      ? 'Harvous'
      : toDisplayName(ownerMeta.firstName ?? null, ownerMeta.lastName ?? null, ownerMeta.email || 'Unknown User');

    const memberList = [
      {
        userId: space.userId, role: 'owner', joinedAt: space.createdAt,
        firstName: ownerFirstName,
        lastName: ownerLastName,
        displayName: ownerDisplayName,
        email: ownerMeta.email || null, profileImageUrl: ownerMeta.profileImageUrl || null,
        userColor: ownerMeta.userColor || 'blue',
      },
      ...members.map(m => {
        const meta = userMetadataMap[m.userId] || {};
        return {
          userId: m.userId, role: 'member', joinedAt: m.joinedAt || m.createdAt,
          firstName: meta.firstName || null,
          lastName: meta.lastName || null,
          displayName: toDisplayName(meta.firstName ?? null, meta.lastName ?? null, meta.email || 'Unknown User'),
          email: meta.email || null, profileImageUrl: meta.profileImageUrl || null,
          userColor: meta.userColor || 'blue',
        };
      }),
    ];

    // Pending invitations (owner only)
    let pendingInvitations: any[] = [];
    if (isOwner) {
      const invitations = await db.select().from(SpaceInvitations)
        .where(and(eq(SpaceInvitations.spaceId, spaceId), eq(SpaceInvitations.status, 'pending')));
      pendingInvitations = invitations.map(inv => ({
        id: inv.id, email: inv.invitedEmail, createdAt: inv.createdAt, expiresAt: inv.expiresAt,
      }));
    }

    // Tier limits
    const tier = await getTierForAuth(auth);
    const limits = getTierLimits(tier);

    return c.json({
      members: memberList,
      pendingInvitations: isOwner ? pendingInvitations : undefined,
      memberCount: memberList.length,
      isOwner,
      limits: isOwner ? {
        membersPerSpace: limits.membersPerSpace,
        ownedSharedSpaces: limits.ownedSharedSpaces,
      } : undefined,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/members', action: 'list_members' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/members/invite ───────────────────────────────
route.post('/api/spaces/:spaceId/members/invite', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');

    try { await requireSpaceAccess(spaceId, auth.userId, true); } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const { email, method = 'link' } = await c.req.json();

    // Check tier limits
    const memberCheck = await canAddMemberToSpace(spaceId, auth.userId, auth);
    if (!memberCheck.allowed) return c.json({ error: memberCheck.reason, code: 'MEMBER_LIMIT_EXCEEDED' }, 403);

    const sharedCheck = await canOwnerAddOneMoreSharedSpace(auth.userId, spaceId, auth);
    if (!sharedCheck.allowed) return c.json({ error: sharedCheck.reason, code: 'SHARED_SPACE_LIMIT_EXCEEDED' }, 403);

    if (method === 'email' && email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) return c.json({ error: 'Invalid email address' }, 400);
    }

    const inviteToken = generateShareToken();
    const now = nowISO();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(SpaceInvitations).values({
      id: `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      spaceId,
      invitedBy: auth.userId,
      invitedEmail: email || null,
      inviteToken,
      status: 'pending',
      expiresAt,
      createdAt: now,
    });

    const origin = new URL(c.req.url).origin;
    const inviteUrl = `${origin}/spaces/join/${inviteToken}`;

    return c.json({ success: true, inviteUrl, inviteToken, expiresAt });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/members/invite', action: 'invite_member' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/spaces/:spaceId/members/:userId ────────────────────────────
route.delete('/api/spaces/:spaceId/members/:userId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const spaceId = requireParam(c, 'spaceId');
    const targetUserId = requireParam(c, 'userId');

    const space = first(await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).limit(1));
    if (!space) return c.json({ error: 'Space not found' }, 404);

    const isOwner = space.userId === auth.userId;
    const isSelf = auth.userId === targetUserId;

    // Owner can't leave
    if (targetUserId === space.userId) return c.json({ error: 'Space owner cannot be removed. Transfer or delete the space instead.' }, 400);

    // Members can only remove themselves
    if (!isOwner && !isSelf) return c.json({ error: 'Only the space owner can remove other members' }, 403);

    const member = first(await db.select().from(Members).where(and(eq(Members.spaceId, spaceId), eq(Members.userId, targetUserId))).limit(1));
    if (!member) return c.json({ error: 'User is not a member of this space' }, 404);

    await db.delete(Members).where(and(eq(Members.spaceId, spaceId), eq(Members.userId, targetUserId)));

    return c.json({ success: true, message: isSelf ? 'You have left the space' : 'Member removed from space' });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/[spaceId]/members/[userId]', action: 'remove_member' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/join/:token ───────────────────────────────────────────
route.post('/api/spaces/join/:token', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const token = requireParam(c, 'token');

    const space = first(await db.select().from(Spaces).where(eq(Spaces.shareToken, token)).limit(1));
    if (!space) return c.json({ error: 'Invalid or expired invite link' }, 404);
    if (!space.isPublic) return c.json({ error: 'This space is no longer accepting new members' }, 403);

    if (space.userId === auth.userId) return c.json({ error: 'You are the owner of this space' }, 400);

    const existingMember = first(await db.select().from(Members).where(and(eq(Members.spaceId, space.id), eq(Members.userId, auth.userId))).limit(1));
    if (existingMember) return c.json({ error: 'You are already a member of this space' }, 400);

    // Tier checks (owner's limits)
    const memberCheck = await canAddMemberToSpaceByOwnerId(space.id, space.userId);
    if (!memberCheck.allowed) return c.json({ error: memberCheck.reason, code: 'MEMBER_LIMIT_EXCEEDED' }, 403);

    const sharedCheck = await canOwnerAddOneMoreSharedSpace(space.userId, space.id);
    if (!sharedCheck.allowed) return c.json({ error: sharedCheck.reason, code: 'SHARED_SPACE_LIMIT_EXCEEDED' }, 403);

    const now = nowISO();
    await db.insert(Members).values({
      id: `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      spaceId: space.id,
      userId: auth.userId,
      role: 'member',
      joinedAt: now,
      createdAt: now,
    });

    return c.json({ success: true, spaceId: space.id, spaceName: space.title, redirectUrl: idToUrl(space.id) });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/spaces/join/[token]', action: 'join_space' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/join-preview/:token ────────────────────────────────────
route.get('/api/spaces/join-preview/:token', async (c) => {
  try {
    const token = requireParam(c, 'token');

    const space = first(await db.select().from(Spaces).where(eq(Spaces.shareToken, token)).limit(1));
    if (!space) return c.json({ error: 'Space not found or link expired' }, 404);
    if (!space.isPublic) return c.json({ error: 'This space is no longer public' }, 403);

    // Owner info (first name + last initial only; never full last name)
    let isHarvousOwned = false;
    try {
      isHarvousOwned = space.userId === getHarvousSystemUserId();
    } catch { /* env var not set in this environment — treat as normal user */ }

    const ownerMeta = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, space.userId)).limit(1));
    const ownerFirst = ownerMeta?.firstName || '';
    const ownerLastInitial = ownerMeta?.lastName ? ownerMeta.lastName.charAt(0).toUpperCase() : '';
    const ownerDisplayName = isHarvousOwned
      ? 'Harvous'
      : (ownerFirst
        ? (ownerLastInitial ? `${ownerFirst} ${ownerLastInitial}.` : ownerFirst)
        : 'Anonymous');

    // Member count
    const memberCount = await getSpaceMemberCount(space.id);
    const totalMembers = memberCount + 1; // +1 for owner

    // Thread preview (up to 5)
    const threads = await db.select({ id: Threads.id, title: Threads.title, color: Threads.color })
      .from(Threads).where(eq(Threads.spaceId, space.id))
      .orderBy(desc(Threads.updatedAt)).limit(5);

    const threadIds = threads.map(t => t.id);
    let noteCountsMap = new Map<string, number>();
    if (threadIds.length > 0) {
      const noteCounts = await db.select({ threadId: NoteThreads.threadId, count: count() })
        .from(NoteThreads).where(inArray(NoteThreads.threadId, threadIds))
        .groupBy(NoteThreads.threadId);
      noteCountsMap = new Map(noteCounts.map(item => [item.threadId, item.count]));
    }

    const threadPreviews = threads.map(t => ({
      id: t.id, title: t.title, color: t.color, noteCount: noteCountsMap.get(t.id) || 0,
    }));

    // Note preview (up to 10, unencrypted only)
    const notes = await db.select({
      id: Notes.id,
      title: Notes.title,
      noteType: Notes.noteType,
      content: Notes.content,
      createdAt: Notes.createdAt,
    }).from(Notes)
      .where(and(eq(Notes.spaceId, space.id), eq(Notes.contentEncrypted, false)))
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited), desc(Notes.updatedAt), desc(Notes.createdAt)
      ).limit(10);

    const SCRIPTURE_TRANSLATION_ATTR_RE = /data-scripture-translation\s*=\s*["']([^"']+)["']/i;
    const extractScriptureTranslation = (content: string | null | undefined) => {
      const m = content?.match(SCRIPTURE_TRANSLATION_ATTR_RE);
      const v = m?.[1]?.trim();
      return v ? v.toUpperCase() : undefined;
    };

    // Enrich scripture note previews with translation abbreviation for CondensedNoteItem.
    const scriptureNoteIds = notes
      .filter(n => n.noteType === 'scripture')
      .map(n => n.id)
      .filter(Boolean);

    let scriptureVersionMap: Record<string, string> = {};
    if (scriptureNoteIds.length > 0) {
      try {
        const rows = await db.select({ noteId: ScriptureMetadata.noteId, translation: ScriptureMetadata.translation })
          .from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, scriptureNoteIds));
        scriptureVersionMap = rows.reduce((acc, row) => {
          if (row.noteId && row.translation) acc[row.noteId] = row.translation;
          return acc;
        }, {} as Record<string, string>);
      } catch (_) { /* ignore */ }
    }

    const notePreviews = notes.map(n => {
      if (n.noteType !== 'scripture') {
        return { id: n.id, title: n.title, noteType: n.noteType, createdAt: n.createdAt };
      }

      const scriptureTranslation = scriptureVersionMap[n.id] ?? extractScriptureTranslation(n.content) ?? 'NET';
      return {
        id: n.id,
        title: n.title,
        noteType: n.noteType,
        createdAt: n.createdAt,
        version: scriptureTranslation,
        scriptureTranslation,
      };
    });

    // Check if auth user is already a member
    let isAlreadyMember = false;
    try {
      const auth = getAuth(c);
      if (auth.userId) {
        if (space.userId === auth.userId) isAlreadyMember = true;
        else {
          const member = first(await db.select().from(Members).where(and(eq(Members.spaceId, space.id), eq(Members.userId, auth.userId))).limit(1));
          if (member) isAlreadyMember = true;
        }
      }
    } catch {}

    return c.json({
      space: {
        id: space.id, title: space.title, color: space.color,
        backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper'),
        description: space.description,
      },
      owner: { displayName: ownerDisplayName, isHarvousOwned, profileImageUrl: ownerMeta?.profileImageUrl || null },
      memberCount: totalMembers,
      threadPreviews,
      notePreviews,
      isAlreadyMember,
    });
  } catch (error: any) {
    console.error('Error fetching space preview:', error);
    return c.json({ error: 'Failed to load space preview' }, 500);
  }
});

export default route;
