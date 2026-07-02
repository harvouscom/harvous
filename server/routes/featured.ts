import { Hono } from 'hono';
import { and, db, desc, eq, first, gt, inArray, isNotNull, isNull, lte, ne, notExists, notInArray, or } from '../db';
import { now, nowISO } from '../db/dates';
import { getAuth, getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { getHarvousSystemUserId, requireHarvousAdmin } from '../utils/harvous-admin';
import {
  FeaturedItems,
  SpaceMemberships,
  Notes,
  ScriptureMetadata,
  Spaces,
  Threads,
  UserFeaturedItems,
  UserMetadata,
  VotdPublishHistory,
} from '../db/schema';
import { generateNoteId, generateShareToken } from '@/utils/ids';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { fetchVerseText } from '../utils/fetch-verse-text';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { awardCreationBonusXP, awardVotdEngagementXP } from '../utils/xp-system';
import { getCurrentSeason } from '@/utils/season-helpers';
import {
  DEV_SAMPLE_FEATURED_ITEM_IDS,
  shouldExcludeDevSampleFeaturedItems,
} from '../constants/dev-featured-samples';
import { getLocalCalendarDateString, isValidIanaTimeZone } from '../utils/votd-local-date';
import { getUserDefaultTranslation } from '../utils/votd-user-translation';

const app = new Hono();

// Dashboard endpoint: returns all active featured items the user hasn't dismissed/completed.
app.get('/api/featured/items', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) {
      c.res.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
      return c.json([]);
    }

    const currentTime = now();

    const tzHeader = c.req.header('X-Votd-Timezone')?.trim() ?? '';
    const timeZone = isValidIanaTimeZone(tzHeader) ? tzHeader : 'UTC';
    const localCalendarDate = getLocalCalendarDateString(timeZone, currentTime);

    const dismissedNotInUserFeed = notExists(
      db
        .select({ id: UserFeaturedItems.id })
        .from(UserFeaturedItems)
        .where(
          and(
            eq(UserFeaturedItems.userId, auth.userId),
            eq(UserFeaturedItems.featuredItemId, FeaturedItems.id),
            inArray(UserFeaturedItems.status, ['dismissed', 'completed']),
          ),
        ),
    );

    const nonVotdConditions = [
      eq(FeaturedItems.isActive, true),
      ne(FeaturedItems.contentType, 'votd'),
      or(isNull(FeaturedItems.startsAt), lte(FeaturedItems.startsAt, currentTime)),
      or(isNull(FeaturedItems.endsAt), gt(FeaturedItems.endsAt, currentTime)),
      dismissedNotInUserFeed,
    ];
    if (shouldExcludeDevSampleFeaturedItems(c)) {
      nonVotdConditions.push(notInArray(FeaturedItems.id, DEV_SAMPLE_FEATURED_ITEM_IDS));
    }

    const votdExactConditions = [
      eq(FeaturedItems.isActive, true),
      eq(FeaturedItems.contentType, 'votd'),
      eq(VotdPublishHistory.publishedDate, localCalendarDate),
      dismissedNotInUserFeed,
    ];
    const votdFallbackConditions = [
      eq(FeaturedItems.isActive, true),
      eq(FeaturedItems.contentType, 'votd'),
      lte(VotdPublishHistory.publishedDate, localCalendarDate),
      dismissedNotInUserFeed,
    ];
    if (shouldExcludeDevSampleFeaturedItems(c)) {
      votdExactConditions.push(notInArray(FeaturedItems.id, DEV_SAMPLE_FEATURED_ITEM_IDS));
      votdFallbackConditions.push(notInArray(FeaturedItems.id, DEV_SAMPLE_FEATURED_ITEM_IDS));
    }

    const selectColumns = {
      id: FeaturedItems.id,
      contentType: FeaturedItems.contentType,
      title: FeaturedItems.title,
      description: FeaturedItems.description,
      refId: FeaturedItems.refId,
      shareToken: FeaturedItems.shareToken,
      color: FeaturedItems.color,
      metadata: FeaturedItems.metadata,
      createdAt: FeaturedItems.createdAt,
    };

    const [nonVotdRows, votdExactRows] = await Promise.all([
      db
        .select(selectColumns)
        .from(FeaturedItems)
        .where(and(...nonVotdConditions))
        .orderBy(desc(FeaturedItems.createdAt)),
      db
        .select(selectColumns)
        .from(FeaturedItems)
        .innerJoin(VotdPublishHistory, eq(FeaturedItems.id, VotdPublishHistory.featuredItemId))
        .where(and(...votdExactConditions))
        .orderBy(desc(FeaturedItems.createdAt))
        .limit(1),
    ]);

    let votdRows = votdExactRows;
    if (votdRows.length === 0) {
      // If a VOTD was published for this local calendar date, do not fall back to an older verse
      // when the user has already completed/dismissed today's item (exact query empty).
      const publishedTodayConditions = [
        eq(FeaturedItems.isActive, true),
        eq(FeaturedItems.contentType, 'votd'),
        eq(VotdPublishHistory.publishedDate, localCalendarDate),
      ];
      if (shouldExcludeDevSampleFeaturedItems(c)) {
        publishedTodayConditions.push(notInArray(FeaturedItems.id, DEV_SAMPLE_FEATURED_ITEM_IDS));
      }
      const hasPublishedVotdForLocalDate = first(
        await db
          .select({ id: FeaturedItems.id })
          .from(FeaturedItems)
          .innerJoin(VotdPublishHistory, eq(FeaturedItems.id, VotdPublishHistory.featuredItemId))
          .where(and(...publishedTodayConditions))
          .limit(1),
      );

      if (!hasPublishedVotdForLocalDate) {
        const votdFallbackRows = await db
          .select({
            ...selectColumns,
            votdPublishedDate: VotdPublishHistory.publishedDate,
          })
          .from(FeaturedItems)
          .innerJoin(VotdPublishHistory, eq(FeaturedItems.id, VotdPublishHistory.featuredItemId))
          .where(and(...votdFallbackConditions))
          .orderBy(desc(VotdPublishHistory.publishedDate), desc(FeaturedItems.createdAt))
          .limit(1);
        if (votdFallbackRows.length > 0) {
          const row = votdFallbackRows[0]!;
          console.log(
            `[api/featured/items] VOTD fallback used: timezone=${timeZone} localDate=${localCalendarDate} publishedDate=${row.votdPublishedDate}`,
          );
          votdRows = [
            {
              id: row.id,
              contentType: row.contentType,
              title: row.title,
              description: row.description,
              refId: row.refId,
              shareToken: row.shareToken,
              color: row.color,
              metadata: row.metadata,
              createdAt: row.createdAt,
            },
          ];
        }
      }
    }

    let items = [...nonVotdRows, ...votdRows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // For 'space' items, auto-complete any where the user is already an owner or member.
    const spaceItems = items.filter((i) => i.contentType === 'space' && (i.shareToken || i.refId));
    if (spaceItems.length > 0) {
      const shareTokens = spaceItems.map((i) => i.shareToken).filter(Boolean) as string[];
      const refIds = spaceItems.map((i) => i.refId).filter(Boolean) as string[];

      const conditions = [];
      if (shareTokens.length > 0) conditions.push(inArray(Spaces.shareToken, shareTokens));
      if (refIds.length > 0) conditions.push(inArray(Spaces.id, refIds));

      const matchedSpaces = await db
        .select({ id: Spaces.id, shareToken: Spaces.shareToken, ownerId: Spaces.userId })
        .from(Spaces)
        .where(or(...conditions));

      if (matchedSpaces.length > 0) {
        const spaceIds = matchedSpaces.map((s) => s.id);
        const ownedIds = new Set(matchedSpaces.filter((s) => s.ownerId === auth.userId).map((s) => s.id));

        const memberships = spaceIds.length > 0
          ? await db
              .select({ spaceId: SpaceMemberships.spaceId })
              .from(SpaceMemberships)
              .where(and(eq(SpaceMemberships.userId, auth.userId), inArray(SpaceMemberships.spaceId, spaceIds)))
          : [];
        const memberIds = new Set(memberships.map((m) => m.spaceId));

        const spaceByToken = new Map(matchedSpaces.map((s) => [s.shareToken, s.id]));
        const spaceByRefId = new Map(matchedSpaces.map((s) => [s.id, s.id]));

        const toAutoDismiss: string[] = [];
        for (const item of spaceItems) {
          const spaceId = item.shareToken
            ? spaceByToken.get(item.shareToken)
            : item.refId
            ? spaceByRefId.get(item.refId)
            : null;
          if (spaceId && (ownedIds.has(spaceId) || memberIds.has(spaceId))) {
            toAutoDismiss.push(item.id);
          }
        }

        if (toAutoDismiss.length > 0) {
          const timestamp = now();
          // Fire-and-forget: record as completed so it won't reappear
          db.insert(UserFeaturedItems)
            .values(
              toAutoDismiss.map((featuredItemId) => ({
                id: crypto.randomUUID(),
                userId: auth.userId,
                featuredItemId,
                status: 'completed',
                dismissedAt: null,
                completedAt: timestamp,
                createdAt: timestamp,
              })),
            )
            .onConflictDoUpdate({
              target: [UserFeaturedItems.userId, UserFeaturedItems.featuredItemId],
              set: { status: 'completed', completedAt: timestamp },
            })
            .catch(() => {});

          const autoDismissed = new Set(toAutoDismiss);
          items = items.filter((i) => !autoDismissed.has(i.id));
        }
      }
    }

    // VOTD: return verse text in the user's preferred translation so the client does not need a
    // second fetch (avoids visible verse swap when catalog translation differs from UserMetadata).
    const preferredTranslation = await getUserDefaultTranslation(auth.userId);
    for (let idx = 0; idx < items.length; idx++) {
      const row = items[idx];
      if (row.contentType !== 'votd' || !row.metadata) continue;
      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(row.metadata);
      } catch {
        continue;
      }
      const catalogT = String(meta.translation ?? 'NET').trim() || 'NET';
      const ref = typeof meta.reference === 'string' ? meta.reference.trim() : '';
      if (!ref || preferredTranslation === catalogT) continue;

      try {
        const html = await fetchVerseText(ref.replace(/,\s+/g, ','), preferredTranslation);
        if (html && html.trim().length > 0) {
          meta.verseText = html;
          meta.translation = preferredTranslation;
          items[idx] = { ...row, metadata: JSON.stringify(meta) };
        }
      } catch {
        /* keep catalog metadata */
      }
    }

    c.res.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
    c.res.headers.append('Vary', 'X-Votd-Timezone');
    return c.json(
      items.map((i) => ({
        id: i.id,
        contentType: i.contentType,
        title: i.title,
        description: i.description ?? null,
        refId: i.refId ?? null,
        shareToken: i.shareToken ?? null,
        color: i.color ?? null,
        metadata: i.metadata ? (() => { try { return JSON.parse(i.metadata!); } catch { return null; } })() : null,
      })),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    c.res.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=30');
    return c.json({ error: message }, 500);
  }
});

