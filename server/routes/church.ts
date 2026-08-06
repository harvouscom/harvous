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
 *   GET  /api/church/services                       — the teaching plan ("This Sunday")
 *   GET  /api/church/billing                        — staff: sponsorship + purchasable plans
 *   POST /api/church/checkout                       — staff: Polar checkout for the Church plan
 *   GET  /api/church/staff                          — staff: roster + pending invites
 *   POST /api/church/staff/invite                   — org admin: invite by email
 *   POST /api/church/staff/revoke-invite            — org admin: revoke a pending invite
 *   POST /api/church/staff/remove                   — org admin: remove a staff member
 *   POST /api/church/staff/sync                     — staff: manual reconcile fallback
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
  NoteTemplates,
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
import {
  capabilitiesForChurchRole,
  isAssignableChurchRole,
  ROLE_ADMIN,
} from '../utils/church-role-capabilities';
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
import { listServicesForChurch, resolveViewerServiceNotes } from '../utils/church-teaching-plan';
import { syncChurchStaffForOrg } from '../utils/church-staff-sync';
import {
  churchClockNow,
  listServiceTimesForChurch,
  serviceTimeIdsByService,
} from '../utils/church-service-times';
import { seriesTitlesByServiceRows } from '../utils/church-series';
import {
  ClerkOrgError,
  ClerkOrgInviteError,
  CLERK_ORG_ADMIN_ROLE,
  CLERK_ORG_STAFF_CAP,
  canInviteMoreStaff,
  createClerkOrgInvitation,
  fetchClerkOrgMemberships,
  fetchClerkOrgPendingInvitations,
  isClerkOrgAdminRole,
  removeClerkOrgMember,
  updateClerkOrgMemberRole,
  revokeClerkOrgInvitation,
} from '../utils/clerk-org';
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

/**
 * How long a service stays visible after its date, in days.
 *
 * Four, not three or seven, and not arbitrary: it matches **the four-day wall**
 * — the Center for Bible Engagement finding that anchors harvous.com/about,
 * that one to three days a week barely moves the needle while four or more is
 * where engagement research sees real shifts. Do not "tidy" this number.
 *
 * Practically it also covers the gap people actually hit: churches enter next
 * week's plan mid-week, so Monday often has nothing upcoming — and Monday is
 * when someone writes up Sunday.
 *
 * The client re-derives the same window from its own local date; this server
 * bound is deliberately generous so no viewer's timezone can clip a service
 * the client still wants to show.
 */
const SERVICE_GRACE_DAYS = 4;
/** A couple of months of plan is plenty for a card that shows one service. */
const SERVICES_PAYLOAD_LIMIT = 8;

/**
 * Lower bound for the services window as 'YYYY-MM-DD'.
 *
 * Computed in UTC with one extra day of slack, so a viewer west of UTC never
 * loses a service the server has already aged out. Narrowing to the exact local
 * window is the client's job (`currentSermonFor`).
 */
function serviceGraceWindowStart(): string {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - (SERVICE_GRACE_DAYS + 1));
  return cutoff.toISOString().slice(0, 10);
}

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

// ─── GET /api/church/services ───────────────────────────────────────────────
/**
 * The church's teaching plan, congregant side — what powers "This Sunday".
 *
 * Returns the next few services plus a grace window of recently-past ones, so
 * Monday morning (the highest-intent moment for writing up a sermon) still has
 * something to open. The client picks which one is "current" using its own
 * local date; there is no timezone parameter and no server-side "today" logic,
 * because a service is a day on the church's wall calendar, not an instant.
 *
 * Deliberately NOT sponsorship-gated. A lapsed church stops being able to
 * *write* its plan; the congregation never loses the Sunday it already has.
 *
 * The `starter` payload inlines the church's org template so the card can build
 * the note body without a second round trip. It exposes nothing new — org
 * templates are already readable by any connected congregant via
 * /api/note-templates/list.
 */
