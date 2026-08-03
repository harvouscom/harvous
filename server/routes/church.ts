/**
 * Congregant-facing church routes — the receive half of church org.
 *
 * Distinct from `churches.ts`, which is the requireHarvousAdmin provisioning
 * panel. Everything here is scoped to the caller's own home church
 * (`UserMetadata.connectedOrgId`, set when they pick a registered church in
 * Settings › My Church). A user with no connected church gets an empty payload,
 * never someone else's church.
 *
 * Endpoints:
 *   GET  /api/church/channels                       — browse ministry channels + follow state
 *   POST /api/church/channels/:spaceId/follow       — follow (SpaceMemberships role='member')
 *   POST /api/church/channels/:spaceId/unfollow     — unfollow
 *   GET  /api/church/feed                           — recent notes from followed channels
 *   GET  /api/church/billing                        — staff: sponsorship + purchasable plans
 *   POST /api/church/checkout                       — staff: Polar checkout for the Church plan
 *
 * There is deliberately no copy endpoint here. "Start my own note" from a
 * channel note already works through `POST /api/spaces/:spaceId/copy-notes`:
 * a follower holds a `member` row, so the source note is readable, and My Home
 * is authorable — which is exactly that route's foreign-source path. The note
 * more-menu's "Save a copy" is already wired to it for any read-only foreign
 * note, ministry channels included.
 *
 * Follow writes a plain `member` row, which `getMemberOfSpaces` already returns
 * for any space type — so a followed channel flows into `nav.memberOfSpaces`
 * and the My Church hub with no navigation changes. `canAuthorInSpace` denies
 * `member` on `type='public'`, so channels are read-only for congregants by
 * construction rather than by a new check here.
 */

import { Hono } from 'hono';
import {
  db,
  first,
  Notes,
  Spaces,
  SpaceNotes,
  SpaceMemberships,
  UserMetadata,
  eq,
  and,
  desc,
  inArray,
  isNull,
} from '../db';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { stripHtmlForCard } from '@/utils/html-stripper';
import { batchAuthorAttribution } from '../utils/dashboard-data';
import {
  buildChannelCadenceFields,
  getLastCurriculumAtBySpaceIds,
  isMinistryBroadcastSpaceRow,
} from '../utils/channel-publish-cadence';
import {
  followMinistryChannel,
  unfollowMinistryChannel,
} from '../utils/ministry-channel-follow';
import {
  CHURCH_LAPSED_CODE,
  CHURCH_LAPSED_ERROR,
  churchSponsorship,
  type ChurchRow,
} from '../utils/church-entitlement';
import { getActiveChurchByOrgId, isChurchStaffForOrg } from '../utils/church-staff';
import { getPolarClient, isPolarConfigured } from '../utils/polar-client';
import { getPublicAppOrigin } from '../utils/public-app-origin';
import {
  churchPlanFor,
  churchPlans,
  formatPlanPrice,
  type PlanInterval,
} from '@/lib/billing-plans';

const app = new Hono();

/** Feed excerpt length — enough for two lines on a Home card. */
const FEED_EXCERPT_LENGTH = 180;
const FEED_LIMIT_DEFAULT = 12;
const FEED_LIMIT_MAX = 50;