// Erase a featured item from the inbox (marks as completed — hidden from both dashboard and inbox).
app.post('/api/featured/erase', requireAuth, async (c) => {
  const auth = getAuthenticatedAuth(c);
  const body = (await c.req.json().catch(() => ({}))) as { featuredItemId?: string };
  const featuredItemId = body.featuredItemId?.trim() ?? '';
  if (!featuredItemId) {
    return c.json({ error: 'featuredItemId is required' }, 400);
  }

  const timestamp = now();

  await db
    .insert(UserFeaturedItems)
    .values({
      id: crypto.randomUUID(),
      userId: auth.userId,
      featuredItemId,
      status: 'completed',
      dismissedAt: null,
      completedAt: timestamp,
      createdAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [UserFeaturedItems.userId, UserFeaturedItems.featuredItemId],
      set: {
        status: 'completed',
        completedAt: timestamp,
      },
    });

  return c.json({ success: true });
});

// Record a dismissal for a featured item.
// VOTD items always get 'completed' status (they never appear in My Inbox).
app.post('/api/featured/dismiss', requireAuth, async (c) => {
  const auth = getAuthenticatedAuth(c);
  const body = (await c.req.json().catch(() => ({}))) as {
    featuredItemId?: string;
    /** When set on a VOTD item, user chose “Create note” (not Close-only). Awards VOTD engagement XP once per item. */
    votdEngagement?: 'create_note';
  };
  const featuredItemId = body.featuredItemId?.trim() ?? '';
  if (!featuredItemId) {
    return c.json({ error: 'featuredItemId is required' }, 400);
  }

  // Check if this is a VOTD item — those are always completed, never dismissed
  const featuredItem = first(
    await db.select({ contentType: FeaturedItems.contentType }).from(FeaturedItems).where(eq(FeaturedItems.id, featuredItemId)).limit(1),
  );
  const isVotd = featuredItem?.contentType === 'votd';

  const timestamp = now();
  const status = isVotd ? 'completed' : 'dismissed';

  await db
    .insert(UserFeaturedItems)
    .values({
      id: crypto.randomUUID(),
      userId: auth.userId,
      featuredItemId,
      status,
      dismissedAt: isVotd ? null : timestamp,
      completedAt: isVotd ? timestamp : null,
      createdAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [UserFeaturedItems.userId, UserFeaturedItems.featuredItemId],
      set: {
        status,
        dismissedAt: isVotd ? null : timestamp,
        completedAt: isVotd ? timestamp : null,
      },
    });

  if (isVotd && body.votdEngagement === 'create_note') {
    await awardVotdEngagementXP(auth.userId, featuredItemId, 'create_note');
  }

  return c.json({ success: true });
});

