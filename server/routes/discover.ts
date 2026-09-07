/**
 * Discover — the public catalog of things people gave away.
 *
 * Someone submits a template they wrote; you approve it; anyone can install it
 * into their own account. Nothing here is sold, and there are no creator
 * profiles — a listing carries a snapshotted byline and nothing else.
 *
 * **Public reads are public by omitting `requireAuth`, so the safety is the
 * WHERE clause.** Every anonymous query carries
 * `eq(DiscoverListings.status, 'listed')` in the query itself rather than
 * filtering afterwards, and `serializePublic` is the only serializer those
 * routes may use. Nothing public ever emits `payload` — a listing is
 * browsable, and installing it is what hands over the bytes, counted and
 * attributed.
 *
 * Endpoints:
 *   GET    /api/discover/listings?category=&kind=&limit=&cursor=   public
 *   GET    /api/discover/listings/:slug                            public
 *   GET    /api/discover/export                                    public
 *   POST   /api/discover/submit                                    auth
 *   GET    /api/discover/mine                                      auth
 *   POST   /api/discover/withdraw                                  auth
 *   POST   /api/discover/install                                   auth
 *   GET    /api/admin/discover/submissions                         admin
 *   POST   /api/admin/discover/review                              admin
 *   POST   /api/admin/discover/delist                              admin
 *   POST   /api/admin/discover/mark-read                           admin
 *
 * v1 lists templates only. The other three kinds ('note' | 'pack' |
 * 'resource') are named in the column comment and refused here, so the shape
 * is settled before the install branches that need it exist.
 */

import { Hono } from 'hono';
import { getAuth, getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import {
  db,
  first,
  DiscoverListings,
  DiscoverInstalls,
  UserMetadata,
  eq,
  and,
  or,
  desc,
  sql,
  inArray,
  isNull,
} from '../db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimit } from '@/utils/rate-limit';
import { safeRenderHtml } from '@/utils/content-renderer';
import { isUniqueViolationError } from '../utils/db-errors';
import { requireHarvousAdmin, getHarvousSystemUserId } from '../utils/harvous-admin';
import { DISCOVER_CATEGORIES, isDiscoverCategory } from '@/data/discover-categories';
import { NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH } from '@/data/note-templates';
import {
  snapshotTemplate,
  snapshotNote,
  snapshotPack,
  snapshotResource,
  type TemplatePayload,
  type NotePayload,
  type PackPayload,
  type ResourcePayload,
} from '../utils/discover-snapshot';
import {
  prepareTemplateInstall,
  prepareNoteInstall,
  preparePackInstall,
  prepareResourceInstall,
  writeInstall,
  runInstallPostCommit,
  type PreparedInstall,
} from '../utils/discover-install';

const app = new Hono();

const TITLE_MAX_LENGTH = 120;
/** Two lines in the browse sheet. Borrowed from note templates, which set it. */
const DESCRIPTION_MAX_LENGTH = NOTE_TEMPLATE_DESCRIPTION_MAX_LENGTH;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

/**
 * How many submissions one person may have waiting at once.
 *
 * Not a rate limit — those already apply per minute. Same reasoning as
 * `OPEN_SUGGESTIONS_MAX` in church-library-suggestions.ts: five unanswered
 * submissions is someone to talk to, not someone who needs a sixth box.
 */
const OPEN_SUBMISSIONS_MAX = 5;

/** Everything the catalog can carry. File-kind library items stay out — see snapshotResource. */
const SUPPORTED_KINDS = new Set(['template', 'note', 'pack', 'resource']);

type ListingRow = typeof DiscoverListings.$inferSelect;

/**
 * What the duplicate branch can say. It has only `createdRefId` — the one thing
 * the install produced — so a pack reports its thread and not its notes. That is
 * enough to open what they already have, which is what "already yours" means.
 */
function createdIdsFor(kind: string, refId: string | null) {
  if (kind === 'template') return { templateId: refId };
  if (kind === 'pack') return { threadId: refId };
  if (kind === 'resource') return { libraryItemId: refId };
  return { noteId: refId };
}

function clean(value: unknown, max: number): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Kebab from a title, ASCII only, collapsed. Empty when nothing survives. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

function parsePreview(preview: string | null): unknown {
  if (!preview) return null;
  try {
    return JSON.parse(preview);
  } catch {
    return null;
  }
}

/**
 * The second sanitize pass, on the way out.
 *
 * `bodyHtmlOf` already cleaned this at submit. Doing it again here costs one
 * function call and covers the cases a write-time pass cannot: a row written
 * before the sanitizer existed, and a future writer that forgets. It is also
 * what lets harvous.com render the string with `set:html` without taking a
 * DOMPurify dependency of its own — the static site has no user input, so the
 * only untrusted bytes it ever sees are these.
 */
function sanitizePreviewBody(preview: unknown): unknown {
  if (!preview || typeof preview !== 'object') return preview;
  const body = (preview as { bodyHtml?: unknown }).bodyHtml;
  if (typeof body !== 'string' || !body) return preview;
  return { ...(preview as Record<string, unknown>), bodyHtml: safeRenderHtml(body) };
}

/**
 * The only serializer an unauthenticated route may use.
 *
 * Deliberately does not spread the row. `submittedByUserId`, `reviewedByUserId`,
 * `reviewNote`, and `staffReadAt` are absent by construction, and
 * `server/routes/__tests__/discover-routes.test.ts` asserts they stay absent —
 * a spread here would leak all four the first time a column is added.
 *
 * **`preview.bodyHtml` is public, and that is a deliberate reversal.** This
 * serializer used to emit no body at all. Listing pages render the artifact
 * behind a fade with the CTA over it, which means the bytes have to reach the
 * static site — a catalog of things people chose to publish, on pages meant to
 * rank. `payload` stays private regardless: it carries `sourceId` and
 * `sourceVersionId` provenance that no reader needs.
 */
function serializePublic(row: ListingRow) {
  return {
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    description: row.description,
    category: row.category,
    authorDisplayName: row.authorDisplayName,
    preview: sanitizePreviewBody(parsePreview(row.preview)),
    installCount: row.installCount,
    listedAt: row.listedAt,
  };
}

/** What a submitter sees of their own submission — including why it was declined. */
function serializeMine(row: ListingRow) {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    reviewNote: row.reviewNote,
    installCount: row.installCount,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    listedAt: row.listedAt,
  };
}

