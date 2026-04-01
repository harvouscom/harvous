import { Hono } from 'hono';
import { and, db, desc, eq, first, gt, inArray, isNull, lte, notExists, or } from '../db';
import { now } from '../db/dates';
import { getAuth, getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { getHarvousSystemUserId, requireHarvousAdmin } from '../utils/harvous-admin';
import { FeaturedItems, Members, Spaces, UserFeaturedItems } from '../db/schema';

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

    let items = await db
      .select({
        id: FeaturedItems.id,
        contentType: FeaturedItems.contentType,
        title: FeaturedItems.title,
        description: FeaturedItems.description,
        refId: FeaturedItems.refId,
        shareToken: FeaturedItems.shareToken,
        color: FeaturedItems.color,
        createdAt: FeaturedItems.createdAt,
      })
      .from(FeaturedItems)
      .where(
        and(
          eq(FeaturedItems.isActive, true),
          or(isNull(FeaturedItems.startsAt), lte(FeaturedItems.startsAt, currentTime)),
          or(isNull(FeaturedItems.endsAt), gt(FeaturedItems.endsAt, currentTime)),
          notExists(
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
          ),
        ),
      )
      .orderBy(desc(FeaturedItems.createdAt));

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
              .select({ spaceId: Members.spaceId })
              .from(Members)
              .where(and(eq(Members.userId, auth.userId), inArray(Members.spaceId, spaceIds)))
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

    c.res.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
    return c.json(
      items.map((i) => ({
        id: i.id,
        contentType: i.contentType,
        title: i.title,
        description: i.description ?? null,
        refId: i.refId ?? null,
        shareToken: i.shareToken ?? null,
        color: i.color ?? null,
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
app.post('/api/featured/dismiss', requireAuth, async (c) => {
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
      status: 'dismissed',
      dismissedAt: timestamp,
      completedAt: null,
      createdAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [UserFeaturedItems.userId, UserFeaturedItems.featuredItemId],
      set: {
        status: 'dismissed',
        dismissedAt: timestamp,
        completedAt: null,
      },
    });

  return c.json({ success: true });
});

// List dismissed featured items for the current user (for "My Inbox").
app.get('/api/featured/dismissed', requireAuth, async (c) => {
  const auth = getAuthenticatedAuth(c);
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
    .where(and(eq(UserFeaturedItems.userId, auth.userId), eq(UserFeaturedItems.status, 'dismissed')))
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
  const unauthorized = requireHarvousAdmin(c);
  if (unauthorized) return unauthorized;
  return c.json({ isAdmin: true });
});

// Admin: get the currently-active featured item for a space share token.
app.get('/api/admin/featured/by-space/:shareToken', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
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

// Admin: create a featured item.
app.post('/api/admin/featured', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
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
  };

  const contentType = body.contentType?.trim() ?? '';
  const title = body.title?.trim() ?? '';
  if (!contentType || !title) {
    return c.json({ error: 'contentType and title are required' }, 400);
  }

  const allowed = new Set(['space', 'recall', 'challenge', 'church']);
  if (!allowed.has(contentType)) {
    return c.json({ error: `Invalid contentType: ${contentType}` }, 400);
  }

  const timestamp = now();
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;

  const inserted = first(
    await db
      .insert(FeaturedItems)
      .values({
        id: crypto.randomUUID(),
        contentType,
        title,
        description: body.description ?? null,
        refId: body.refId ?? null,
        shareToken: body.shareToken ?? null,
        color: body.color ?? null,
        isActive: body.isActive ?? true,
        startsAt,
        endsAt,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning(),
  );

  return c.json(inserted ?? { success: true });
});

// Admin: update a featured item (used for deactivating + editing description/color).
app.patch('/api/admin/featured/:id', async (c) => {
  const unauthorized = requireHarvousAdmin(c);
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