app.get('/api/church/services', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const church = await getConnectedChurch(auth.userId);
    if (!church) return c.json({ connected: false, services: [] });

    const from = serviceGraceWindowStart();
    const services = await listServicesForChurch(church.id, {
      from,
      limit: SERVICES_PAYLOAD_LIMIT,
    });
    if (services.length === 0) {
      return c.json({ connected: true, church: { id: church.id, name: church.name }, services: [] });
    }

    const viewerNotes = await resolveViewerServiceNotes(
      auth.userId,
      services.map((service) => service.id),
    );

    // One fetch for every distinct starter template referenced by the window.
    const templateIds = [
      ...new Set(services.map((s) => s.starterTemplateId).filter((id): id is string => Boolean(id))),
    ];
    const templates = templateIds.length
      ? await db
          .select()
          .from(NoteTemplates)
          .where(
            and(inArray(NoteTemplates.id, templateIds), eq(NoteTemplates.orgId, church.orgId)),
          )
      : [];
    const templateById = new Map(templates.map((t) => [t.id, t]));


    /*
      Resolve each sermon's times server-side. A congregant gets clock readings,
      never slot ids and never the church's whole schedule — the times of the
      sermon in front of them, and nothing about the ones they aren't seeing.
    */
    const serviceTimeRows = await listServiceTimesForChurch(church.id);
    const startTimeById = new Map(serviceTimeRows.map((row) => [row.id, row.startTime]));
    const slotsByService = await serviceTimeIdsByService(services.map((row) => row.id));
    // One keyed lookup for the whole payload — the congregant card renders the
    // series name, and since ChurchSeries the name lives on the series row.
    const seriesTitles = await seriesTitlesByServiceRows(services);

    return c.json({
      connected: true,
      church: { id: church.id, name: church.name },
      /*
        The church's own wall clock, so the client can tell whether this
        morning's service has already started without guessing from the
        viewer's zone. The one place a timezone is ever applied.
      */
      churchNow: churchClockNow(church.timezone),
      services: services.map((service) => {
        const template = service.starterTemplateId
          ? templateById.get(service.starterTemplateId)
          : undefined;
        const slotTimes = (slotsByService.get(service.id) ?? [])
          .map((id) => startTimeById.get(id))
          .filter((time): time is string => Boolean(time));
        // A one-off time only speaks when the sermon claims no usual service.
        const times = slotTimes.length > 0 ? [...slotTimes].sort() : service.serviceTime ? [service.serviceTime] : [];
        return {
          id: service.id,
          serviceDate: service.serviceDate,
          /*
            Every time this sermon is preached, ascending — a church with 9:00
            and 10:45 morning services sends both, because it is one sermon at
            two services rather than two sermons.

            The church's wall clock, never converted to the viewer's zone: a
            service time is a clock reading on a wall calendar, not an instant.
          */
          serviceTimes: times,
          title: service.title,
          seriesTitle: service.seriesId ? seriesTitles.get(service.seriesId) ?? null : null,
          reference: service.reference,
          viewerNoteId: viewerNotes.get(service.id) ?? null,
          starter: template
            ? {
                templateId: template.id,
                templateName: template.name,
                title: template.title,
                content: template.content,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/services',
      action: 'church_services',
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

// ─── Staff roster (church self-serve) ───────────────────────────────────────
/**
 * Resolve the church for a staff request and the caller's Clerk org role.
 *
 * Two distinct gates on purpose: `isChurchStaffForOrg` says "you belong to this
 * church" (enough to see the roster), while the Clerk role says "you may change
 * it". A leader can publish curriculum without being able to staff the org.
 */
async function resolveStaffContext(
  userId: string,
  orgIdInput: string,
): Promise<
  | { ok: true; church: ChurchRow; roster: Awaited<ReturnType<typeof fetchClerkOrgMemberships>>; role: string | null }
  | { ok: false; status: 403 | 404; code: string; error: string }
> {
  const orgId = orgIdInput.trim();
  const church = orgId ? await getActiveChurchByOrgId(orgId) : await getConnectedChurch(userId);
  if (!church) {
    return { ok: false, status: 404, code: 'CHURCH_NOT_FOUND', error: 'Church not found' };
  }
  if (!(await isChurchStaffForOrg(userId, church.orgId))) {
    return { ok: false, status: 403, code: 'CHURCH_STAFF_REQUIRED', error: 'Only church staff can manage the team' };
  }
  const roster = await fetchClerkOrgMemberships(church.orgId);
  const role = roster.find((member) => member.userId === userId)?.role ?? null;
  return { ok: true, church, roster, role };
}

function clerkFailureResponse(c: any, error: unknown) {
  if (error instanceof ClerkOrgInviteError) {
    return c.json({ error: error.message, code: error.code }, 409);
  }
  if (error instanceof ClerkOrgError) {
    if (error.code === 'CLERK_ORGS_NOT_ENABLED') {
      return c.json(
        { error: 'Staff management is unavailable right now', code: 'CLERK_ORGS_NOT_ENABLED' },
        503,
      );
    }
    return c.json({ error: 'Staff directory is unavailable — try again', code: 'CLERK_UNAVAILABLE' }, 502);
  }
  return null;
}

// ─── GET /api/church/staff ──────────────────────────────────────────────────
app.get('/api/church/staff', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const ctx = await resolveStaffContext(auth.userId, c.req.query('orgId') ?? '');
    if (!ctx.ok) return c.json({ error: ctx.error, code: ctx.code }, ctx.status);

    const pending = await fetchClerkOrgPendingInvitations(ctx.church.orgId);
    const attribution = await batchAuthorAttribution(ctx.roster.map((m) => m.userId));

    return c.json({
      church: { id: ctx.church.id, name: ctx.church.name, orgId: ctx.church.orgId },
      canManage: isClerkOrgAdminRole(ctx.role),
      viewerRole: ctx.role,
      staffCap: CLERK_ORG_STAFF_CAP,
      seatsUsed: ctx.roster.length + pending.length,
      staff: ctx.roster.map((member) => ({
        userId: member.userId,
        role: member.role,
        isSelf: member.userId === auth.userId,
        displayName: attribution[member.userId]?.displayName ?? 'Staff member',
        profileImageUrl: attribution[member.userId]?.profileImageUrl ?? null,
        userColor: attribution[member.userId]?.userColor ?? 'blue',
      })),
      pendingInvites: pending,
    });
  } catch (error) {
    const clerk = clerkFailureResponse(c, error);
    if (clerk) return clerk;
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/staff',
      action: 'list_church_staff',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/staff/invite ──────────────────────────────────────────
/**
 * Invite one staff member. Pending invites count against the cap — an org at
 * 18 members with 3 outstanding invites is already over 20 once they accept,
 * and Clerk would reject the acceptance rather than the invite.
 */
app.post('/api/church/staff/invite', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      email?: string;
      role?: string;
    };

    const ctx = await resolveStaffContext(auth.userId, body.orgId ?? '');
    if (!ctx.ok) return c.json({ error: ctx.error, code: ctx.code }, ctx.status);
    if (!isClerkOrgAdminRole(ctx.role)) {
      return c.json({ error: 'Only a church admin can invite staff', code: 'CHURCH_ADMIN_REQUIRED' }, 403);
    }
    if (!churchSponsorship(ctx.church).sponsored) {
      return c.json({ error: CHURCH_LAPSED_ERROR, code: CHURCH_LAPSED_CODE }, 402);
    }

    const email = (body.email ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return c.json({ error: 'A valid email address is required', code: 'INVALID_EMAIL' }, 400);
    }

    const pending = await fetchClerkOrgPendingInvitations(ctx.church.orgId);
    if (!canInviteMoreStaff({ memberCount: ctx.roster.length, pendingInviteCount: pending.length })) {
      return c.json(
        {
          error: `Your church has ${ctx.roster.length} staff and ${pending.length} pending invite(s) — the limit is ${CLERK_ORG_STAFF_CAP}. Remove someone first.`,
          code: 'CLERK_ORG_MEMBER_LIMIT',
          seatsUsed: ctx.roster.length + pending.length,
          limit: CLERK_ORG_STAFF_CAP,
        },
        409,
      );
    }

    const invitation = await createClerkOrgInvitation({
      orgId: ctx.church.orgId,
      emailAddress: email,
      inviterUserId: auth.userId,
      // Any role from the allowlist, not just admin — a church hiring a pastor
      // shouldn't have to invite them as staff and then promote them. Undefined
      // lets Clerk apply its own default (plain member = staff).
      role: isAssignableChurchRole(body.role ?? '') ? body.role : undefined,
    });

    return c.json({ success: true, invitation });
  } catch (error) {
    const clerk = clerkFailureResponse(c, error);
    if (clerk) return clerk;
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/staff/invite',
      action: 'invite_church_staff',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/staff/revoke-invite ───────────────────────────────────
app.post('/api/church/staff/revoke-invite', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string; invitationId?: string };

    const ctx = await resolveStaffContext(auth.userId, body.orgId ?? '');
    if (!ctx.ok) return c.json({ error: ctx.error, code: ctx.code }, ctx.status);
    if (!isClerkOrgAdminRole(ctx.role)) {
      return c.json({ error: 'Only a church admin can revoke invites', code: 'CHURCH_ADMIN_REQUIRED' }, 403);
    }

    const invitationId = (body.invitationId ?? '').trim();
    if (!invitationId) {
      return c.json({ error: 'invitationId is required', code: 'BAD_REQUEST' }, 400);
    }

    await revokeClerkOrgInvitation({
      orgId: ctx.church.orgId,
      invitationId,
      requestingUserId: auth.userId,
    });
    return c.json({ success: true });
  } catch (error) {
    const clerk = clerkFailureResponse(c, error);
    if (clerk) return clerk;
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/staff/revoke-invite',
      action: 'revoke_church_invite',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/staff/remove ──────────────────────────────────────────
/**
 * Remove a staff member from the Clerk org, then reconcile Harvous rows so
 * their `leader` access disappears in the same request rather than at the next
 * sync. Self-removal is refused: an admin who removes themselves would lock the
 * church out of its own roster.
 */
app.post('/api/church/staff/remove', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string; userId?: string };

    const ctx = await resolveStaffContext(auth.userId, body.orgId ?? '');
    if (!ctx.ok) return c.json({ error: ctx.error, code: ctx.code }, ctx.status);
    if (!isClerkOrgAdminRole(ctx.role)) {
      return c.json({ error: 'Only a church admin can remove staff', code: 'CHURCH_ADMIN_REQUIRED' }, 403);
    }

    const targetUserId = (body.userId ?? '').trim();
    if (!targetUserId) return c.json({ error: 'userId is required', code: 'BAD_REQUEST' }, 400);
    if (targetUserId === auth.userId) {
      return c.json({ error: 'You cannot remove yourself', code: 'CANNOT_REMOVE_SELF' }, 400);
    }
    if (!ctx.roster.some((member) => member.userId === targetUserId)) {
      return c.json({ error: 'That person is not on your staff', code: 'NOT_STAFF' }, 404);
    }

    await removeClerkOrgMember(ctx.church.orgId, targetUserId);
    // Reconcile immediately; their leader rows are gone before the response.
    const sync = await syncChurchStaffForOrg(ctx.church.orgId);

    return c.json({ success: true, sync });
  } catch (error) {
    const clerk = clerkFailureResponse(c, error);
    if (clerk) return clerk;
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/staff/remove',
      action: 'remove_church_staff',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/staff/role ────────────────────────────────────────────
/**
 * Change a staff member's Clerk org role — the one write that grants or removes
 * the teaching plan and church templates.
 *
 * Gated on the `manage_staff` capability rather than an inline admin check, so
 * the capability that names this act is the thing that authorises it. (Today
 * only `org:admin` derives it, so behaviour is unchanged; the difference shows
 * up the moment a church defines a role that should manage the roster.)
 *
 * Two guardrails, both about not stranding a church:
 *   - You cannot change your own role. Demoting yourself would drop your own
 *     admin rights mid-request, leaving nobody able to undo it.
 *   - You cannot demote the last admin. A church with no admin has no way back
 *     into its own roster without a Harvous operator opening Clerk.
 */
app.post('/api/church/staff/role', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      orgId?: string;
      userId?: string;
      role?: string;
    };

    const ctx = await resolveStaffContext(auth.userId, body.orgId ?? '');
    if (!ctx.ok) return c.json({ error: ctx.error, code: ctx.code }, ctx.status);
    if (!capabilitiesForChurchRole(ctx.role).includes('manage_staff')) {
      return c.json(
        { error: 'Only a church admin can change roles', code: 'CHURCH_ADMIN_REQUIRED' },
        403,
      );
    }

    const targetUserId = (body.userId ?? '').trim();
    const nextRole = (body.role ?? '').trim();
    if (!targetUserId) return c.json({ error: 'userId is required', code: 'BAD_REQUEST' }, 400);
    if (!isAssignableChurchRole(nextRole)) {
      return c.json({ error: 'Unknown role', code: 'BAD_REQUEST' }, 400);
    }
    if (targetUserId === auth.userId) {
      return c.json(
        { error: 'You cannot change your own role', code: 'CANNOT_CHANGE_SELF' },
        400,
      );
    }

    const target = ctx.roster.find((member) => member.userId === targetUserId);
    if (!target) {
      return c.json({ error: 'That person is not on your staff', code: 'NOT_STAFF' }, 404);
    }
    if (target.role === nextRole) return c.json({ success: true, unchanged: true });

    if (target.role === ROLE_ADMIN) {
      const admins = ctx.roster.filter((member) => member.role === ROLE_ADMIN).length;
      if (admins <= 1) {
        return c.json(
          {
            error: 'Your church needs at least one admin',
            code: 'LAST_ADMIN',
          },
          409,
        );
      }
    }

    await updateClerkOrgMemberRole(ctx.church.orgId, targetUserId, nextRole);
    // Reconcile immediately so their channel rows match the new role before the
    // response lands, the way remove does.
    const sync = await syncChurchStaffForOrg(ctx.church.orgId);

    return c.json({ success: true, sync });
  } catch (error) {
    const clerk = clerkFailureResponse(c, error);
    if (clerk) return clerk;
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/staff/role',
      action: 'set_church_staff_role',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/church/staff/sync ────────────────────────────────────────────
/** Manual reconcile — the fallback when the Clerk webhook is missed. */
app.post('/api/church/staff/sync', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = (await c.req.json().catch(() => ({}))) as { orgId?: string };

    const ctx = await resolveStaffContext(auth.userId, body.orgId ?? '');
    if (!ctx.ok) return c.json({ error: ctx.error, code: ctx.code }, ctx.status);

    const result = await syncChurchStaffForOrg(ctx.church.orgId, { staff: ctx.roster });
    if (!result.ok) {
      return c.json(
        {
          error: `Your church has ${result.staffCount} staff — the limit is ${result.limit}.`,
          code: result.code,
          staffCount: result.staffCount,
          limit: result.limit,
        },
        409,
      );
    }
    return c.json({ success: true, ...result });
  } catch (error) {
    const clerk = clerkFailureResponse(c, error);
    if (clerk) return clerk;
    const standardError = handleAPIError(error, {
      endpoint: '/api/church/staff/sync',
      action: 'sync_church_staff_self_serve',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default app;