// List dismissed featured items for the current user (for "My Inbox").
// VOTD items are explicitly excluded — they never appear in My Inbox.
app.get('/api/featured/dismissed', requireAuth, async (c) => {
  const auth = getAuthenticatedAuth(c);
  const dismissedConditions = [
    eq(UserFeaturedItems.userId, auth.userId),
    eq(UserFeaturedItems.status, 'dismissed'),
    ne(FeaturedItems.contentType, 'votd'),
  ];
  if (shouldExcludeDevSampleFeaturedItems(c)) {
    dismissedConditions.push(notInArray(FeaturedItems.id, DEV_SAMPLE_FEATURED_ITEM_IDS));
  }

  const rows = await db
    .select({
      featuredItemId: UserFeaturedItems.featuredItemId,
      status: UserFeaturedItems.status,
      dismissedAt: UserFeaturedItems.dismissedAt,
      itemId: FeaturedItems.id,
      contentType: FeaturedItems.contentType,
      title: FeaturedItems.title,
      description: FeaturedItems.description,
      refId: FeaturedItems.refId,
      shareToken: FeaturedItems.shareToken,
      color: FeaturedItems.color,
      createdAt: FeaturedItems.createdAt,
    })
    .from(UserFeaturedItems)
    .innerJoin(FeaturedItems, eq(UserFeaturedItems.featuredItemId, FeaturedItems.id))
    .where(and(...dismissedConditions))
    .orderBy(desc(UserFeaturedItems.dismissedAt));

  return c.json(
    rows.map((r) => ({
      id: r.itemId,
      contentType: r.contentType,
      title: r.title,
      description: r.description ?? null,
      refId: r.refId ?? null,
      shareToken: r.shareToken ?? null,
      color: r.color ?? null,
      dismissedAt: r.dismissedAt ?? null,
    })),
  );
});

