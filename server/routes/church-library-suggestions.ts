/**
 * The suggestion box — a congregant proposing a resource, and staff reviewing it.
 *
 * **This file holds the one deliberate exception to "review is never shared",
 * and it must stay the only one.** That rule protects *observed* behaviour:
 * what someone read, wrote, or studied. Nothing church-facing may ask those
 * questions, and `church-engagement.ts` is contract-tested to prove it cannot.
 *
 * A suggestion is the opposite kind of fact. It is an affirmative submission
 * addressed to the church — someone raising their hand — and a reviewer cannot
 * act on it, reply to it, or judge it fairly without knowing who sent it. The
 * attribution is confined to this file, serialized only into the
 * `manage_library`-gated queue, and never into any surface a congregant reads.
 *
 * The congregant endpoints take no orgId. The church comes from the caller's
 * own connection, so a suggestion can only ever be addressed to the church they
 * actually belong to.
 */
import { Hono } from 'hono';
import {
  db,
  first,
  and,
  eq,
  desc,
  Churches,
  LibraryItems,
  LibraryItemSuggestions,
} from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { validateResourceUrl, extractDomain } from '@/utils/validation';
import {
  churchIsSponsored,
  CHURCH_LAPSED_CODE,
  CHURCH_LAPSED_ERROR,
} from '../utils/church-entitlement';
import {
  assertCanManageChurchLibrary,
  ensureChurchLibrary,
  resolveChurchLibraryViewer,
} from '../utils/church-library-access';
import { displayNamesFor } from '../utils/suggestion-display-names';

const app = new Hono();

const TITLE_MAX_LENGTH = 200;
const NOTE_MAX_LENGTH = 500;
/**
 * How many open suggestions one person may have with one church.
 *
 * Not a rate limit — those already apply per minute. This is the shape of the
 * feature: ten unanswered proposals is someone the staff need to talk to, not
 * someone who needs an eleventh box to type in.
 */
const OPEN_SUGGESTIONS_MAX = 10;

type SuggestionRow = typeof LibraryItemSuggestions.$inferSelect;

