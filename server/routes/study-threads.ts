/**
 * Study thread entries API — server-backed anchored study branches (native `StudyThread` parity).
 *
 * GET    /api/notes/:parentNoteId/study-threads
 * POST   /api/notes/:parentNoteId/study-threads
 * GET    /api/notes/:parentNoteId/study-threads/by-scripture
 * PATCH  /api/study-threads/:id
 * DELETE /api/study-threads/:id
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  first,
  Notes,
  NoteConnections,
  StudyThreadEntries,
  eq,
  and,
  desc,
} from '../db';
import { nowISO } from '../db/dates';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { generateStudyThreadEntryId, generateNoteId } from '@/utils/ids';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { broadcastInvalidation } from '../utils/realtime';
import { batchAuthorAttribution } from '../utils/dashboard-data';
import {
  canModerateStudyThreadEntry,
  loadParentNoteContext,
  requireSharedStudyThreadParentAccess,
  resolveViewerSpaceRoleForNote,
  SharedStudyThreadAccessError,
} from '../utils/shared-study-thread-access';
import { SpaceAccessError } from '../utils/space-access';

const route = new Hono();

const ENTRY_KINDS = new Set(['workspace', 'miniNote', 'linkedNote', 'scriptureLink', 'reference']);

async function touchParentNoteEditedAt(parentNoteId: string, parentAuthorUserId: string, actorUserId: string) {
  if (parentAuthorUserId !== actorUserId) {
    broadcastInvalidation(parentAuthorUserId, { type: 'note:updated', id: parentNoteId });
    return;
  }
  await db
    .update(Notes)
    .set({ updatedAt: nowISO() })
    .where(and(eq(Notes.id, parentNoteId), eq(Notes.userId, parentAuthorUserId)));
  broadcastInvalidation(parentAuthorUserId, { type: 'note:updated', id: parentNoteId });
}

function isUnionedSharedParent(parent: Awaited<ReturnType<typeof loadParentNoteContext>>) {
  return (
    parent != null &&
    parent.spaceId != null &&
    (parent.spaceType === 'shared' || parent.spaceType === 'public')
  );
}

export function mapStudyRow(row: typeof StudyThreadEntries.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    parentNoteId: row.parentNoteId,
    spaceId: row.spaceId,
    entryKind: row.entryKindRaw,
    highlightAccentRaw: row.highlightAccentRaw,
    sourceSnippet: row.sourceSnippet,
    focusTitle: row.focusTitle,
    notesBody: row.notesBody,
    miniNoteBody: row.miniNoteBody,
    linkedNoteId: row.linkedNoteId,
    linkedNoteTitle: row.linkedNoteTitle,
    anchorLocation: row.anchorLocation,
    anchorLength: row.anchorLength,
    anchorTextSnapshot: row.anchorTextSnapshot,
    scriptureReference: row.scriptureReference,
    scripturePassageTranslation: row.scripturePassageTranslation,
    scripturePassageExcerpt: row.scripturePassageExcerpt,
    isArchived: row.isArchived,
    highlightListEditedAt: row.highlightListEditedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function mapUnionedRows(rows: typeof StudyThreadEntries.$inferSelect[], viewerUserId: string) {
  const authorMap = await batchAuthorAttribution(rows.map((row) => row.userId));
  return rows.map((row) => {
    const mapped = mapStudyRow(row);
    const author = authorMap[row.userId];
    return {
      ...mapped,
      authorDisplayName: author?.displayName ?? 'A Harvous User',
      authorColor: author?.userColor ?? 'blue',
      isOwnHighlight: row.userId === viewerUserId,
    };
  });
}

function handleStudyThreadAccessError(c: any, err: unknown) {
  if (err instanceof SharedStudyThreadAccessError || err instanceof SpaceAccessError) {
    return c.json({ error: err.message, code: err.code }, err.status);
  }
  throw err;
}

// ─── GET /api/notes/:parentNoteId/study-threads ───────────────────────────────
route.get('/api/notes/:parentNoteId/study-threads', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const parentNoteId = c.req.param('parentNoteId');

    let parentCtx;
    try {
      ({ parent: parentCtx } = await requireSharedStudyThreadParentAccess(parentNoteId, auth.userId));
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    const unioned = isUnionedSharedParent(parentCtx);
    const listWhere = unioned
      ? and(eq(StudyThreadEntries.parentNoteId, parentNoteId), eq(StudyThreadEntries.isArchived, false))
      : and(
          eq(StudyThreadEntries.parentNoteId, parentNoteId),
          eq(StudyThreadEntries.userId, auth.userId),
          eq(StudyThreadEntries.isArchived, false),
        );
    const rows = await db
      .select()
      .from(StudyThreadEntries)
      .where(listWhere)
      .orderBy(desc(StudyThreadEntries.highlightListEditedAt), desc(StudyThreadEntries.createdAt));

    const studyThreads = unioned ? await mapUnionedRows(rows, auth.userId) : rows.map(mapStudyRow);

    return c.json({
      success: true,
      studyThreads,
    });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/notes/[parentNoteId]/study-threads', action: 'list_study_threads' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/notes/:parentNoteId/study-threads/by-scripture ────────────────
route.get('/api/notes/:parentNoteId/study-threads/by-scripture', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const parentNoteId = c.req.param('parentNoteId');
    const refRaw = c.req.query('reference') ?? '';
    const translation = (c.req.query('translation') ?? '').trim() || 'NET';
    const norm = normalizeScriptureReference(refRaw.trim()) ?? refRaw.trim();
    if (!norm) return c.json({ error: 'reference query required' }, 400);

    let parentCtx;
    try {
      ({ parent: parentCtx } = await requireSharedStudyThreadParentAccess(parentNoteId, auth.userId));
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    const unioned = isUnionedSharedParent(parentCtx);
    const byScriptureWhere = unioned
      ? and(
          eq(StudyThreadEntries.parentNoteId, parentNoteId),
          eq(StudyThreadEntries.scriptureReference, norm),
          eq(StudyThreadEntries.scripturePassageTranslation, translation),
        )
      : and(
          eq(StudyThreadEntries.parentNoteId, parentNoteId),
          eq(StudyThreadEntries.userId, auth.userId),
          eq(StudyThreadEntries.scriptureReference, norm),
          eq(StudyThreadEntries.scripturePassageTranslation, translation),
        );
    const rows = await db
      .select()
      .from(StudyThreadEntries)
      .where(byScriptureWhere)
      .orderBy(desc(StudyThreadEntries.createdAt));

    const studyThreads = unioned ? await mapUnionedRows(rows, auth.userId) : rows.map(mapStudyRow);

    return c.json({
      success: true,
      studyThreads,
    });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/notes/[parentNoteId]/study-threads/by-scripture', action: 'by_scripture' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/notes/:parentNoteId/study-threads ────────────────────────────
route.post('/api/notes/:parentNoteId/study-threads', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const parentNoteId = c.req.param('parentNoteId');

    let parentCtx;
    try {
      ({ parent: parentCtx } = await requireSharedStudyThreadParentAccess(parentNoteId, auth.userId));
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    const body = await c.req.json();
    const entryKind = typeof body.entryKind === 'string' ? body.entryKind : 'miniNote';
    if (!ENTRY_KINDS.has(entryKind)) {
      return c.json({ error: 'Invalid entryKind', code: 'INVALID_ENTRY_KIND' }, 400);
    }

    const highlightAccentRaw =
      typeof body.highlightAccentRaw === 'string' && body.highlightAccentRaw.trim()
        ? body.highlightAccentRaw.trim()
        : 'warmAmber';

    const sourceSnippet = typeof body.sourceSnippet === 'string' ? body.sourceSnippet : '';
    const focusTitle = typeof body.focusTitle === 'string' ? body.focusTitle : '';
    const notesBody = typeof body.notesBody === 'string' ? body.notesBody : '';
    const miniNoteBody = typeof body.miniNoteBody === 'string' ? body.miniNoteBody : '';

    const id = generateStudyThreadEntryId();
    const now = nowISO();
    const spaceId = parentCtx.spaceId;

    await db.insert(StudyThreadEntries).values({
      id,
      userId: auth.userId,
      parentNoteId,
      spaceId,
      entryKindRaw: entryKind,
      highlightAccentRaw,
      sourceSnippet,
      focusTitle,
      notesBody,
      miniNoteBody,
      linkedNoteId: typeof body.linkedNoteId === 'string' ? body.linkedNoteId : null,
      linkedNoteTitle: typeof body.linkedNoteTitle === 'string' ? body.linkedNoteTitle : null,
      anchorLocation: typeof body.anchorLocation === 'number' ? body.anchorLocation : null,
      anchorLength: typeof body.anchorLength === 'number' ? body.anchorLength : null,
      anchorTextSnapshot: typeof body.anchorTextSnapshot === 'string' ? body.anchorTextSnapshot : null,
      scriptureReference:
        typeof body.scriptureReference === 'string' ? normalizeScriptureReference(body.scriptureReference.trim()) ?? body.scriptureReference : null,
      scripturePassageTranslation:
        typeof body.scripturePassageTranslation === 'string' ? body.scripturePassageTranslation : null,
      scripturePassageExcerpt: typeof body.scripturePassageExcerpt === 'string' ? body.scripturePassageExcerpt : null,
      isArchived: false,
      highlightListEditedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const resolvedLinkedNoteId = typeof body.linkedNoteId === 'string' ? body.linkedNoteId : null;
    if (entryKind === 'linkedNote' && resolvedLinkedNoteId && resolvedLinkedNoteId !== parentNoteId) {
      try {
        await db.insert(NoteConnections).values({
          id: generateNoteId(),
          fromNoteId: parentNoteId,
          toNoteId: resolvedLinkedNoteId,
          userId: auth.userId,
          spaceId,
          createdAt: now,
        });
      } catch {
        /* already connected */
      }
    }

    await touchParentNoteEditedAt(parentNoteId, parentCtx.userId, auth.userId);
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: parentNoteId });

    const row = first(await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.id, id)).limit(1));
    const mapped = row ? mapStudyRow(row) : null;
    if (mapped && parentCtx.userId !== auth.userId) {
      const authorMap = await batchAuthorAttribution([auth.userId]);
      const author = authorMap[auth.userId];
      return c.json({
        success: true,
        studyThread: {
          ...mapped,
          authorDisplayName: author?.displayName ?? 'A Harvous User',
          authorColor: author?.userColor ?? 'blue',
          isOwnHighlight: true,
        },
      });
    }
    return c.json({ success: true, studyThread: mapped });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/notes/[parentNoteId]/study-threads', action: 'create_study_thread' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── PATCH /api/study-threads/:id ─────────────────────────────────────────────