/** The admin queue's view. Everything, including who sent it. */
function serializeForReview(row: ListingRow) {
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.sourceId,
    submittedByUserId: row.submittedByUserId,
    authorDisplayName: row.authorDisplayName,
    title: row.title,
    description: row.description,
    category: row.category,
    slug: row.slug,
    payload: parsePreview(row.payload),
    preview: parsePreview(row.preview),
    status: row.status,
    reviewNote: row.reviewNote,
    staffReadAt: row.staffReadAt,
    installCount: row.installCount,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

/**
 * The public byline, resolved once at submit and then frozen on the row.
 *
 * Same `Firstname L.` derivation as the shared-note reader in shared.ts, and
 * duplicated here on purpose: `displayNamesFor` in
 * server/utils/suggestion-display-names.ts is confined to the two suggestion
 * routes by a contract test, and this is not a third one of those.
 */
async function resolveAuthorDisplayName(userId: string): Promise<string> {
  let isHarvousOwned = false;
  try {
    isHarvousOwned = userId === getHarvousSystemUserId();
  } catch {
    /* env not set */
  }
  if (isHarvousOwned) return 'Harvous';

  const creator = first(
    await db
      .select({ firstName: UserMetadata.firstName, lastName: UserMetadata.lastName })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  const firstName = (creator?.firstName || '').trim();
  const lastName = (creator?.lastName || '').trim();
  if (!firstName) return 'A Harvous User';
  const lastInitial = lastName.charAt(0).toUpperCase();
  return lastInitial ? `${firstName} ${lastInitial}.` : firstName;
}

// ─── GET /api/discover/listings ─────────────────────────────────────────────
/** The catalog. Anonymous; listed rows only. */
app.get('/api/discover/listings', rateLimit('read'), async (c) => {
  try {
    const url = new URL(c.req.url);
    const category = clean(url.searchParams.get('category'), 60);
    const kind = clean(url.searchParams.get('kind'), 30);
    const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    const conditions = [eq(DiscoverListings.status, 'listed')];
    if (category) conditions.push(eq(DiscoverListings.category, category));
    if (kind) conditions.push(eq(DiscoverListings.kind, kind));

    /* Keyset on (listedAt, id), so a listing approved mid-scroll cannot shift
       a page boundary and hide a row the way an offset would. */
    const cursor = clean(url.searchParams.get('cursor'), 200);
    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const separator = decoded.lastIndexOf('|');
      const cursorListedAt = new Date(decoded.slice(0, separator));
      const cursorId = decoded.slice(separator + 1);
      if (separator > 0 && !Number.isNaN(cursorListedAt.getTime())) {
        conditions.push(
          sql`(${DiscoverListings.listedAt}, ${DiscoverListings.id}) < (${cursorListedAt}, ${cursorId})`,
        );
      }
    }

    const rows = await db
      .select()
      .from(DiscoverListings)
      .where(and(...conditions))
      .orderBy(desc(DiscoverListings.listedAt), desc(DiscoverListings.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last?.listedAt
        ? Buffer.from(`${last.listedAt.toISOString()}|${last.id}`, 'utf8').toString('base64url')
        : null;

    /* Only ever the caller's own install rows, and only to mark rows they
       already have. Someone else's installs are not readable here or anywhere. */
    let installedSlugs: string[] = [];
    const auth = getAuth(c);
    if (auth.userId && page.length > 0) {
      const mine = await db
        .select({ listingId: DiscoverInstalls.listingId })
        .from(DiscoverInstalls)
        .where(
          and(
            eq(DiscoverInstalls.userId, auth.userId),
            inArray(
              DiscoverInstalls.listingId,
              page.map((row) => row.id),
            ),
          ),
        );
      const installedIds = new Set(mine.map((row) => row.listingId));
      installedSlugs = page
        .filter((row) => installedIds.has(row.id) && row.slug)
        .map((row) => row.slug as string);
    }

    /* `no-store`, the way the share-status read already does it. Without it the
       browser heuristically caches this URL: a listing approved a minute ago does
       not appear, and — worse — `installedSlugs` goes stale straight after an
       install, so a row offers to add something the reader already took. React
       Query refetching does not help; the HTTP cache sits underneath it. */
    c.header('Cache-Control', 'private, max-age=0, no-store');
    return c.json({
      listings: page.map(serializePublic),
      installedSlugs,
      nextCursor,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/discover/listings',
      action: 'discover_list',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/discover/listings/:slug ───────────────────────────────────────
/** One listing. Anonymous; still no payload — installing is what hands that over. */
app.get('/api/discover/listings/:slug', rateLimit('read'), async (c) => {
  try {
    const slug = clean(c.req.param('slug'), 120);
    if (!slug) return c.json({ error: 'Not found', code: 'LISTING_NOT_FOUND' }, 404);

    const row = first(
      await db
        .select()
        .from(DiscoverListings)
        .where(and(eq(DiscoverListings.slug, slug), eq(DiscoverListings.status, 'listed')))
        .limit(1),
    );
    if (!row) return c.json({ error: 'Not found', code: 'LISTING_NOT_FOUND' }, 404);

    // Same reason as the list above: install counts and delistings must not be
    // served from a stale browser cache.
    c.header('Cache-Control', 'private, max-age=0, no-store');
    return c.json({ listing: serializePublic(row) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/discover/listings/[slug]',
      action: 'discover_detail',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/discover/export ───────────────────────────────────────────────
/**
 * The whole listed catalog, for harvous.com's build.
 *
 * Anonymous on purpose, and the sync workflow curls it without a secret — which
 * continuously proves that the endpoint the static site depends on is genuinely
 * public. If it ever stops being, the workflow fails loudly instead of the
 * catalog quietly emptying on the next rebuild.
 *
 * Metadata and a sanitized excerpt only, never `payload`. That is both what the
 * site needs to rank and the right abuse posture: browsable catalog,
 * installable artifact, and an install is counted and attributed.
 */
app.get('/api/discover/export', rateLimit('read'), async (c) => {
  try {
    const rows = await db
      .select()
      .from(DiscoverListings)
      .where(eq(DiscoverListings.status, 'listed'))
      .orderBy(desc(DiscoverListings.listedAt), desc(DiscoverListings.id))
      .limit(5000);

    /* Deliberately no `generatedAt`. The sync job commits this file only when it
       differs from the last one, and a timestamp would differ on every run — a
       commit and a site rebuild every six hours forever, saying nothing. Git
       already records when the catalog last changed. */
    return c.json(
      {
        categories: DISCOVER_CATEGORIES,
        listings: rows.map(serializePublic),
      },
      200,
      // The build reads a committed file, so this is only ever fetched by the
      // sync job; a short cache keeps a retry from re-querying.
      { 'Cache-Control': 'public, max-age=300' },
    );
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/discover/export',
      action: 'discover_export',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/discover/submit ──────────────────────────────────────────────
/**
 * Offer something to everyone.
 *
 * The server resolves and snapshots the artifact itself from a row it has
 * verified the caller owns; a client-supplied payload is never trusted, because
 * what gets approved has to be what was submitted.
 */
app.post('/api/discover/submit', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      kind?: string;
      sourceId?: string;
      description?: string;
    };

    const kind = clean(body.kind, 30) ?? 'template';
    if (!SUPPORTED_KINDS.has(kind)) {
      return c.json({ error: 'That cannot be shared yet.', code: 'UNSUPPORTED_KIND' }, 400);
    }
    const sourceId = clean(body.sourceId, 200);
    if (!sourceId) {
      return c.json({ error: 'sourceId is required', code: 'BAD_REQUEST' }, 400);
    }

    const waiting = await db
      .select({ id: DiscoverListings.id })
      .from(DiscoverListings)
      .where(
        and(
          eq(DiscoverListings.submittedByUserId, auth.userId),
          eq(DiscoverListings.status, 'submitted'),
        ),
      );
    if (waiting.length >= OPEN_SUBMISSIONS_MAX) {
      return c.json(
        {
          error: 'You have a few still waiting. Give them a chance to be looked at.',
          code: 'SUBMISSION_LIMIT',
        },
        429,
      );
    }

    const alreadyOffered = first(
      await db
        .select({ id: DiscoverListings.id, status: DiscoverListings.status })
        .from(DiscoverListings)
        .where(
          and(
            eq(DiscoverListings.sourceId, sourceId),
            eq(DiscoverListings.submittedByUserId, auth.userId),
            or(eq(DiscoverListings.status, 'submitted'), eq(DiscoverListings.status, 'listed')),
          ),
        )
        .limit(1),
    );
    if (alreadyOffered) {
      return c.json(
        {
          error:
            alreadyOffered.status === 'listed'
              ? 'This one is already shared.'
              : 'This one is already waiting to be looked at.',
          code: 'ALREADY_SUBMITTED',
        },
        409,
      );
    }

    /* The server resolves and snapshots the artifact itself from a row it has
       verified the caller owns. A client-supplied payload is never trusted,
       because what gets approved has to be what was submitted. */
    const result =
      kind === 'template'
        ? await snapshotTemplate(sourceId, auth.userId)
        : kind === 'note'
          ? await snapshotNote(sourceId, auth.userId)
          : kind === 'resource'
            ? await snapshotResource(sourceId, auth.userId)
            : await snapshotPack(sourceId, auth.userId);
    if (!result.ok) {
      return c.json({ error: result.error, code: result.code }, result.status);
    }
    const { snapshot } = result;

    const title = clean(snapshot.title, TITLE_MAX_LENGTH);
    if (!title) {
      return c.json({ error: 'Give this a name first', code: 'BAD_REQUEST' }, 400);
    }

    const timestamp = new Date();
    const row: ListingRow = {
      id: `dsc_${crypto.randomUUID()}`,
      kind,
      sourceId,
      sourceVersionId: snapshot.sourceVersionId,
      submittedByUserId: auth.userId,
      authorDisplayName: await resolveAuthorDisplayName(auth.userId),
      title,
      description:
        clean(body.description, DESCRIPTION_MAX_LENGTH) ??
        clean(snapshot.description, DESCRIPTION_MAX_LENGTH),
      // The reviewer files it. Asking the submitter to pick from a taxonomy they
      // cannot see is asking them to do a curator's job while giving something away.
      category: null,
      slug: null,
      payload: snapshot.payload,
      preview: snapshot.preview,
      status: 'submitted',
      installCount: 0,
      listedAt: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
      staffReadAt: null,
      supersedesListingId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.insert(DiscoverListings).values(row);

    return c.json({ success: true, listing: serializeMine(row) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/discover/submit',
      action: 'discover_submit',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/discover/mine ─────────────────────────────────────────────────
/** Your own submissions and what became of them. Never anyone else's. */
app.get('/api/discover/mine', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const rows = await db
      .select()
      .from(DiscoverListings)
      .where(eq(DiscoverListings.submittedByUserId, auth.userId))
      .orderBy(desc(DiscoverListings.createdAt))
      .limit(100);
    return c.json({ listings: rows.map(serializeMine) });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/discover/mine',
      action: 'discover_mine',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/discover/withdraw ────────────────────────────────────────────
/**
 * Take it back.
 *
 * Allowed while it waits *and* after it is listed — someone who shared
 * something should be able to stop sharing it. Existing installs are copies and
 * are untouched; withdrawing removes it from the catalog, not from the people
 * who already have it.
 */
app.post('/api/discover/withdraw', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { listingId?: string };
    const listingId = clean(body.listingId, 200);
    if (!listingId) {
      return c.json({ error: 'listingId is required', code: 'BAD_REQUEST' }, 400);
    }

    const existing = first(
      await db
        .select()
        .from(DiscoverListings)
        .where(
          and(
            eq(DiscoverListings.id, listingId),
            eq(DiscoverListings.submittedByUserId, auth.userId),
          ),
        )
        .limit(1),
    );
    if (!existing) {
      return c.json({ error: 'Not found', code: 'LISTING_NOT_FOUND' }, 404);
    }
    if (existing.status !== 'submitted' && existing.status !== 'listed') {
      return c.json({ error: 'Nothing to take back.', code: 'NOT_WITHDRAWABLE' }, 409);
    }

    const timestamp = new Date();
    await db
      .update(DiscoverListings)
      // The slug goes with it, so the name is free again and the partial unique
      // index stops holding a row nobody can reach.
      .set({ status: 'withdrawn', slug: null, listedAt: null, updatedAt: timestamp })
      .where(eq(DiscoverListings.id, listingId));

    return c.json({ success: true, status: 'withdrawn' });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/discover/withdraw',
      action: 'discover_withdraw',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/discover/install ─────────────────────────────────────────────
/**
 * Take a copy.
 *
 * `DiscoverInstalls` is inserted **first, inside the transaction**, so a second
 * tap loses to the unique index and rolls the whole thing back instead of
 * writing a duplicate. That ordering is the correctness story, and
 * discover-routes.test.ts asserts it holds: `/api/shared/add-to-harvous` is what
 * check-then-act looks like when it goes wrong.
 */
app.post('/api/discover/install', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { slug?: string };
    const slug = clean(body.slug, 120);
    if (!slug) return c.json({ error: 'slug is required', code: 'BAD_REQUEST' }, 400);

    const listing = first(
      await db
        .select()
        .from(DiscoverListings)
        .where(and(eq(DiscoverListings.slug, slug), eq(DiscoverListings.status, 'listed')))
        .limit(1),
    );
    if (!listing) return c.json({ error: 'Not found', code: 'LISTING_NOT_FOUND' }, 404);

    if (listing.submittedByUserId === auth.userId) {
      return c.json({ error: 'Already in your Harvous', code: 'SELF_INSTALL' }, 400);
    }
    if (!SUPPORTED_KINDS.has(listing.kind)) {
      return c.json({ error: 'That cannot be added yet.', code: 'UNSUPPORTED_KIND' }, 400);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(listing.payload);
    } catch {
      return c.json({ error: 'That listing is unreadable.', code: 'BAD_PAYLOAD' }, 422);
    }

    /* Everything that reads or rewrites content happens out here; the
       transaction below does nothing but insert. */
    let prepared: PreparedInstall;
    if (listing.kind === 'template') {
      const payload = parsed as TemplatePayload;
      if (!payload?.content) {
        return c.json({ error: 'That listing is unreadable.', code: 'BAD_PAYLOAD' }, 422);
      }
      prepared = prepareTemplateInstall(payload, listing, auth.userId);
    } else if (listing.kind === 'resource') {
      const payload = parsed as ResourcePayload;
      if (!payload?.sourceUrl) {
        return c.json({ error: 'That listing is unreadable.', code: 'BAD_PAYLOAD' }, 422);
      }
      const result = await prepareResourceInstall(payload, auth.userId);
      if ('error' in result) {
        return c.json({ error: result.error, code: result.code }, result.status);
      }
      prepared = result;
    } else if (listing.kind === 'note') {
      const payload = parsed as NotePayload;
      if (!payload?.content || !payload.sourceId) {
        return c.json({ error: 'That listing is unreadable.', code: 'BAD_PAYLOAD' }, 422);
      }
      prepared = await prepareNoteInstall(payload, listing.authorDisplayName, auth.userId);
    } else {
      const payload = parsed as PackPayload;
      if (!payload?.thread || !Array.isArray(payload.notes) || payload.notes.length === 0) {
        return c.json({ error: 'That listing is unreadable.', code: 'BAD_PAYLOAD' }, 422);
      }
      prepared = await preparePackInstall(payload, listing.authorDisplayName, auth.userId);
    }

    const timestamp = new Date();
    try {
      await db.transaction(async (tx) => {
        /* First, and inside the transaction: the unique index on
           (listingId, userId) is what makes a duplicate impossible, and it can
           only decide if it is written to before anything else. */
        await tx.insert(DiscoverInstalls).values({
          id: `dsci_${crypto.randomUUID()}`,
          listingId: listing.id,
          userId: auth.userId,
          createdRefId: prepared.primaryRefId,
          createdAt: timestamp,
        });

        await writeInstall(tx, prepared, auth.userId);

        await tx
          .update(DiscoverListings)
          .set({ installCount: sql`${DiscoverListings.installCount} + 1` })
          .where(eq(DiscoverListings.id, listing.id));
      });
    } catch (error) {
      if (!isUniqueViolationError(error)) throw error;
      /* The index said they already have it. Re-read outside the rolled-back
         transaction and hand back the copy they made the first time. */
      const existing = first(
        await db
          .select({ createdRefId: DiscoverInstalls.createdRefId })
          .from(DiscoverInstalls)
          .where(
            and(
              eq(DiscoverInstalls.listingId, listing.id),
              eq(DiscoverInstalls.userId, auth.userId),
            ),
          )
          .limit(1),
      );
      return c.json({
        success: true,
        alreadyInstalled: true,
        kind: listing.kind,
        createdIds: createdIdsFor(listing.kind, existing?.createdRefId ?? null),
        warnings: [],
      });
    }

    const warnings = await runInstallPostCommit(prepared, auth.userId);

    return c.json({
      success: true,
      alreadyInstalled: false,
      kind: listing.kind,
      createdIds: prepared.createdIds,
      warnings,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/discover/install',
      action: 'discover_install',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/admin/discover/submissions ────────────────────────────────────
/** The review queue. */
app.get('/api/admin/discover/submissions', requireAuth, async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const url = new URL(c.req.url);
    const status = clean(url.searchParams.get('status'), 30) ?? 'submitted';
    const rows = await db
      .select()
      .from(DiscoverListings)
      .where(eq(DiscoverListings.status, status))
      .orderBy(desc(DiscoverListings.createdAt))
      .limit(200);

    const unread = await db
      .select({ id: DiscoverListings.id })
      .from(DiscoverListings)
      .where(
        and(eq(DiscoverListings.status, 'submitted'), isNull(DiscoverListings.staffReadAt)),
      );

    return c.json({ submissions: rows.map(serializeForReview), unreadCount: unread.length });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/admin/discover/submissions',
      action: 'discover_admin_list',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/admin/discover/review ────────────────────────────────────────
/**
 * Approve or decline. The slug is assigned here, inside the transaction, and is
 * immutable afterwards — retitling a listed thing would 404 every link into it.
 */
app.post('/api/admin/discover/review', requireAuth, rateLimit('write'), async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      listingId?: string;
      action?: string;
      category?: string;
      reviewNote?: string;
      title?: string;
      description?: string;
      official?: boolean;
    };

    const listingId = clean(body.listingId, 200);
    if (!listingId) {
      return c.json({ error: 'listingId is required', code: 'BAD_REQUEST' }, 400);
    }
    const action =
      body.action === 'approve' ? 'approve' : body.action === 'decline' ? 'decline' : null;
    if (!action) {
      return c.json({ error: 'action must be approve or decline', code: 'BAD_REQUEST' }, 400);
    }

    const existing = first(
      await db.select().from(DiscoverListings).where(eq(DiscoverListings.id, listingId)).limit(1),
    );
    if (!existing) return c.json({ error: 'Not found', code: 'LISTING_NOT_FOUND' }, 404);
    if (existing.status !== 'submitted') {
      /* Two tabs on the same queue is ordinary; the second should be told what
         happened rather than quietly listing something twice. */
      return c.json({ error: 'Someone already reviewed this one.', code: 'ALREADY_REVIEWED' }, 409);
    }

    const timestamp = new Date();

    if (action === 'decline') {
      await db
        .update(DiscoverListings)
        .set({
          status: 'declined',
          reviewNote: clean(body.reviewNote, 500),
          reviewedByUserId: auth.userId,
          reviewedAt: timestamp,
          staffReadAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(DiscoverListings.id, listingId));
      return c.json({ success: true, status: 'declined' });
    }

    const category = clean(body.category, 60);
    if (!category || !isDiscoverCategory(category)) {
      return c.json({ error: 'Pick a category to file it under', code: 'BAD_CATEGORY' }, 400);
    }
    const title = clean(body.title, TITLE_MAX_LENGTH) ?? existing.title;

    /*
     * "Included with Harvous" — the reviewer's call, not something derivable.
     *
     * A built-in template lives in code and never gets a `NoteTemplates` row,
     * so `sourceId` is always a personal `ntpl_…` and matching it against
     * `getBuiltInTemplates()` can never be true. Whether a listing is the
     * product's own is a judgement about provenance, and the only person who
     * can make it is the one approving it.
     *
     * It rides in `preview` because that is the presentation envelope the site
     * already reads; `payload` stays the untouched snapshot.
     */
    let preview = existing.preview;
    try {
      const parsed = JSON.parse(existing.preview ?? '{}') as Record<string, unknown>;
      preview = JSON.stringify({ ...parsed, official: body.official === true });
    } catch {
      /* A preview that will not parse is not this endpoint's to repair — the
         listing still lists, it just draws from what it has. */
    }

    await db.transaction(async (tx) => {
      const base = slugify(title) || 'study-starter';
      const taken = await tx
        .select({ slug: DiscoverListings.slug })
        .from(DiscoverListings)
        .where(sql`${DiscoverListings.slug} = ${base} OR ${DiscoverListings.slug} LIKE ${`${base}-%`}`);
      const used = new Set(taken.map((row) => row.slug));
      let slug = base;
      for (let suffix = 2; used.has(slug); suffix += 1) slug = `${base}-${suffix}`;

      await tx
        .update(DiscoverListings)
        .set({
          status: 'listed',
          slug,
          title,
          description: clean(body.description, DESCRIPTION_MAX_LENGTH) ?? existing.description,
          category,
          preview,
          reviewNote: clean(body.reviewNote, 500),
          reviewedByUserId: auth.userId,
          reviewedAt: timestamp,
          staffReadAt: timestamp,
          listedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(DiscoverListings.id, listingId));
    });

    return c.json({ success: true, status: 'listed' });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/admin/discover/review',
      action: 'discover_admin_review',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/admin/discover/delist ────────────────────────────────────────
/** Pull something back out of the catalog. Installs already made are copies and stay. */
app.post('/api/admin/discover/delist', requireAuth, rateLimit('write'), async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      listingId?: string;
      reviewNote?: string;
    };
    const listingId = clean(body.listingId, 200);
    if (!listingId) {
      return c.json({ error: 'listingId is required', code: 'BAD_REQUEST' }, 400);
    }

    const existing = first(
      await db.select().from(DiscoverListings).where(eq(DiscoverListings.id, listingId)).limit(1),
    );
    if (!existing) return c.json({ error: 'Not found', code: 'LISTING_NOT_FOUND' }, 404);
    if (existing.status !== 'listed') {
      return c.json({ error: 'That is not listed.', code: 'NOT_LISTED' }, 409);
    }

    const timestamp = new Date();
    await db
      .update(DiscoverListings)
      .set({
        status: 'delisted',
        slug: null,
        listedAt: null,
        reviewNote: clean(body.reviewNote, 500),
        reviewedByUserId: auth.userId,
        reviewedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(DiscoverListings.id, listingId));

    return c.json({ success: true, status: 'delisted' });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/admin/discover/delist',
      action: 'discover_admin_delist',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/admin/discover/mark-read ─────────────────────────────────────
/** Clear the unread badge without deciding anything. */
app.post('/api/admin/discover/mark-read', requireAuth, async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    await db
      .update(DiscoverListings)
      .set({ staffReadAt: new Date() })
      .where(
        and(eq(DiscoverListings.status, 'submitted'), isNull(DiscoverListings.staffReadAt)),
      );
    return c.json({ success: true });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/admin/discover/mark-read',
      action: 'discover_admin_mark_read',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
