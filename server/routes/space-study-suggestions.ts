/**
 * What's next — a member proposing what their room studies, and whoever runs
 * the room deciding.
 *
 * Phase 1 of docs/future/SPACE_STUDY_SUGGESTIONS_AND_VOTES.md. Copies the
 * church library suggestion box (church-library-suggestions.ts) almost line
 * for line, including its one deliberate exception: **suggestions are named.**
 * "Review is never shared" protects observed behaviour — what someone read,
 * wrote, or studied. A suggestion is an affirmative submission, someone
 * raising their hand, and a leader cannot weigh, reply to, or follow up on an
 * anonymous stack of them. The name is serialized only into the leader-gated
 * queue and never into anything a member reads.
 *
 * Suggestions are private to their author and the room's leaders. That keeps
 * the leader's curation real rather than ratifying whatever got seen first,
 * and it is the narrow choice on purpose: widening later is free, narrowing
 * is not.
 *
 * Opt-in per room via `Spaces.studyPlanningMode`. Off by default; a room that
 * has never wanted this never sees it. Shared rooms only — a ministry channel
 * publishes rather than decides, and a personal space has nobody to ask.
 *
 * Accepting pins a Thread as the room's Current Thread in the same
 * transaction as the status change — a suggestion marked accepted with no
 * Thread behind it is a promise the room cannot keep. There is no round in
 * phase 1, so the leader's choice is the whole decision.
 */
import { Hono, type Context } from 'hono';
import {
  db,
  first,
  and,
  eq,
  desc,
  inArray,
  isNull,
  Notes,
  SpaceNotes,
  SpaceStudySuggestions,
  Threads,
} from '../db';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { getRandomThreadColor } from '@/utils/colors';
import { generateThreadId } from '@/utils/ids';
import {
  requireSpaceAccess,
  SpaceAccessError,
  type SpaceRole,
  type SpaceRow,
} from '../utils/space-access';
import { canManageSpaceThreadStructure } from '../utils/thread-sequence';
import {
  setSingularThreadPin,
  SharedSpaceLifecycleError,
} from '../utils/shared-space-lifecycle';
import { broadcastInvalidation } from '../utils/realtime';
import { displayNamesFor } from '../utils/suggestion-display-names';

const app = new Hono();