/** The caller's home church, or null when they haven't connected one. */
async function getConnectedChurch(userId: string): Promise<ChurchRow | null> {
  const meta = first(
    await db
      .select({ connectedOrgId: UserMetadata.connectedOrgId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  if (!meta?.connectedOrgId) return null;
  return getActiveChurchByOrgId(meta.connectedOrgId);
}

/** Active ministry channels (type='public' + orgId) for a church. */
async function listOrgChannels(orgId: string) {
  return db
    .select({
      id: Spaces.id,
      title: Spaces.title,
      description: Spaces.description,
      color: Spaces.color,
      type: Spaces.type,
      orgId: Spaces.orgId,
      publishCadence: Spaces.publishCadence,
      isActive: Spaces.isActive,
    })
    .from(Spaces)
    .where(and(eq(Spaces.orgId, orgId), eq(Spaces.type, 'public'), isNull(Spaces.deletedAt)));
}

// ─── GET /api/church/channels ───────────────────────────────────────────────
/**
 * Browse surface: every active ministry channel the caller's church publishes,
 * each flagged with whether they already follow it. Deliberately does NOT
 * require membership — this is how an unfollowed channel becomes discoverable.
 */
app.get('/api/church/channels', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const church = await getConnectedChurch(auth.userId);

    if (!church) {
      return c.json({ connected: false, church: null, channels: [] });
    }

    const sponsorship = churchSponsorship(church);
    const channels = (await listOrgChannels(church.orgId)).filter((space) => space.isActive);

    if (channels.length === 0) {
      return c.json({
        connected: true,
        church: { id: church.id, name: church.name, orgId: church.orgId },
        sponsorship,
        channels: [],
      });
    }

    const channelIds = channels.map((space) => space.id);
    const [memberships, lastCurriculumById] = await Promise.all([
      db
        .select({ spaceId: SpaceMemberships.spaceId, role: SpaceMemberships.role })
        .from(SpaceMemberships)
        .where(
          and(
            eq(SpaceMemberships.userId, auth.userId),
            inArray(SpaceMemberships.spaceId, channelIds),
          ),
        ),
      getLastCurriculumAtBySpaceIds(channelIds),
    ]);

    const roleBySpace = new Map(memberships.map((row) => [row.spaceId, row.role]));

    const payload = channels
      .map((space) => {
        const role = roleBySpace.get(space.id) ?? null;
        return {
          id: space.id,
          title: space.title,
          description: space.description,
          color: space.color,
          role,
          isFollowing: role === 'member',
          // Staff already reach their channels through the hub's staff lane;
          // the browse list flags them so it never offers "Follow" to an author.
          isStaff: role === 'owner' || role === 'leader',
          ...buildChannelCadenceFields(
            space.publishCadence,
            lastCurriculumById.get(space.id) ?? null,
          ),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

    return c.json({
      connected: true,
      church: { id: church.id, name: church.name, orgId: church.orgId },
      sponsorship,
      channels: payload,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/channels',
      action: 'list_church_channels',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/channels/:spaceId/follow | /unfollow ──────────────────
/**
 * Gate order matters: resolve the space first, then require that its orgId is
 * the caller's *own* connected church. Without that check any signed-in user
 * could follow any church's channel by guessing a space id.
 */
async function resolveFollowTarget(userId: string, spaceId: string) {
  const space = first(await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).limit(1));
  if (!space || space.deletedAt || !isMinistryBroadcastSpaceRow(space)) {
    return { ok: false as const, status: 404 as const, code: 'CHANNEL_NOT_FOUND', error: 'Ministry channel not found' };
  }

  const church = await getConnectedChurch(userId);
  if (!church || church.orgId !== space.orgId) {
    // Same 404 as an unknown id: never confirm a channel exists to someone
    // outside the church.
    return { ok: false as const, status: 404 as const, code: 'CHANNEL_NOT_FOUND', error: 'Ministry channel not found' };
  }

  return { ok: true as const, space, church };
}

app.post('/api/church/channels/:spaceId/follow', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const target = await resolveFollowTarget(auth.userId, c.req.param('spaceId') ?? '');
    if (!target.ok) return c.json({ error: target.error, code: target.code }, target.status);

    // New follows require a sponsored church; existing follows keep reading.
    if (!churchSponsorship(target.church).sponsored) {
      return c.json({ error: CHURCH_LAPSED_ERROR, code: CHURCH_LAPSED_CODE }, 402);
    }
    if (!target.space.isActive) {
      return c.json({ error: 'This channel is not active', code: 'CHANNEL_INACTIVE' }, 409);
    }

    const result = await followMinistryChannel(auth.userId, target.space.id);
    if (!result.followed && result.code) {
      return c.json({ error: result.reason ?? 'Could not follow', code: result.code }, 409);
    }
    return c.json({ success: true, spaceId: target.space.id, following: true, reason: result.reason ?? null });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/channels/[spaceId]/follow',
      action: 'follow_ministry_channel',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

app.post('/api/church/channels/:spaceId/unfollow', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const target = await resolveFollowTarget(auth.userId, c.req.param('spaceId') ?? '');
    if (!target.ok) return c.json({ error: target.error, code: target.code }, target.status);

    // No sponsorship check: leaving must always work, even for a lapsed church.
    const result = await unfollowMinistryChannel(auth.userId, target.space.id);
    if (!result.unfollowed && result.code) {
      const status = result.code === 'STAFF_ROW' ? 409 : 404;
      return c.json({ error: result.reason ?? 'Could not unfollow', code: result.code }, status);
    }
    return c.json({ success: true, spaceId: target.space.id, following: false, reason: result.reason ?? null });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/channels/[spaceId]/unfollow',
      action: 'unfollow_ministry_channel',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/church/feed ───────────────────────────────────────────────────
/**
 * "From your church" — newest notes across the channels the caller follows.
 *
 * Preview cards, not full notes: title + excerpt + provenance, so opening one
 * still goes through the normal space-scoped note read (which enforces access).
 * Encrypted notes are excluded at the query level, matching how every other
 * shared surface treats them.
 */
app.get('/api/church/feed', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const limitRaw = Number(c.req.query('limit') ?? FEED_LIMIT_DEFAULT);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(FEED_LIMIT_MAX, Math.max(1, Math.trunc(limitRaw)))
      : FEED_LIMIT_DEFAULT;

    const church = await getConnectedChurch(auth.userId);
    if (!church) return c.json({ connected: false, items: [] });

    // Followed channels only — a 'member' row on a ministry space of this church.
    const followed = await db
      .select({
        id: Spaces.id,
        title: Spaces.title,
        color: Spaces.color,
      })
      .from(SpaceMemberships)
      .innerJoin(Spaces, eq(SpaceMemberships.spaceId, Spaces.id))
      .where(
        and(
          eq(SpaceMemberships.userId, auth.userId),
          eq(SpaceMemberships.role, 'member'),
          eq(Spaces.orgId, church.orgId),
          eq(Spaces.type, 'public'),
          eq(Spaces.isActive, true),
          isNull(Spaces.deletedAt),
        ),
      );

    if (followed.length === 0) {
      return c.json({ connected: true, church: { id: church.id, name: church.name }, items: [] });
    }

    const spaceById = new Map(followed.map((space) => [space.id, space]));

    const rows = await db
      .select({
        noteId: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        authorUserId: Notes.userId,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
        spaceId: SpaceNotes.spaceId,
        addedAt: SpaceNotes.addedAt,
      })
      .from(SpaceNotes)
      .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
      .where(
        and(
          inArray(SpaceNotes.spaceId, [...spaceById.keys()]),
          isNull(SpaceNotes.removedAt),
          eq(Notes.contentEncrypted, false),
        ),
      )
      .orderBy(desc(SpaceNotes.addedAt))
      .limit(limit);

    const authors = await batchAuthorAttribution(rows.map((row) => row.authorUserId));

    const items = rows.map((row) => {
      const space = spaceById.get(row.spaceId!)!;
      const author = authors[row.authorUserId];
      return {
        noteId: row.noteId,
        title: row.title,
        excerpt: stripHtmlForCard(row.content ?? '').slice(0, FEED_EXCERPT_LENGTH),
        noteType: row.noteType ?? 'default',
        publishedAt: (row.addedAt ?? row.createdAt) ?? null,
        updatedAt: row.updatedAt ?? row.createdAt ?? null,
        channel: { id: space.id, title: space.title, color: space.color },
        author: {
          displayName: author?.displayName ?? 'Church staff',
          userColor: author?.userColor ?? 'blue',
          profileImageUrl: author?.profileImageUrl ?? null,
        },
      };
    });

    return c.json({
      connected: true,
      church: { id: church.id, name: church.name },
      items,
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/feed',
      action: 'church_feed',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/church/billing ────────────────────────────────────────────────
/**
 * Staff-only view of where the church stands: pilot countdown, paid state, and
 * the plans they can buy. Congregants get a 403 — how the church pays is not
 * their business, and the hub never renders billing chrome for them.
 */
app.get('/api/church/billing', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();

    const church = orgId ? await getActiveChurchByOrgId(orgId) : await getConnectedChurch(auth.userId);
    if (!church) return c.json({ error: 'Church not found', code: 'CHURCH_NOT_FOUND' }, 404);

    if (!(await isChurchStaffForOrg(auth.userId, church.orgId))) {
      return c.json({ error: 'Only church staff can view billing', code: 'CHURCH_STAFF_REQUIRED' }, 403);
    }

    return c.json({
      church: { id: church.id, name: church.name, orgId: church.orgId },
      sponsorship: churchSponsorship(church),
      billingStatus: church.billingStatus,
      plans: churchPlans().map((plan) => ({
        key: plan.key,
        name: plan.name,
        interval: plan.interval,
        amountCents: plan.amountCents,
        currencyCode: plan.currencyCode,
        price: formatPlanPrice(plan),
      })),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/billing',
      action: 'church_billing_status',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/checkout ──────────────────────────────────────────────
/**
 * Start a Polar checkout for the Church plan.
 *
 * `metadata.churchId` is what makes this a church purchase — the webhook grants
 * `Churches.billingPlan` from it, never a personal entitlement for the buyer.
 * `externalCustomerId` is still the staff member, because Polar needs a
 * customer and they are the one holding the card.
 */
app.post('/api/church/checkout', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    if (!isPolarConfigured()) {
      return c.json({ error: 'Billing is not configured', code: 'BILLING_UNCONFIGURED' }, 503);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      interval?: PlanInterval;
    };
    const orgId = (body.orgId ?? '').trim();

    const church = orgId ? await getActiveChurchByOrgId(orgId) : await getConnectedChurch(auth.userId);
    if (!church) return c.json({ error: 'Church not found', code: 'CHURCH_NOT_FOUND' }, 404);

    if (!(await isChurchStaffForOrg(auth.userId, church.orgId))) {
      return c.json({ error: 'Only church staff can subscribe', code: 'CHURCH_STAFF_REQUIRED' }, 403);
    }
    if (church.billingPlan) {
      return c.json({ error: 'This church already has a plan', code: 'CHURCH_ALREADY_PAID' }, 409);
    }

    const interval: PlanInterval = body.interval === 'year' ? 'year' : 'month';
    const plan = churchPlanFor(interval);
    if (!plan?.productId) {
      return c.json({ error: 'Church plan is not configured', code: 'PLAN_UNCONFIGURED' }, 503);
    }

    const meta = first(
      await db
        .select({ email: UserMetadata.email })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, auth.userId))
        .limit(1),
    );

    const origin = getPublicAppOrigin(c);
    const polar = getPolarClient();
    const checkout = await polar.checkouts.create({
      products: [plan.productId],
      externalCustomerId: auth.userId,
      ...(meta?.email?.includes('@') ? { customerEmail: meta.email } : {}),
      successUrl: `${origin}/?church_checkout={CHECKOUT_ID}`,
      metadata: { clerkUserId: auth.userId, churchId: church.id, orgId: church.orgId },
    });

    return c.json({ url: checkout.url, interval: plan.interval, plan: plan.key });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/checkout',
      action: 'create_church_checkout',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