// Admin: lightweight check so the SPA can conditionally render admin UI.
app.get('/api/admin/check', async (c) => {
  const unauthorized = await requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;
  return c.json({ isAdmin: true });
});

// Admin: get the currently-active featured item for a space share token.
app.get('/api/admin/featured/by-space/:shareToken', async (c) => {
  const unauthorized = await requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const shareToken = c.req.param('shareToken')?.trim() ?? '';
  if (!shareToken) return c.json({ error: 'shareToken is required' }, 400);

  const item = first(
    await db
      .select()
      .from(FeaturedItems)
      .where(and(eq(FeaturedItems.contentType, 'space'), eq(FeaturedItems.shareToken, shareToken), eq(FeaturedItems.isActive, true)))
      .orderBy(desc(FeaturedItems.createdAt))
      .limit(1),
  );

  return c.json(item ?? null);
});

// Admin: get the currently-active featured item for a thread share token.
app.get('/api/admin/featured/by-thread/:shareToken', async (c) => {
  const unauthorized = await requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const shareToken = c.req.param('shareToken')?.trim() ?? '';
  if (!shareToken) return c.json({ error: 'shareToken is required' }, 400);

  const item = first(
    await db
      .select()
      .from(FeaturedItems)
      .where(and(eq(FeaturedItems.contentType, 'thread'), eq(FeaturedItems.shareToken, shareToken), eq(FeaturedItems.isActive, true)))
      .orderBy(desc(FeaturedItems.createdAt))
      .limit(1),
  );

  return c.json(item ?? null);
});

