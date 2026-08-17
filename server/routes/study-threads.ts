/**
 * Study thread entries API — server-backed anchored study branches (native `StudyThread` parity).
 *
 * GET    /api/notes/:parentNoteId/study-threads
 * POST   /api/notes/:parentNoteId/study-threads
 * GET    /api/notes/:parentNoteId/study-threads/by-scripture
 * PATCH  /api/study-threads/:id
 * DELETE /api/study-threads/:id
 * GET    /api/scripture/highlights        — a chapter's highlights, however they were made
 * POST   /api/scripture/highlights        — highlight made while reading (no parent note)
 * POST   /api/scripture/references        — reference saved while reading (no parent note)
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  first,
  Notes,
  Spaces,
  SpaceNotes,
  SpaceMemberships,
  UserMetadata,
  NoteConnections,
  StudyThreadEntries,
  eq,
  and,
  desc,
  isNull,
  like,
} from '../db';
import { nowISO } from '../db/dates';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { generateStudyThreadEntryId, generateNoteId } from '@/utils/ids';
import { normalizeScriptureReference } from '@/utils/scripture-detector';
import { isStudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import { broadcastInvalidation } from '../utils/realtime';
import { batchAuthorAttribution } from '../utils/dashboard-data';
import {
  canModerateStudyThreadEntry,
  SharedStudyThreadAccessError,
} from '../utils/shared-study-thread-access';
import { SpaceAccessError, requireSpaceAccess } from '../utils/space-access';
import {
  createDurableNoteAnchorFromHtml,
  createDurableNoteAnchorFromText,
  resolveDurableNoteAnchorInText,
  tipTapHtmlToCanonicalText,
} from '../utils/durable-note-anchor';
import { ensureAnchorableCurrentNoteVersion } from '../utils/note-version-service';

const route = new Hono();

const ENTRY_KINDS = new Set(['workspace', 'miniNote', 'linkedNote', 'scriptureLink', 'reference']);

function normalizeContextSpaceId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

const SHARED_RESPONSE_MUTABLE_FIELDS = new Set([
  'highlightAccentRaw',
  'notesBody',
  'miniNoteBody',
]);

export function immutableSharedResponsePatchFields(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter(
    (key) => key !== 'contextSpaceId' && key !== 'spaceId' && !SHARED_RESPONSE_MUTABLE_FIELDS.has(key),
  );
}

type StudyEntryParentContext = {
  /**
   * NULL for an entry made while reading rather than inside a note. Sharing, permissions and
   * "edited at" all hang off the parent note, so a reading entry has none of them: it is
   * personal, unshared, and there is nothing to touch.
   */
  note: typeof Notes.$inferSelect | null;
  spaceId: string | null;
  isShared: boolean;
};

/** Narrows to the note-backed case, for paths that cannot run without a parent note. */
function requireParentNote(ctx: StudyEntryParentContext): typeof Notes.$inferSelect {
  if (!ctx.note) {
    throw new SharedStudyThreadAccessError(404, 'Note not found');
  }
  return ctx.note;
}

async function resolveStudyEntryParentContext(
  executor: any,
  input: {
    parentNoteId: string | null;
    actorId: string;
    contextSpaceId: string | null;
    lock?: boolean;
  },
): Promise<StudyEntryParentContext> {
  // Made in the Bible reader: no parent note, so no space and nothing to share through.
  if (!input.parentNoteId) {
    return { note: null, spaceId: null, isShared: false };
  }

  let noteQuery = executor.select().from(Notes).where(eq(Notes.id, input.parentNoteId));
  if (input.lock) noteQuery = noteQuery.for('update');
  const note = first(await noteQuery.limit(1)) as typeof Notes.$inferSelect | undefined;
  if (!note) throw new SharedStudyThreadAccessError(404, 'Note not found');

  if (!input.contextSpaceId) {
    if (note.userId !== input.actorId) {
      throw new SharedStudyThreadAccessError(403, 'A contextSpaceId is required', 'CONTEXT_REQUIRED');
    }
    return { note, spaceId: note.spaceId, isShared: false };
  }

  let spaceQuery = executor.select().from(Spaces).where(eq(Spaces.id, input.contextSpaceId));
  if (input.lock) spaceQuery = spaceQuery.for('update');
  const space = first(await spaceQuery.limit(1)) as typeof Spaces.$inferSelect | undefined;
  if (!space || space.deletedAt) throw new SharedStudyThreadAccessError(404, 'Note not found');
  if (space.type === 'personal') {
    const isMyHome = space.title.trim().toLowerCase() === 'my home';
    if (
      space.userId !== input.actorId ||
      note.userId !== input.actorId ||
      (!isMyHome && note.spaceId !== space.id)
    ) {
      throw new SharedStudyThreadAccessError(404, 'Note not found');
    }
    return { note, spaceId: space.id, isShared: false };
  }
  if (note.contentEncrypted) throw new SharedStudyThreadAccessError(404, 'Note not found');

  let membershipQuery = executor
    .select({ id: SpaceMemberships.id })
    .from(SpaceMemberships)
    .where(
      and(
        eq(SpaceMemberships.spaceId, space.id),
        eq(SpaceMemberships.userId, input.actorId),
      ),
    );
  let associationQuery = executor
    .select({ id: SpaceNotes.id })
    .from(SpaceNotes)
    .where(
      and(
        eq(SpaceNotes.spaceId, space.id),
        eq(SpaceNotes.noteId, note.id),
        isNull(SpaceNotes.removedAt),
      ),
    );
  if (input.lock) {
    membershipQuery = membershipQuery.for('update');
    associationQuery = associationQuery.for('update');
  }
  const [membership, association] = await Promise.all([
    membershipQuery.limit(1).then((rows: unknown[]) => first(rows)),
    associationQuery.limit(1).then((rows: unknown[]) => first(rows)),
  ]);
  if (!membership || !association) throw new SharedStudyThreadAccessError(404, 'Note not found');
  return { note, spaceId: space.id, isShared: true };
}