export const SUGGESTION_KINDS = ['thread', 'note', 'scripture', 'text'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

const BODY_MAX_LENGTH = 500;
const REFERENCE_MAX_LENGTH = 120;
/** A Thread title made from free text: the first line, cut to something a card can show. */
const DERIVED_TITLE_MAX_LENGTH = 80;
/**
 * How many open suggestions one person may have with one room.
 *
 * Not a rate limit — those already apply per minute. Ten unanswered proposals
 * is someone the leader needs to talk to, not someone who needs an eleventh
 * box to type in.
 */
export const OPEN_SUGGESTIONS_MAX = 10;

type SuggestionRow = typeof SpaceStudySuggestions.$inferSelect;

function clean(value: unknown, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isSuggestionKind(value: unknown): value is SuggestionKind {
  return SUGGESTION_KINDS.includes(value as SuggestionKind);
}

/**
 * A row with the thing it points at named. The title for thread/note kinds is
 * looked up at read time, so a renamed Thread reads under its current name.
 */
type NamedRow = SuggestionRow & { refTitle: string | null };

/** What the suggester sees of their own submission — no reviewer, no suggester id. */
function serializeMine(row: NamedRow) {
  return {
    id: row.id,
    kind: row.kind,
    refId: row.refId,
    refTitle: row.refTitle,
    scriptureReference: row.scriptureReference,
    body: row.body,
    status: row.status,
    becameThreadId: row.becameThreadId,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

/** Resolve Thread and Note titles for the rows that point at one. */
async function nameRefs(rows: SuggestionRow[]): Promise<NamedRow[]> {
  const threadIds = rows.filter((r) => r.kind === 'thread' && r.refId).map((r) => r.refId!);
  const noteIds = rows.filter((r) => r.kind === 'note' && r.refId).map((r) => r.refId!);
  const titles = new Map<string, string | null>();

  if (threadIds.length > 0) {
    const found = await db
      .select({ id: Threads.id, title: Threads.title })
      .from(Threads)
      .where(inArray(Threads.id, threadIds));
    for (const t of found) titles.set(t.id, t.title);
  }
  if (noteIds.length > 0) {
    const found = await db
      .select({ id: Notes.id, title: Notes.title })
      .from(Notes)
      .where(inArray(Notes.id, noteIds));
    for (const n of found) titles.set(n.id, n.title);
  }
  return rows.map((row) => ({
    ...row,
    refTitle: row.refId ? (titles.get(row.refId) ?? null) : null,
  }));
}

type Access = { space: SpaceRow; role: SpaceRole };

/**
 * Membership, plus the two room-level refusals every handler shares.
 *
 * 404 for a personal space or a channel rather than 403, so a probe cannot
 * tell "not that kind of room" from "does not exist" — the same line
 * `assertCanManageSpaceLibrary` draws.
 */
async function requireSuggestionRoom(spaceId: string, userId: string): Promise<Access> {
  const access = await requireSpaceAccess(spaceId, userId);
  if (access.space.type !== 'shared') {
    throw new SpaceAccessError(404, 'Space not found');
  }
  return access;
}

function canReview(access: Access, userId: string): boolean {
  return canManageSpaceThreadStructure(access.space, access.role, userId);
}

function refuse(c: Context, err: unknown) {
  if (err instanceof SpaceAccessError) {
    return c.json({ error: err.message, code: err.code }, err.status);
  }
  if (err instanceof SharedSpaceLifecycleError) {
    return c.json({ error: err.message, code: err.code }, err.status as 404);
  }
  return null;
}

// ─── POST /api/spaces/:spaceId/study-suggestions/create ─────────────────────
/** A member proposing what the room studies next. */
app.post(
  '/api/spaces/:spaceId/study-suggestions/create',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const spaceId = requireParam(c, 'spaceId');
      const access = await requireSuggestionRoom(spaceId, auth.userId);

      if (access.space.studyPlanningMode === 'off') {
        return c.json(
          { error: 'This room is not taking suggestions right now.', code: 'SUGGESTIONS_OFF' },
          403,
        );
      }

      const body = (await c.req.json().catch(() => ({}))) as {
        kind?: string;
        refId?: string;
        scriptureReference?: string;
        body?: string;
      };

      if (!isSuggestionKind(body.kind)) {
        return c.json({ error: 'kind must be thread, note, scripture, or text', code: 'BAD_REQUEST' }, 400);
      }
      const kind = body.kind;
      const why = clean(body.body, BODY_MAX_LENGTH);
      let refId: string | null = null;
      let scriptureReference: string | null = null;

      if (kind === 'thread') {
        refId = clean(body.refId, 200);
        if (!refId) return c.json({ error: 'Pick a Thread', code: 'BAD_REQUEST' }, 400);
        /* Only this room's Threads — a suggestion cannot smuggle in one from
           elsewhere, and a leader accepting it pins it here. */
        const thread = first(
          await db
            .select({ id: Threads.id })
            .from(Threads)
            .where(and(eq(Threads.id, refId), eq(Threads.spaceId, access.space.id)))
            .limit(1),
        );
        if (!thread) return c.json({ error: 'That Thread is not in this room', code: 'REF_NOT_FOUND' }, 404);
      } else if (kind === 'note') {
        refId = clean(body.refId, 200);
        if (!refId) return c.json({ error: 'Pick a note', code: 'BAD_REQUEST' }, 400);
        const association = first(
          await db
            .select({ id: SpaceNotes.id })
            .from(SpaceNotes)
            .where(
              and(
                eq(SpaceNotes.spaceId, access.space.id),
                eq(SpaceNotes.noteId, refId),
                isNull(SpaceNotes.removedAt),
              ),
            )
            .limit(1),
        );
        if (!association) return c.json({ error: 'That note is not in this room', code: 'REF_NOT_FOUND' }, 404);
      } else if (kind === 'scripture') {
        scriptureReference = clean(body.scriptureReference, REFERENCE_MAX_LENGTH);
        if (!scriptureReference) return c.json({ error: 'Name a passage', code: 'BAD_REQUEST' }, 400);
      } else if (!why) {
        return c.json({ error: 'Say what you have in mind', code: 'BAD_REQUEST' }, 400);
      }

      const open = await db
        .select({ id: SpaceStudySuggestions.id })
        .from(SpaceStudySuggestions)
        .where(
          and(
            eq(SpaceStudySuggestions.spaceId, access.space.id),
            eq(SpaceStudySuggestions.suggestedByUserId, auth.userId),
            eq(SpaceStudySuggestions.status, 'open'),
          ),
        );
      if (open.length >= OPEN_SUGGESTIONS_MAX) {
        return c.json(
          {
            error: 'You have a few suggestions still waiting. Give the room a chance to look.',
            code: 'SUGGESTION_LIMIT',
          },
          429,
        );
      }

      const row: SuggestionRow = {
        id: `sgst_${crypto.randomUUID()}`,
        spaceId: access.space.id,
        suggestedByUserId: auth.userId,
        kind,
        refId,
        scriptureReference,
        body: why,
        status: 'open',
        becameThreadId: null,
        reviewedByUserId: null,
        reviewedAt: null,
        leaderReadAt: null,
        createdAt: new Date(),
      };
      await db.insert(SpaceStudySuggestions).values(row);

      const [named] = await nameRefs([row]);
      return c.json({ success: true, suggestion: serializeMine(named) });
    } catch (error) {
      const refused = refuse(c, error);
      if (refused) return refused;
      const standardError = handleAPIError(error, {
        endpoint: '/api/spaces/:spaceId/study-suggestions/create',
        action: 'space_study_suggestion_create',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

// ─── GET /api/spaces/:spaceId/study-suggestions/mine ────────────────────────
/** Your own suggestions in this room and what became of them. Never anyone else's. */
app.get('/api/spaces/:spaceId/study-suggestions/mine', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = requireParam(c, 'spaceId');
    const access = await requireSuggestionRoom(spaceId, auth.userId);

    const rows = await db
      .select()
      .from(SpaceStudySuggestions)
      .where(
        and(
          eq(SpaceStudySuggestions.spaceId, access.space.id),
          /* Scoped to the caller in the query, not filtered afterwards — the
             difference matters if this ever grows a pagination bug. */
          eq(SpaceStudySuggestions.suggestedByUserId, auth.userId),
        ),
      )
      .orderBy(desc(SpaceStudySuggestions.createdAt))
      .limit(50);

    const named = await nameRefs(rows);
    return c.json({
      mode: access.space.studyPlanningMode,
      suggestions: named.map(serializeMine),
    });
  } catch (error) {
    const refused = refuse(c, error);
    if (refused) return refused;
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/:spaceId/study-suggestions/mine',
      action: 'space_study_suggestion_mine',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/spaces/:spaceId/study-suggestions ─────────────────────────────
/**
 * The leader's queue.
 *
 * **The attribution exception lives here.** `suggestedByName` is resolved and
 * returned because whoever decides what the room studies needs to know who is
 * asking. Gated on the same rule that governs the room's Threads, because
 * accepting one pins a Thread.
 */
app.get('/api/spaces/:spaceId/study-suggestions', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = requireParam(c, 'spaceId');
    const status = (c.req.query('status') ?? 'open').trim();
    const access = await requireSuggestionRoom(spaceId, auth.userId);
    if (!canReview(access, auth.userId)) {
      return c.json(
        { error: 'Only whoever runs this room can review suggestions', code: 'SUGGESTIONS_ROLE_REQUIRED' },
        403,
      );
    }

    const rows = await db
      .select()
      .from(SpaceStudySuggestions)
      .where(
        status === 'all'
          ? eq(SpaceStudySuggestions.spaceId, access.space.id)
          : and(
              eq(SpaceStudySuggestions.spaceId, access.space.id),
              eq(SpaceStudySuggestions.status, status),
            ),
      )
      .orderBy(desc(SpaceStudySuggestions.createdAt))
      .limit(200);

    const [named, names] = await Promise.all([
      nameRefs(rows),
      displayNamesFor(rows.map((r) => r.suggestedByUserId)),
    ]);

    return c.json({
      mode: access.space.studyPlanningMode,
      suggestions: named.map((row) => ({
        ...serializeMine(row),
        suggestedByName: names.get(row.suggestedByUserId) ?? 'Someone in this room',
        leaderReadAt: row.leaderReadAt,
      })),
    });
  } catch (error) {
    const refused = refuse(c, error);
    if (refused) return refused;
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/:spaceId/study-suggestions',
      action: 'space_study_suggestion_queue',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/spaces/:spaceId/study-suggestions/mark-read ──────────────────
/** The leader has seen what is waiting. Clears the unread count, changes nothing else. */
app.post('/api/spaces/:spaceId/study-suggestions/mark-read', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const spaceId = requireParam(c, 'spaceId');
    const access = await requireSuggestionRoom(spaceId, auth.userId);
    if (!canReview(access, auth.userId)) {
      return c.json(
        { error: 'Only whoever runs this room can review suggestions', code: 'SUGGESTIONS_ROLE_REQUIRED' },
        403,
      );
    }
    await db
      .update(SpaceStudySuggestions)
      .set({ leaderReadAt: new Date() })
      .where(
        and(
          eq(SpaceStudySuggestions.spaceId, access.space.id),
          eq(SpaceStudySuggestions.status, 'open'),
          isNull(SpaceStudySuggestions.leaderReadAt),
        ),
      );
    return c.json({ success: true });
  } catch (error) {
    const refused = refuse(c, error);
    if (refused) return refused;
    const standardError = handleAPIError(error, {
      endpoint: '/api/spaces/:spaceId/study-suggestions/mark-read',
      action: 'space_study_suggestion_mark_read',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

/** What a Thread made from a suggestion is called. */
export function deriveThreadTitle(
  row: Pick<SuggestionRow, 'kind' | 'scriptureReference' | 'body'> & { refTitle?: string | null },
): string {
  if (row.kind === 'scripture' && row.scriptureReference) return row.scriptureReference;
  if (row.kind === 'note' && row.refTitle?.trim()) return row.refTitle.trim();
  const firstLine = (row.body ?? '').split('\n')[0]?.trim() ?? '';
  const cut = firstLine.length > DERIVED_TITLE_MAX_LENGTH
    ? `${firstLine.slice(0, DERIVED_TITLE_MAX_LENGTH - 1).trimEnd()}…`
    : firstLine;
  return cut || 'What we study next';
}

// ─── POST /api/spaces/:spaceId/study-suggestions/review ─────────────────────
/**
 * Accept or decline.
 *
 * Accepting makes the suggestion the room's Current Thread inside the same
 * transaction as the status change. A suggested Thread is pinned as it is;
 * anything else becomes a new Thread titled from the suggestion, owned by the
 * reviewer — they are the person who decided the room studies this, and the
 * one to ask about it later. `Threads_onePinnedPerSpace` and
 * `setSingularThreadPin` already guarantee the slot.
 */
app.post(
  '/api/spaces/:spaceId/study-suggestions/review',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const spaceId = requireParam(c, 'spaceId');
      const body = (await c.req.json().catch(() => ({}))) as {
        suggestionId?: string;
        action?: string;
      };
      const access = await requireSuggestionRoom(spaceId, auth.userId);
      if (!canReview(access, auth.userId)) {
        return c.json(
          { error: 'Only whoever runs this room can review suggestions', code: 'SUGGESTIONS_ROLE_REQUIRED' },
          403,
        );
      }

      const suggestionId = clean(body.suggestionId, 200);
      if (!suggestionId) {
        return c.json({ error: 'suggestionId is required', code: 'BAD_REQUEST' }, 400);
      }
      const action =
        body.action === 'accept' ? 'accept' : body.action === 'decline' ? 'decline' : null;
      if (!action) {
        return c.json({ error: 'action must be accept or decline', code: 'BAD_REQUEST' }, 400);
      }

      /* Scoped to this room, so an id from another room reads as "not found"
         rather than confirming it exists. */
      const existing = first(
        await db
          .select()
          .from(SpaceStudySuggestions)
          .where(
            and(
              eq(SpaceStudySuggestions.id, suggestionId),
              eq(SpaceStudySuggestions.spaceId, access.space.id),
            ),
          )
          .limit(1),
      );
      if (!existing) {
        return c.json({ error: 'Suggestion not found', code: 'SUGGESTION_NOT_FOUND' }, 404);
      }
      if (existing.status !== 'open') {
        /* Two leaders opening the queue at once is ordinary; the second should
           be told what happened, not silently pin a second Thread. */
        return c.json({ error: 'Someone already reviewed this one.', code: 'ALREADY_REVIEWED' }, 409);
      }

      const timestamp = new Date();

      if (action === 'decline') {
        await db
          .update(SpaceStudySuggestions)
          .set({
            status: 'declined',
            reviewedByUserId: auth.userId,
            reviewedAt: timestamp,
            leaderReadAt: timestamp,
          })
          .where(eq(SpaceStudySuggestions.id, suggestionId));
        return c.json({ success: true, status: 'declined' });
      }

      const [named] = await nameRefs([existing]);
      const threadId = await db.transaction(async (tx) => {
        let pinnedThreadId: string;
        if (existing.kind === 'thread' && existing.refId) {
          pinnedThreadId = existing.refId;
        } else {
          pinnedThreadId = generateThreadId();
          await tx.insert(Threads).values({
            id: pinnedThreadId,
            title: deriveThreadTitle(named),
            subtitle: null,
            spaceId: access.space.id,
            userId: auth.userId,
            color: getRandomThreadColor(),
            isPinned: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        await setSingularThreadPin(tx, {
          spaceId: access.space.id,
          threadId: pinnedThreadId,
          isPinned: true,
          now: timestamp,
        });
        await tx
          .update(SpaceStudySuggestions)
          .set({
            status: 'accepted',
            becameThreadId: pinnedThreadId,
            reviewedByUserId: auth.userId,
            reviewedAt: timestamp,
            leaderReadAt: timestamp,
          })
          .where(eq(SpaceStudySuggestions.id, suggestionId));
        return pinnedThreadId;
      });

      broadcastInvalidation(auth.userId, { type: 'thread:updated', id: threadId });
      return c.json({ success: true, status: 'accepted', threadId });
    } catch (error) {
      const refused = refuse(c, error);
      if (refused) return refused;
      const standardError = handleAPIError(error, {
        endpoint: '/api/spaces/:spaceId/study-suggestions/review',
        action: 'space_study_suggestion_review',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

// ─── POST /api/spaces/:spaceId/study-suggestions/withdraw ───────────────────
/** Taking your own suggestion back, while it is still waiting. */
app.post(
  '/api/spaces/:spaceId/study-suggestions/withdraw',
  requireAuth,
  rateLimit('write'),
  async (c) => {
    try {
      const auth = getAuthenticatedAuth(c);
      const spaceId = requireParam(c, 'spaceId');
      const body = (await c.req.json().catch(() => ({}))) as { suggestionId?: string };
      const access = await requireSuggestionRoom(spaceId, auth.userId);

      const suggestionId = clean(body.suggestionId, 200);
      if (!suggestionId) {
        return c.json({ error: 'suggestionId is required', code: 'BAD_REQUEST' }, 400);
      }
      /* Own and open, in the query. A reviewed suggestion is the room's record
         now; a leader's decline is the way it leaves the queue. */
      const deleted = await db
        .delete(SpaceStudySuggestions)
        .where(
          and(
            eq(SpaceStudySuggestions.id, suggestionId),
            eq(SpaceStudySuggestions.spaceId, access.space.id),
            eq(SpaceStudySuggestions.suggestedByUserId, auth.userId),
            eq(SpaceStudySuggestions.status, 'open'),
          ),
        )
        .returning({ id: SpaceStudySuggestions.id });
      if (deleted.length === 0) {
        return c.json({ error: 'Suggestion not found', code: 'SUGGESTION_NOT_FOUND' }, 404);
      }
      return c.json({ success: true });
    } catch (error) {
      const refused = refuse(c, error);
      if (refused) return refused;
      const standardError = handleAPIError(error, {
        endpoint: '/api/spaces/:spaceId/study-suggestions/withdraw',
        action: 'space_study_suggestion_withdraw',
      });
      return c.json({ error: standardError.message, code: standardError.code }, 500);
    }
  },
);

export default app;