// Admin: create a featured item.
app.post('/api/admin/featured', async (c) => {
  const unauthorized = await requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const body = (await c.req.json().catch(() => ({}))) as {
    contentType?: string;
    title?: string;
    description?: string | null;
    refId?: string | null;
    shareToken?: string | null;
    color?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    isActive?: boolean;
    metadata?: Record<string, unknown> | null;
  };

  const contentType = body.contentType?.trim() ?? '';
  const title = body.title?.trim() ?? '';
  if (!contentType || !title) {
    return c.json({ error: 'contentType and title are required' }, 400);
  }

  const allowed = new Set(['space', 'thread', 'recall', 'challenge', 'church', 'votd']);
  if (!allowed.has(contentType)) {
    return c.json({ error: `Invalid contentType: ${contentType}` }, 400);
  }

  const token = body.shareToken?.trim() ?? '';
  if (contentType === 'thread') {
    if (!token) return c.json({ error: 'shareToken is required for thread featured items' }, 400);
    const thread = first(
      await db
        .select({ id: Threads.id })
        .from(Threads)
        .where(and(eq(Threads.shareToken, token), eq(Threads.isPublic, true)))
        .limit(1),
    );
    if (!thread) return c.json({ error: 'No public shared thread found for this shareToken' }, 400);
  }

  const timestamp = now();
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  const metadataStr = body.metadata ? JSON.stringify(body.metadata) : null;

  const inserted = first(
    await db
      .insert(FeaturedItems)
      .values({
        id: crypto.randomUUID(),
        contentType,
        title,
        description: body.description ?? null,
        refId: body.refId ?? null,
        shareToken: token || null,
        color: body.color ?? null,
        isActive: body.isActive ?? true,
        startsAt,
        endsAt,
        metadata: metadataStr,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
  );

  return c.json(inserted ?? { success: true });
});

// Admin: update a featured item (used for deactivating + editing description/color).
app.patch('/api/admin/featured/:id', async (c) => {
  const unauthorized = await requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;

  const id = c.req.param('id')?.trim() ?? '';
  if (!id) return c.json({ error: 'id is required' }, 400);

  const body = (await c.req.json().catch(() => ({}))) as {
    isActive?: boolean;
    description?: string | null;
    color?: string | null;
  };

  const set: Partial<typeof FeaturedItems.$inferInsert> = { updatedAt: now() };
  if (typeof body.isActive === 'boolean') set.isActive = body.isActive;
  if (body.description !== undefined) set.description = body.description;
  if (body.color !== undefined) set.color = body.color;

  if (Object.keys(set).length <= 1) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const updated = first(await db.update(FeaturedItems).set(set as any).where(eq(FeaturedItems.id, id)).returning());
  if (!updated) return c.json({ error: 'Not found' }, 404);
  return c.json(updated);
});

// VOTD quick-add: creates a scripture note from a VOTD featured item.
app.post('/api/featured/votd/quick-add', requireAuth, async (c) => {
  const auth = getAuthenticatedAuth(c);
  const body = (await c.req.json().catch(() => ({}))) as { featuredItemId?: string };
  const featuredItemId = body.featuredItemId?.trim() ?? '';
  if (!featuredItemId) {
    return c.json({ error: 'featuredItemId is required' }, 400);
  }

  // Load the featured item
  const featuredItem = first(
    await db.select().from(FeaturedItems).where(eq(FeaturedItems.id, featuredItemId)).limit(1),
  );
  if (!featuredItem || featuredItem.contentType !== 'votd') {
    return c.json({ error: 'VOTD featured item not found' }, 404);
  }

  let metadata: { reference?: string; translation?: string; verseText?: string; book?: string; chapter?: number; verse?: number; verseEnd?: number } = {};
  try {
    if (featuredItem.metadata) metadata = JSON.parse(featuredItem.metadata);
  } catch {}

  const reference = metadata.reference || featuredItem.title;
  const catalogTranslation = metadata.translation || 'NET';
  const catalogVerseHtml = metadata.verseText || featuredItem.description || '';

  await ensureUnorganizedThread(auth.userId);

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

  const preferredTranslation =
    (userMetadata?.defaultTranslation && userMetadata.defaultTranslation.trim()) || catalogTranslation;

  let noteContentHtml = catalogVerseHtml;
  let scriptureTranslationStored = catalogTranslation;
  let scriptureOriginalStored = catalogVerseHtml;
  if (preferredTranslation !== catalogTranslation || !catalogVerseHtml.trim()) {
    try {
      const refForFetch = reference.replace(/,\s+/g, ',');
      const fetched = await fetchVerseText(refForFetch, preferredTranslation);
      if (fetched.trim().length > 0) {
        noteContentHtml = fetched;
        scriptureTranslationStored = preferredTranslation;
        scriptureOriginalStored = fetched;
      }
    } catch {
      /* keep catalog */
    }
  }

  const effectiveHighest = await getEffectiveHighestSimpleNoteId(auth.userId);
  const nextSimpleNoteId = effectiveHighest + 1;
  const timestamp = nowISO();
  const shareToken = generateShareToken();

  const newNote = first(
    await db.insert(Notes).values({
      id: generateNoteId(),
      content: noteContentHtml,
      title: reference,
      threadId: 'thread_unorganized',
      spaceId: null,
      simpleNoteId: nextSimpleNoteId,
      noteType: 'scripture',
      userId: auth.userId,
      isPublic: true,
      shareToken,
      shareTokenCreatedAt: timestamp,
      contentEncrypted: false,
      createdAt: timestamp,
      lastVisited: timestamp,
    }).returning(),
  );

  if (!newNote) return c.json({ error: 'Failed to create note' }, 500);

  await db.update(UserMetadata)
    .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: nowISO() })
    .where(eq(UserMetadata.userId, auth.userId));

  await db.update(Threads).set({ updatedAt: nowISO() })
    .where(and(eq(Threads.id, 'thread_unorganized'), eq(Threads.userId, auth.userId)));

  // Create ScriptureMetadata
  try {
    const normalizedReference = normalizeScriptureReference(reference);
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
        translation: scriptureTranslationStored,
        originalText: scriptureOriginalStored,
        createdAt: nowISO(),
      });
    }
  } catch (err) {
    console.error('[votd/quick-add] ScriptureMetadata error (non-critical):', err);
  }

  // Award XP (non-critical)
  try { await awardCreationBonusXP(auth.userId, 'note'); } catch {}
  try {
    await awardVotdEngagementXP(auth.userId, featuredItemId, 'quick_add');
  } catch {
    /* non-fatal */
  }

  // Mark VOTD as completed so it disappears from the carousel
  const completedAt = now();
  await db
    .insert(UserFeaturedItems)
    .values({
      id: crypto.randomUUID(),
      userId: auth.userId,
      featuredItemId,
      status: 'completed',
      dismissedAt: null,
      completedAt,
      createdAt: completedAt,
    })
    .onConflictDoUpdate({
      target: [UserFeaturedItems.userId, UserFeaturedItems.featuredItemId],
      set: { status: 'completed', completedAt },
    });

  return c.json({ success: true, noteId: newNote.id });
});