route.patch('/api/study-threads/:id', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const id = c.req.param('id');
    const existing = first(
      await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.id, id)).limit(1),
    );
    if (!existing) return c.json({ error: 'Study thread not found' }, 404);

    const parent = await loadParentNoteContext(existing.parentNoteId);
    if (!parent) return c.json({ error: 'Study thread not found' }, 404);

    const viewerRole =
      (await resolveViewerSpaceRoleForNote(parent.spaceId, auth.userId)) ??
      (parent.userId === auth.userId ? 'owner' : null);
    if (
      !viewerRole ||
      !canModerateStudyThreadEntry({
        annotatorUserId: existing.userId,
        parentAuthorUserId: parent.userId,
        viewerUserId: auth.userId,
        viewerSpaceRole: viewerRole,
      })
    ) {
      return c.json({ error: 'You cannot edit this annotation', code: 'FORBIDDEN' }, 403);
    }

    const isAnnotator = existing.userId === auth.userId;
    const body = await c.req.json();
    const patch: Record<string, unknown> = { updatedAt: nowISO() };

    if (typeof body.highlightAccentRaw === 'string') {
      patch.highlightAccentRaw = body.highlightAccentRaw;
      patch.highlightListEditedAt = nowISO();
    }
    if (typeof body.sourceSnippet === 'string') patch.sourceSnippet = body.sourceSnippet;
    if (typeof body.focusTitle === 'string') patch.focusTitle = body.focusTitle;
    if (typeof body.notesBody === 'string') patch.notesBody = body.notesBody;
    if (typeof body.miniNoteBody === 'string') patch.miniNoteBody = body.miniNoteBody;
    if (isAnnotator) {
      if (typeof body.linkedNoteId === 'string' || body.linkedNoteId === null) patch.linkedNoteId = body.linkedNoteId;
      if (typeof body.linkedNoteTitle === 'string') patch.linkedNoteTitle = body.linkedNoteTitle;
      if (typeof body.anchorLocation === 'number' || body.anchorLocation === null) patch.anchorLocation = body.anchorLocation;
      if (typeof body.anchorLength === 'number' || body.anchorLength === null) patch.anchorLength = body.anchorLength;
      if (typeof body.anchorTextSnapshot === 'string' || body.anchorTextSnapshot === null) {
        patch.anchorTextSnapshot = body.anchorTextSnapshot;
      }
      if (typeof body.scriptureReference === 'string') {
        patch.scriptureReference = normalizeScriptureReference(body.scriptureReference.trim()) ?? body.scriptureReference;
      }
      if (typeof body.scripturePassageTranslation === 'string') patch.scripturePassageTranslation = body.scripturePassageTranslation;
      if (typeof body.scripturePassageExcerpt === 'string') patch.scripturePassageExcerpt = body.scripturePassageExcerpt;
      if (typeof body.isArchived === 'boolean') patch.isArchived = body.isArchived;
      if (typeof body.entryKind === 'string' && ENTRY_KINDS.has(body.entryKind)) patch.entryKindRaw = body.entryKind;
    }

    await db.update(StudyThreadEntries).set(patch as any).where(eq(StudyThreadEntries.id, id));

    await touchParentNoteEditedAt(existing.parentNoteId, parent.userId, auth.userId);
    broadcastInvalidation(existing.userId, { type: 'note:updated', id: existing.parentNoteId });

    const row = first(await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.id, id)).limit(1));
    return c.json({ success: true, studyThread: row ? mapStudyRow(row) : null });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/study-threads/[id]', action: 'patch_study_thread' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── DELETE /api/study-threads/:id ──────────────────────────────────────────