function clean(value: unknown, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** What the suggester sees of their own submission — no reviewer, no notes. */
function serializeMine(row: SuggestionRow) {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

// ─── POST /api/church/library/suggestions/create ────────────────────────────
/** A congregant proposing a link for their church's library. */
app.post('/api/church/library/suggestions/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const viewer = await resolveChurchLibraryViewer(auth.userId);
    if (viewer.kind === 'none') {
      return c.json({ error: 'Connect a church first', code: 'NO_CHURCH' }, 403);
    }

    /* Sponsorship-gated like following a channel: a lapsed church's queue
       filling with proposals nobody can act on is worse for the person
       suggesting than a clear "not right now". */
    const churchRow = first(
      await db.select().from(Churches).where(eq(Churches.id, viewer.church.id)).limit(1),
    );
    if (!churchIsSponsored(churchRow)) {
      return c.json({ error: CHURCH_LAPSED_ERROR, code: CHURCH_LAPSED_CODE }, 402);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      url?: string;
      title?: string;
      note?: string;
    };

    const validation = validateResourceUrl(String(body.url ?? ''));
    if (!validation.isValid || !validation.normalizedUrl) {
      return c.json(
        { error: validation.error || 'Enter a valid link', code: validation.code || 'INVALID_URL' },
        400,
      );
    }

    const open = await db
      .select({ id: LibraryItemSuggestions.id })
      .from(LibraryItemSuggestions)
      .where(
        and(
          eq(LibraryItemSuggestions.churchId, viewer.church.id),
          eq(LibraryItemSuggestions.suggestedByUserId, auth.userId),
          eq(LibraryItemSuggestions.status, 'open'),
        ),
      );
    if (open.length >= OPEN_SUGGESTIONS_MAX) {
      return c.json(
        {
          error: 'You have a few suggestions still waiting. Give your church a chance to look.',
          code: 'SUGGESTION_LIMIT',
        },
        429,
      );
    }

    const row: SuggestionRow = {
      id: `libsg_${crypto.randomUUID()}`,
      churchId: viewer.church.id,
      suggestedByUserId: auth.userId,
      url: validation.normalizedUrl,
      title: clean(body.title, TITLE_MAX_LENGTH),
      note: clean(body.note, NOTE_MAX_LENGTH),
      status: 'open',
      reviewedByUserId: null,
      reviewedAt: null,
      createdItemId: null,
      staffReadAt: null,
      createdAt: new Date(),
    };
    await db.insert(LibraryItemSuggestions).values(row);

    return c.json({ success: true, suggestion: serializeMine(row) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/suggestions/create',
      action: 'library_suggestion_create',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/church/library/suggestions/mine ───────────────────────────────
/** Your own submissions and what became of them. Never anyone else's. */
app.get('/api/church/library/suggestions/mine', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const viewer = await resolveChurchLibraryViewer(auth.userId);
    if (viewer.kind === 'none') return c.json({ suggestions: [] });

    const rows = await db
      .select()
      .from(LibraryItemSuggestions)
      .where(
        and(
          eq(LibraryItemSuggestions.churchId, viewer.church.id),
          /* Scoped to the caller in the query, not filtered afterwards — the
             difference matters if this ever grows a pagination bug. */
          eq(LibraryItemSuggestions.suggestedByUserId, auth.userId),
        ),
      )
      .orderBy(desc(LibraryItemSuggestions.createdAt))
      .limit(50);

    return c.json({ suggestions: rows.map(serializeMine) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/suggestions/mine',
      action: 'library_suggestion_mine',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/church/library/suggestions ────────────────────────────────────
/**
 * The staff review queue.
 *
 * **The attribution exception lives here.** `suggestedByName` is resolved and
 * returned because a reviewer deciding what their church studies from needs to
 * know who is asking — a stack of anonymous links is not something anyone can
 * weigh. Gated on `manage_library`; never sponsorship-gated, so a lapsed church
 * can still read what people sent before it lapsed.
 */
app.get('/api/church/library/suggestions', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();
    const status = (c.req.query('status') ?? 'open').trim();

    const gate = await assertCanManageChurchLibrary(auth.userId, orgId);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const rows = await db
      .select()
      .from(LibraryItemSuggestions)
      .where(
        status === 'all'
          ? eq(LibraryItemSuggestions.churchId, gate.church.id)
          : and(
              eq(LibraryItemSuggestions.churchId, gate.church.id),
              eq(LibraryItemSuggestions.status, status),
            ),
      )
      .orderBy(desc(LibraryItemSuggestions.createdAt))
      .limit(200);

    const names = await displayNamesFor(rows.map((r) => r.suggestedByUserId));

    return c.json({
      suggestions: rows.map((row) => ({
        ...serializeMine(row),
        suggestedByName: names.get(row.suggestedByUserId) ?? 'Someone at your church',
        domain: extractDomain(row.url),
        staffReadAt: row.staffReadAt,
      })),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/suggestions',
      action: 'library_suggestion_queue',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/library/suggestions/review ────────────────────────────
/**
 * Approve or decline.
 *
 * Approving creates the library item in the same transaction as the status
 * change — a suggestion marked approved with no item behind it is a promise the
 * library cannot keep, and the reviewer would have no way to tell.
 *
 * The created item is org-scoped and members-access: a curator who wants it
 * narrower edits it afterwards in the manager, where scope is the whole point
 * of the pane. Guessing a narrower scope here would silently bury it.
 */
app.post('/api/church/library/suggestions/review', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      suggestionId?: string;
      action?: string;
    };

    const gate = await assertCanManageChurchLibrary(auth.userId, (body.orgId ?? '').trim());
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);

    const suggestionId = clean(body.suggestionId, 200);
    if (!suggestionId) {
      return c.json({ error: 'suggestionId is required', code: 'BAD_REQUEST' }, 400);
    }
    const action = body.action === 'approve' ? 'approve' : body.action === 'decline' ? 'decline' : null;
    if (!action) {
      return c.json({ error: 'action must be approve or decline', code: 'BAD_REQUEST' }, 400);
    }

    /* Scoped to this church, so an id from another church's queue reads as
       "not found" rather than confirming it exists. */
    const existing = first(
      await db
        .select()
        .from(LibraryItemSuggestions)
        .where(
          and(
            eq(LibraryItemSuggestions.id, suggestionId),
            eq(LibraryItemSuggestions.churchId, gate.church.id),
          ),
        )
        .limit(1),
    );
    if (!existing) {
      return c.json({ error: 'Suggestion not found', code: 'SUGGESTION_NOT_FOUND' }, 404);
    }
    if (existing.status !== 'open') {
      /* Two curators opening the queue at once is ordinary; the second should
         be told what happened, not silently create a duplicate item. */
      return c.json(
        { error: 'Someone already reviewed this one.', code: 'ALREADY_REVIEWED' },
        409,
      );
    }

    const timestamp = new Date();

    if (action === 'decline') {
      await db
        .update(LibraryItemSuggestions)
        .set({
          status: 'declined',
          reviewedByUserId: auth.userId,
          reviewedAt: timestamp,
          staffReadAt: timestamp,
        })
        .where(eq(LibraryItemSuggestions.id, suggestionId));
      return c.json({ success: true, status: 'declined' });
    }

    const library = await ensureChurchLibrary(gate.church.id, gate.church.name);
    const itemId = `libi_${crypto.randomUUID()}`;

    await db.transaction(async (tx) => {
      await tx.insert(LibraryItems).values({
        id: itemId,
        libraryId: library.id,
        kind: 'link',
        title: existing.title?.trim() || extractDomain(existing.url) || existing.url,
        description: existing.note,
        sourceUrl: existing.url,
        sourceDomain: extractDomain(existing.url),
        sourceSiteName: null,
        sourceImage: null,
        fileStorageKey: null,
        fileName: null,
        fileMime: null,
        fileBytes: null,
        access: 'members',
        /* The reviewer, not the suggester: they are the person who decided the
           church keeps this, and the one to ask about it later. */
        createdByUserId: auth.userId,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      });
      await tx
        .update(LibraryItemSuggestions)
        .set({
          status: 'approved',
          reviewedByUserId: auth.userId,
          reviewedAt: timestamp,
          createdItemId: itemId,
          staffReadAt: timestamp,
        })
        .where(eq(LibraryItemSuggestions.id, suggestionId));
    });

    return c.json({ success: true, status: 'approved', itemId });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/library/suggestions/review',
      action: 'library_suggestion_review',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