function durableAnchorValues(input: {
  html: string;
  start: number | null;
  length: number | null;
  quote: string | null;
  now: Date;
}) {
  try {
    let anchor;
    if (input.start != null && input.length != null) {
      anchor = createDurableNoteAnchorFromHtml({
        html: input.html,
        start: input.start,
        end: input.start + input.length,
      });
    } else if (input.quote?.length) {
      const canonicalText = tipTapHtmlToCanonicalText(input.html);
      const resolution = resolveDurableNoteAnchorInText(canonicalText, {
        quote: input.quote,
        prefixContext: '',
        suffixContext: '',
        start: null,
        end: null,
      });
      if (resolution.status !== 'resolved') throw new RangeError('Anchor quote is not unique');
      anchor = createDurableNoteAnchorFromText({
        text: canonicalText,
        start: resolution.start,
        end: resolution.end,
      });
    } else {
      return {
        anchorQuote: null,
        anchorPrefixContext: null,
        anchorSuffixContext: null,
        anchorStatus: 'orphaned' as const,
        resolvedAnchorStart: null,
        resolvedAnchorEnd: null,
        anchorResolvedAt: null,
        anchorDetachedAt: input.now,
      };
    }
    return {
      anchorQuote: anchor.quote,
      anchorPrefixContext: anchor.prefixContext,
      anchorSuffixContext: anchor.suffixContext,
      anchorStatus: 'resolved' as const,
      resolvedAnchorStart: anchor.start,
      resolvedAnchorEnd: anchor.end,
      anchorResolvedAt: input.now,
      anchorDetachedAt: null,
    };
  } catch {
    return {
      anchorQuote: input.quote,
      anchorPrefixContext: null,
      anchorSuffixContext: null,
      anchorStatus: 'detached' as const,
      resolvedAnchorStart: null,
      resolvedAnchorEnd: null,
      anchorResolvedAt: null,
      anchorDetachedAt: input.now,
    };
  }
}

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
    noteVersionId: row.noteVersionId,
    anchorQuote: row.anchorQuote,
    anchorPrefixContext: row.anchorPrefixContext,
    anchorSuffixContext: row.anchorSuffixContext,
    anchorStatus: row.anchorStatus,
    resolvedAnchorStart: row.resolvedAnchorStart,
    resolvedAnchorEnd: row.resolvedAnchorEnd,
    anchorResolvedAt: row.anchorResolvedAt,
    anchorDetachedAt: row.anchorDetachedAt,
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
    const parentNoteId = c.req.param('parentNoteId')!;

    let parentCtx;
    try {
      parentCtx = await resolveStudyEntryParentContext(db, {
        parentNoteId,
        actorId: auth.userId,
        contextSpaceId: normalizeContextSpaceId(
          c.req.query('contextSpaceId') ?? c.req.query('spaceId'),
        ),
      });
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    const unioned = parentCtx.isShared;
    const listWhere = parentCtx.spaceId
      ? and(
          eq(StudyThreadEntries.parentNoteId, parentNoteId),
          eq(StudyThreadEntries.spaceId, parentCtx.spaceId),
          ...(unioned ? [] : [eq(StudyThreadEntries.userId, auth.userId)]),
          eq(StudyThreadEntries.isArchived, false),
        )
      : and(
          eq(StudyThreadEntries.parentNoteId, parentNoteId),
          eq(StudyThreadEntries.userId, auth.userId),
          isNull(StudyThreadEntries.spaceId),
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
    const parentNoteId = c.req.param('parentNoteId')!;
    const refRaw = c.req.query('reference') ?? '';
    const translation = (c.req.query('translation') ?? '').trim() || 'NET';
    const norm = normalizeScriptureReference(refRaw.trim()) ?? refRaw.trim();
    if (!norm) return c.json({ error: 'reference query required' }, 400);

    let parentCtx;
    try {
      parentCtx = await resolveStudyEntryParentContext(db, {
        parentNoteId,
        actorId: auth.userId,
        contextSpaceId: normalizeContextSpaceId(
          c.req.query('contextSpaceId') ?? c.req.query('spaceId'),
        ),
      });
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    const unioned = parentCtx.isShared;
    /**
     * Personal lookups are scoped by REFERENCE, not by parent note.
     *
     * A highlight on Exodus 5:1 is one highlight — the same one whether it was made in the
     * Bible reader, in this note, or in another note six months ago. Scoping this query by
     * `parentNoteId` used to mean each surface saw only what was made there, which turned one
     * study Bible into a pile of disconnected margins. `parentNoteId` still says where it came
     * from (see `madeHere` below); it no longer decides who may see it.
     *
     * Shared spaces stay note-scoped: there the entries are a conversation attached to one
     * shared note, and unioning them across a member's whole library would leak their private
     * highlights into someone else's note.
     */
    const byScriptureWhere = unioned
      ? and(
          eq(StudyThreadEntries.parentNoteId, parentNoteId),
          eq(StudyThreadEntries.spaceId, parentCtx.spaceId!),
          eq(StudyThreadEntries.scriptureReference, norm),
          eq(StudyThreadEntries.scripturePassageTranslation, translation),
        )
      : and(
          eq(StudyThreadEntries.userId, auth.userId),
          eq(StudyThreadEntries.scriptureReference, norm),
          eq(StudyThreadEntries.scripturePassageTranslation, translation),
        );
    const rows = await db
      .select()
      .from(StudyThreadEntries)
      .where(byScriptureWhere)
      .orderBy(desc(StudyThreadEntries.createdAt));

    const studyThreads = unioned
      ? await mapUnionedRows(rows, auth.userId)
      : rows.map((row) => ({
          ...mapStudyRow(row),
          /**
           * Was this made in the note asking? The dock leads with these and marks the rest as
           * carried in from elsewhere, so widening the scope adds context without the panel
           * filling up with things the reader did not put there.
           */
          madeHere: row.parentNoteId === parentNoteId,
          madeWhileReading: row.parentNoteId === null,
        }));

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
    const parentNoteId = c.req.param('parentNoteId')!;

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
    const notesBody =
      typeof body.notesBody === 'string' ? canonicalizeNoteHtmlLineBreaks(body.notesBody) : '';
    const miniNoteBody =
      typeof body.miniNoteBody === 'string' ? canonicalizeNoteHtmlLineBreaks(body.miniNoteBody) : '';

    const id = generateStudyThreadEntryId();
    const now = nowISO();
    const contextSpaceId = normalizeContextSpaceId(
      body.contextSpaceId ?? body.spaceId ?? c.req.query('contextSpaceId') ?? c.req.query('spaceId'),
    );
    const resolvedLinkedNoteId = typeof body.linkedNoteId === 'string' ? body.linkedNoteId : null;
    let parentCtx: StudyEntryParentContext;
    let row: typeof StudyThreadEntries.$inferSelect | null = null;
    try {
      ({ parentCtx, row } = await db.transaction(async (tx) => {
        const lockedContext = await resolveStudyEntryParentContext(tx, {
          parentNoteId,
          actorId: auth.userId,
          contextSpaceId,
          lock: true,
        });
        const currentVersion = await ensureAnchorableCurrentNoteVersion(tx, {
          // This route is addressed by parent note, so there is always one.
          note: requireParentNote(lockedContext),
          now,
        });
        const actor = first(
          await tx
            .select({ firstName: UserMetadata.firstName, lastName: UserMetadata.lastName })
            .from(UserMetadata)
            .where(eq(UserMetadata.userId, auth.userId))
            .limit(1),
        );
        const actorDisplayNameSnapshot = actor?.firstName
          ? `${actor.firstName}${actor.lastName ? ` ${actor.lastName.charAt(0).toUpperCase()}.` : ''}`
          : 'A Harvous User';
        const anchorLocation = typeof body.anchorLocation === 'number' ? body.anchorLocation : null;
        const anchorLength = typeof body.anchorLength === 'number' ? body.anchorLength : null;
        const anchorTextSnapshot =
          typeof body.anchorTextSnapshot === 'string' ? body.anchorTextSnapshot : null;
        const anchor = durableAnchorValues({
          html: currentVersion.content,
          start: anchorLocation,
          length: anchorLength,
          quote: anchorTextSnapshot,
          now,
        });
        if (lockedContext.isShared && anchor.anchorStatus !== 'resolved') {
          throw new SharedStudyThreadAccessError(
            403,
            'A shared response requires a valid durable anchor',
            'INVALID_ANCHOR',
          );
        }
        const inserted = first(
          await tx
            .insert(StudyThreadEntries)
            .values({
              id,
              userId: auth.userId,
              parentNoteId,
              spaceId: lockedContext.spaceId,
              entryKindRaw: entryKind,
              highlightAccentRaw,
              sourceSnippet,
              focusTitle,
              notesBody,
              miniNoteBody,
              linkedNoteId: resolvedLinkedNoteId,
              linkedNoteTitle: typeof body.linkedNoteTitle === 'string' ? body.linkedNoteTitle : null,
              anchorLocation,
              anchorLength,
              anchorTextSnapshot,
              noteVersionId: currentVersion.id,
              ...anchor,
              actorDisplayNameSnapshot,
              scriptureReference:
                typeof body.scriptureReference === 'string'
                  ? normalizeScriptureReference(body.scriptureReference.trim()) ?? body.scriptureReference
                  : null,
              scripturePassageTranslation:
                typeof body.scripturePassageTranslation === 'string'
                  ? body.scripturePassageTranslation
                  : null,
              scripturePassageExcerpt:
                typeof body.scripturePassageExcerpt === 'string' ? body.scripturePassageExcerpt : null,
              isArchived: false,
              highlightListEditedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .returning(),
        );
        if (
          entryKind === 'linkedNote' &&
          resolvedLinkedNoteId &&
          resolvedLinkedNoteId !== parentNoteId
        ) {
          await tx
            .insert(NoteConnections)
            .values({
              id: generateNoteId(),
              fromNoteId: parentNoteId,
              toNoteId: resolvedLinkedNoteId,
              userId: auth.userId,
              spaceId: lockedContext.spaceId,
              createdAt: now,
            })
            .onConflictDoNothing();
        }
        return { parentCtx: lockedContext, row: inserted ?? null };
      }));
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    await touchParentNoteEditedAt(parentNoteId, requireParentNote(parentCtx).userId, auth.userId);
    broadcastInvalidation(auth.userId, { type: 'note:updated', id: parentNoteId });

    const mapped = row ? mapStudyRow(row) : null;
    if (mapped && parentCtx.isShared) {
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
    const id = c.req.param('id')!;
    const body = await c.req.json();
    const contextSpaceId = normalizeContextSpaceId(
      body.contextSpaceId ?? body.spaceId ?? c.req.query('contextSpaceId') ?? c.req.query('spaceId'),
    );
    let existing: typeof StudyThreadEntries.$inferSelect;
    let parentCtx: StudyEntryParentContext;
    let row: typeof StudyThreadEntries.$inferSelect | null;
    try {
      ({ existing, parentCtx, row } = await db.transaction(async (tx) => {
        const locked = first(
          await tx
            .select()
            .from(StudyThreadEntries)
            .where(eq(StudyThreadEntries.id, id))
            .for('update')
            .limit(1),
        );
        if (!locked) throw new SharedStudyThreadAccessError(404, 'Response not found');
        if (locked.userId !== auth.userId) {
          throw new SharedStudyThreadAccessError(
            403,
            'Only the annotation author can edit it',
            'FORBIDDEN',
          );
        }
        const context = await resolveStudyEntryParentContext(tx, {
          parentNoteId: locked.parentNoteId,
          actorId: auth.userId,
          contextSpaceId,
          lock: true,
        });
        if (locked.spaceId !== context.spaceId) {
          throw new SharedStudyThreadAccessError(404, 'Response not found');
        }
        if (context.isShared) {
          const immutableFields = immutableSharedResponsePatchFields(body);
          if (immutableFields.length > 0) {
            throw new SharedStudyThreadAccessError(
              403,
              'Shared response anchors and context are immutable',
              'IMMUTABLE_SHARED_RESPONSE_CONTEXT',
            );
          }
        }
        const patch: Record<string, unknown> = { updatedAt: nowISO() };
        if (typeof body.highlightAccentRaw === 'string') {
          patch.highlightAccentRaw = body.highlightAccentRaw;
          patch.highlightListEditedAt = nowISO();
        }
        if (typeof body.sourceSnippet === 'string') patch.sourceSnippet = body.sourceSnippet;
        if (typeof body.focusTitle === 'string') patch.focusTitle = body.focusTitle;
        if (typeof body.notesBody === 'string') {
          patch.notesBody = canonicalizeNoteHtmlLineBreaks(body.notesBody);
        }
        if (typeof body.miniNoteBody === 'string') {
          patch.miniNoteBody = canonicalizeNoteHtmlLineBreaks(body.miniNoteBody);
        }
        if (typeof body.linkedNoteId === 'string' || body.linkedNoteId === null) patch.linkedNoteId = body.linkedNoteId;
        if (typeof body.linkedNoteTitle === 'string') patch.linkedNoteTitle = body.linkedNoteTitle;
        if (typeof body.scriptureReference === 'string') {
          patch.scriptureReference = normalizeScriptureReference(body.scriptureReference.trim()) ?? body.scriptureReference;
        }
        if (typeof body.scripturePassageTranslation === 'string') patch.scripturePassageTranslation = body.scripturePassageTranslation;
        if (typeof body.scripturePassageExcerpt === 'string') patch.scripturePassageExcerpt = body.scripturePassageExcerpt;
        if (typeof body.isArchived === 'boolean') patch.isArchived = body.isArchived;
        if (typeof body.entryKind === 'string' && ENTRY_KINDS.has(body.entryKind)) patch.entryKindRaw = body.entryKind;

        const anchorChanged =
          body.anchorLocation !== undefined ||
          body.anchorLength !== undefined ||
          body.anchorTextSnapshot !== undefined;
        // Re-anchoring resolves a quote against the parent note's HTML. A reading entry is
        // anchored to a verse reference instead, so there is no document to re-resolve against.
        if (anchorChanged && context.note) {
          const anchorLocation =
            typeof body.anchorLocation === 'number' ? body.anchorLocation : locked.anchorLocation;
          const anchorLength =
            typeof body.anchorLength === 'number' ? body.anchorLength : locked.anchorLength;
          const anchorTextSnapshot =
            typeof body.anchorTextSnapshot === 'string'
              ? body.anchorTextSnapshot
              : locked.anchorTextSnapshot;
          const currentVersion = await ensureAnchorableCurrentNoteVersion(tx, {
            note: context.note,
            now: nowISO(),
          });
          Object.assign(
            patch,
            {
              anchorLocation,
              anchorLength,
              anchorTextSnapshot,
              noteVersionId: currentVersion.id,
            },
            durableAnchorValues({
              html: context.note.content,
              start: anchorLocation,
              length: anchorLength,
              quote: anchorTextSnapshot,
              now: nowISO(),
            }),
          );
        }
        const updated = first(
          await tx
            .update(StudyThreadEntries)
            .set(patch as any)
            .where(
              and(
                eq(StudyThreadEntries.id, id),
                locked.parentNoteId
                  ? eq(StudyThreadEntries.parentNoteId, locked.parentNoteId)
                  : isNull(StudyThreadEntries.parentNoteId),
                context.spaceId
                  ? eq(StudyThreadEntries.spaceId, context.spaceId)
                  : isNull(StudyThreadEntries.spaceId),
                eq(StudyThreadEntries.userId, auth.userId),
              ),
            )
            .returning(),
        );
        if (!updated) throw new SharedStudyThreadAccessError(404, 'Response not found');
        return { existing: locked, parentCtx: context, row: updated };
      }));
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    // Nothing to touch or invalidate for a reading entry: no note was edited.
    if (existing.parentNoteId && parentCtx.note) {
      await touchParentNoteEditedAt(existing.parentNoteId, parentCtx.note.userId, auth.userId);
      broadcastInvalidation(existing.userId, { type: 'note:updated', id: existing.parentNoteId });
    }

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
    const id = c.req.param('id')!;
    const contextSpaceId = normalizeContextSpaceId(
      c.req.query('contextSpaceId') ?? c.req.query('spaceId'),
    );
    let existing: typeof StudyThreadEntries.$inferSelect;
    let parentCtx: StudyEntryParentContext;
    try {
      ({ existing, parentCtx } = await db.transaction(async (tx) => {
        const locked = first(
          await tx
            .select()
            .from(StudyThreadEntries)
            .where(eq(StudyThreadEntries.id, id))
            .for('update')
            .limit(1),
        );
        if (!locked) throw new SharedStudyThreadAccessError(404, 'Response not found');
        const context = await resolveStudyEntryParentContext(tx, {
          parentNoteId: locked.parentNoteId,
          actorId: auth.userId,
          contextSpaceId,
          lock: true,
        });
        /*
         * `resolveStudyEntryParentContext` always answers `spaceId: null` for a parentless
         * row (see its early return above) — it has no note to look a space up from, and
         * never did. That was harmless while every parentless row's own `spaceId` was also
         * null (made-while-reading highlights, before `POST /api/scripture/highlights`
         * started stamping the real one), because null matched null. A saved reference
         * (`POST /api/scripture/references`) has always stamped a real one, so this exact
         * mismatch already made references undeletable — the row's own `spaceId` is what's
         * authoritative for a parentless row, not what this note-shaped resolver can derive.
         */
        const effectiveSpaceId = locked.parentNoteId ? context.spaceId : locked.spaceId;
        if (locked.spaceId !== effectiveSpaceId) {
          throw new SharedStudyThreadAccessError(404, 'Response not found');
        }
        const membershipRole = context.isShared
          ? first(
              await tx
                .select({ role: SpaceMemberships.role })
                .from(SpaceMemberships)
                .where(
                  and(
                    eq(SpaceMemberships.spaceId, context.spaceId!),
                    eq(SpaceMemberships.userId, auth.userId),
                  ),
                )
                .limit(1),
            )?.role
          : null;
        // Moderation hangs off the parent note's author. A reading entry has no parent note
        // and is never shared, so its own author stands in — which makes them its owner.
        const parentAuthorUserId = context.note?.userId ?? locked.userId;
        const viewerRole =
          parentAuthorUserId === auth.userId
            ? 'owner'
            : membershipRole === 'owner' || membershipRole === 'leader' || membershipRole === 'member'
              ? membershipRole
              : null;
        if (
          !viewerRole ||
          !canModerateStudyThreadEntry({
            annotatorUserId: locked.userId,
            parentAuthorUserId,
            viewerUserId: auth.userId,
            viewerSpaceRole: viewerRole,
          })
        ) {
          throw new SharedStudyThreadAccessError(
            403,
            'You cannot delete this annotation',
            'FORBIDDEN',
          );
        }
        await tx
          .delete(StudyThreadEntries)
          .where(
            and(
              eq(StudyThreadEntries.id, id),
              locked.parentNoteId
                ? eq(StudyThreadEntries.parentNoteId, locked.parentNoteId)
                : isNull(StudyThreadEntries.parentNoteId),
              effectiveSpaceId
                ? eq(StudyThreadEntries.spaceId, effectiveSpaceId)
                : isNull(StudyThreadEntries.spaceId),
            ),
          );
        // A note-to-note connection needs both ends; a reading entry has no `from` note.
        if (locked.entryKindRaw === 'linkedNote' && locked.linkedNoteId && locked.parentNoteId) {
          await tx
            .delete(NoteConnections)
            .where(
              and(
                eq(NoteConnections.fromNoteId, locked.parentNoteId),
                eq(NoteConnections.toNoteId, locked.linkedNoteId),
                eq(NoteConnections.userId, locked.userId),
                context.spaceId
                  ? eq(NoteConnections.spaceId, context.spaceId)
                  : isNull(NoteConnections.spaceId),
              ),
            );
        }
        return { existing: locked, parentCtx: context };
      }));
    } catch (err) {
      return handleStudyThreadAccessError(c, err);
    }

    // Nothing to touch or invalidate for a reading entry: no note was edited.
    if (existing.parentNoteId && parentCtx.note) {
      await touchParentNoteEditedAt(existing.parentNoteId, parentCtx.note.userId, auth.userId);
      broadcastInvalidation(existing.userId, { type: 'note:updated', id: existing.parentNoteId });
    }

    return c.json({ success: true, deletedId: id });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/study-threads/[id]', action: 'delete_study_thread' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── Reading highlights: the same store, addressed by passage instead of by note ──────
//
// The Bible reader is not a second highlight system. These two routes are the reader's way
// into `StudyThreadEntries`, which is where every highlight already lives — the difference is
// only that a chapter is addressed by book + chapter rather than by a parent note id.

// ─── GET /api/scripture/highlights?book=&chapter=&translation= ───────────────
route.get('/api/scripture/highlights', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const book = (c.req.query('book') ?? '').trim();
    const chapter = Number.parseInt(c.req.query('chapter') ?? '', 10);
    const translation = (c.req.query('translation') ?? '').trim() || 'NET';
    if (!book || !Number.isFinite(chapter)) {
      return c.json({ error: 'book and chapter query params are required' }, 400);
    }

    // Owner-scoped and reference-scoped, with no parent-note filter — that is the whole point:
    // highlights made while reading and highlights made in any note come back together.
    const rows = await db
      .select()
      .from(StudyThreadEntries)
      .where(
        and(
          eq(StudyThreadEntries.userId, auth.userId),
          eq(StudyThreadEntries.scripturePassageTranslation, translation),
          like(StudyThreadEntries.scriptureReference, `${book} ${chapter}:%`),
        ),
      )
      .orderBy(desc(StudyThreadEntries.createdAt));

    // Overrides app.ts's blanket `private, max-age=30, stale-while-revalidate=60` default —
    // same class of bug as GET /api/user/get-profile (see that route's comment). Highlighting
    // a verse and leaving and returning to this same chapter hits this same URL.
    return c.json(
      {
        success: true,
        highlights: rows.map((row) => ({
          ...mapStudyRow(row),
          madeWhileReading: row.parentNoteId === null,
        })),
      },
      200,
      { 'Cache-Control': 'private, max-age=0, no-store' },
    );
  } catch (error: any) {
    const e = handleAPIError(error, {
      endpoint: '/api/scripture/highlights',
      action: 'list_scripture_highlights',
    });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/scripture/highlights ─────────────────────────────────────────
route.post('/api/scripture/highlights', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const refRaw = typeof body.reference === 'string' ? body.reference.trim() : '';
    const norm = normalizeScriptureReference(refRaw) ?? refRaw;
    if (!norm) return c.json({ error: 'reference is required' }, 400);

    const accent =
      typeof body.accent === 'string' && isStudyHighlightAccentKey(body.accent)
        ? body.accent
        : 'warmAmber';
    const translation =
      typeof body.translation === 'string' && body.translation.trim()
        ? body.translation.trim()
        : 'NET';

    /*
     * Required, like the sibling `/api/scripture/references` below — a highlight made while
     * reading used to leave this null on the theory that a nullable space would surface it in
     * every personal space the account has. `/api/spaces/:spaceId/study-thread-highlights`
     * (the sidebar's own Highlights list) never implemented that half: for a parentless row
     * it requires an exact `spaceId` match, so a null one matched no space at all and the
     * highlight was invisible everywhere except the reader that made it. Stamping the real
     * space — the same fix `references` already had — is what makes it show up, and is also
     * the correct behaviour once a highlight can be made inside a Shared Space: "every
     * personal space" was never going to include someone else's room anyway.
     */
    const spaceId = normalizeContextSpaceId(body.spaceId);
    if (!spaceId) return c.json({ error: 'spaceId is required' }, 400);
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const now = nowISO();

    /**
     * Highlighting the same verses again re-colours the existing row rather than adding one.
     *
     * A highlight is a property of a passage, not an event: pressing highlight twice on one
     * verse means "make it this colour", not "make two highlights". Inserting unconditionally
     * stacked duplicate rows that all painted the same verse, so the reader looked correct
     * while the row count climbed — and deleting the highlight would only remove the topmost.
     */
    const existing = first(
      await db
        .select()
        .from(StudyThreadEntries)
        .where(
          and(
            eq(StudyThreadEntries.userId, auth.userId),
            isNull(StudyThreadEntries.parentNoteId),
            // Kind matters here, not just the passage: a reference saved while reading is also a
            // parentless row on this same verse, and without this it would be found by the lookup
            // above and silently recoloured instead of the highlight being created.
            eq(StudyThreadEntries.entryKindRaw, 'scriptureLink'),
            eq(StudyThreadEntries.scriptureReference, norm),
            eq(StudyThreadEntries.scripturePassageTranslation, translation),
          ),
        )
        .limit(1),
    ) as typeof StudyThreadEntries.$inferSelect | undefined;

    if (existing) {
      const updated = first(
        await db
          .update(StudyThreadEntries)
          // `spaceId` too, not just the colour — heals a row created before this endpoint
          // stamped one, so re-touching an old orphaned highlight is what recovers it rather
          // than requiring every existing highlight to be deleted and remade.
          .set({ highlightAccentRaw: accent, spaceId, updatedAt: now } as any)
          .where(eq(StudyThreadEntries.id, existing.id))
          .returning(),
      );
      return c.json({ success: true, highlight: updated ? mapStudyRow(updated) : null });
    }

    const row = first(
      await db
        .insert(StudyThreadEntries)
        .values({
          id: generateStudyThreadEntryId(),
          userId: auth.userId,
          // Null on purpose: made while reading, so there is no note it came from. It is still
          // the same kind of row a scripture dock writes, and every surface reads it the same.
          parentNoteId: null,
          spaceId,
          entryKindRaw: 'scriptureLink',
          highlightAccentRaw: accent,
          scriptureReference: norm,
          scripturePassageTranslation: translation,
          scripturePassageExcerpt: typeof body.excerpt === 'string' ? body.excerpt : '',
          sourceSnippet: typeof body.excerpt === 'string' ? body.excerpt : '',
          miniNoteBody: typeof body.miniNoteBody === 'string' ? body.miniNoteBody : '',
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning(),
    );

    return c.json({ success: true, highlight: row ? mapStudyRow(row) : null });
  } catch (error: any) {
    const e = handleAPIError(error, {
      endpoint: '/api/scripture/highlights',
      action: 'create_scripture_highlight',
    });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/scripture/references ──────────────────────────────────────────
/**
 * Keep a looked-up word while reading, without making a note to hold it.
 *
 * Deliberately not folded into `POST /api/scripture/highlights`, even though both write a
 * parentless row: that route upserts because a highlight is a property of a passage, so
 * highlighting twice means "make it this colour". Two different words looked up in one verse
 * are two references, not one recoloured — same table, opposite write semantics.
 *
 * `spaceId` is recorded rather than left null (a reading highlight leaves it null). The list
 * that surfaces these is asked for one space at a time, and a null would put a single saved
 * reference in every personal space the account has.
 */
route.post('/api/scripture/references', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

    const word = typeof body.word === 'string' ? body.word.trim() : '';
    if (!word) return c.json({ error: 'word is required' }, 400);

    const refRaw = typeof body.reference === 'string' ? body.reference.trim() : '';
    // The raw text is the fallback rather than a hard failure — an unparseable reference is
    // still worth keeping next to the word it came from.
    const norm = normalizeScriptureReference(refRaw) ?? refRaw;
    if (!norm) return c.json({ error: 'reference is required' }, 400);

    const translation =
      typeof body.translation === 'string' && body.translation.trim()
        ? body.translation.trim()
        : 'NET';
    const accent =
      typeof body.accent === 'string' && isStudyHighlightAccentKey(body.accent)
        ? body.accent
        : 'warmAmber';

    const spaceId = normalizeContextSpaceId(body.spaceId);
    if (!spaceId) return c.json({ error: 'spaceId is required' }, 400);
    try {
      await requireSpaceAccess(spaceId, auth.userId);
    } catch (err) {
      if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
      throw err;
    }

    const now = nowISO();

    // Saving the same word on the same verse again is the same reference, not a second one.
    const existing = first(
      await db
        .select()
        .from(StudyThreadEntries)
        .where(
          and(
            eq(StudyThreadEntries.userId, auth.userId),
            isNull(StudyThreadEntries.parentNoteId),
            eq(StudyThreadEntries.entryKindRaw, 'reference'),
            eq(StudyThreadEntries.scriptureReference, norm),
            eq(StudyThreadEntries.scripturePassageTranslation, translation),
            eq(StudyThreadEntries.sourceSnippet, word),
          ),
        )
        .limit(1),
    ) as typeof StudyThreadEntries.$inferSelect | undefined;

    if (existing) {
      return c.json({ success: true, reference: mapStudyRow(existing) });
    }

    const row = first(
      await db
        .insert(StudyThreadEntries)
        .values({
          id: generateStudyThreadEntryId(),
          userId: auth.userId,
          // Null on purpose: saved while reading, so there is no note it came from.
          parentNoteId: null,
          spaceId,
          entryKindRaw: 'reference',
          highlightAccentRaw: accent,
          scriptureReference: norm,
          scripturePassageTranslation: translation,
          scripturePassageExcerpt: word,
          sourceSnippet: word,
          focusTitle: word,
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning(),
    );

    return c.json({ success: true, reference: row ? mapStudyRow(row) : null });
  } catch (error: any) {
    const e = handleAPIError(error, {
      endpoint: '/api/scripture/references',
      action: 'create_scripture_reference',
    });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default route;