// Back-compat shim: old featured-space endpoint (soft-deprecated).
app.get('/api/featured/space', async (c) => {
  try {
    const systemUserId = getHarvousSystemUserId();
    const space = first(
      await db
        .select({
          id: Spaces.id,
          title: Spaces.title,
          description: Spaces.description,
          color: Spaces.color,
          shareToken: Spaces.shareToken,
          isPublic: Spaces.isPublic,
          isFeatured: Spaces.isFeatured,
          createdAt: Spaces.createdAt,
        })
        .from(Spaces)
        .where(
          and(eq(Spaces.userId, systemUserId), eq(Spaces.isFeatured, true), eq(Spaces.isPublic, true), eq(Spaces.isActive, true)),
        )
        .orderBy(desc(Spaces.createdAt))
        .limit(1),
    );

    if (!space?.shareToken || !space.isPublic || !space.isFeatured) {
      c.res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return c.json(null);
    }

    const origin = new URL(c.req.url).origin;
    const joinUrl = `${origin}/spaces/join/${space.shareToken}`;

    c.res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return c.json({
      id: space.id,
      title: space.title,
      description: space.description,
      color: space.color,
      shareToken: space.shareToken,
      joinUrl,
    });
  } catch {
    c.res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return c.json(null);
  }
});

export default app;