route.delete('/api/study-threads/:id', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const id = c.req.param('id');
    const existing = first(
      await db.select().from(StudyThreadEntries).where(eq(StudyThreadEntries.id, id)).limit(1),
    );
    if (!existing) return c.json({ error: 'Study thread not found' }, 404);

    const parent = await loadParentNoteContext(existing.parentNoteId);
    if (!parent) return c.json({ error: 'Study thread not found' }, 404);

    const viewerRole =
      (await resolveViewerSpaceRoleForNote(parent.spaceId, auth.userId)) ??
      (parent.userId === auth.userId ? 'owner' : null);
    if (
      !viewerRole ||
      !canModerateStudyThreadEntry({
        annotatorUserId: existing.userId,
        parentAuthorUserId: parent.userId,
        viewerUserId: auth.userId,
        viewerSpaceRole: viewerRole,
      })
    ) {
      return c.json({ error: 'You cannot delete this annotation', code: 'FORBIDDEN' }, 403);
    }

    await db.delete(StudyThreadEntries).where(eq(StudyThreadEntries.id, id));

    await touchParentNoteEditedAt(existing.parentNoteId, parent.userId, auth.userId);
    broadcastInvalidation(existing.userId, { type: 'note:updated', id: existing.parentNoteId });

    if (existing.entryKindRaw === 'linkedNote' && existing.linkedNoteId) {
      try {
        await db.delete(NoteConnections).where(
          and(
            eq(NoteConnections.fromNoteId, existing.parentNoteId),
            eq(NoteConnections.toNoteId, existing.linkedNoteId),
            eq(NoteConnections.userId, existing.userId),
          ),
        );
      } catch {
        /* best-effort */
      }
    }

    return c.json({ success: true, deletedId: id });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/study-threads/[id]', action: 'delete_study_thread' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default route;
