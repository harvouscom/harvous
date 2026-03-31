import { Hono } from 'hono';
import { and, db, desc, eq, first, Spaces } from '../db';
import { getHarvousSystemUserId } from '../utils/harvous-admin';

const app = new Hono();

// Public endpoint: used by dashboard to show a featured Harvous-curated space.
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
          and(
            eq(Spaces.userId, systemUserId),
            eq(Spaces.isFeatured, true),
            eq(Spaces.isPublic, true),
            eq(Spaces.isActive, true),
          ),
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
    // If env isn't configured yet, fail soft so the dashboard doesn't break.
    c.res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return c.json(null);
  }
});

export default app;

