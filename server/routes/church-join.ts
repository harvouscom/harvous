/**
 * Church join links — the link and QR a church hands its congregation.
 *
 * Kept out of `church.ts` for the reason church-settings.ts gives: that file's
 * contract tests slice its source to prove the congregant half never accepts an
 * `orgId` from the request. The staff half here needs one.
 *
 * Endpoints:
 *   GET  /api/church/join-link?orgId=          — any staff; never sponsorship-gated
 *   POST /api/church/join-link/create          — admin; idempotent
 *   POST /api/church/join-link/rotate          — admin; revoke + insert in one transaction
 *   POST /api/church/join-link/revoke          — admin; never sponsorship-gated
 *   GET  /api/church/join-preview/:token       — public; what the join page shows
 *   POST /api/church/join/:token/redeem        — signed in; connect, then follow
 *
 * What a visitor may learn from a token: the church's name and place and its
 * channel titles — what the church put on the card it handed them. Never member
 * counts, never whether the church is paid up.
 */

import { Hono } from 'hono';
import { db, first, ChurchJoinLinks, UserMetadata, SpaceMemberships, and, eq, inArray, isNull, sql } from '../db';
import { nowISO } from '../db/dates';
import { getAuth, getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { getPublicAppOrigin } from '../utils/public-app-origin';
import { isUniqueViolation } from '../utils/db-unique-violation';
import { churchIsSponsored } from '../utils/church-entitlement';
import { getActiveChurchByOrgId } from '../utils/church-staff';
import { followMinistryChannel } from '../utils/ministry-channel-follow';
import { connectUserToChurch } from '../utils/church-selection-write';
import { listMinistriesForOrg } from '../utils/church-ministries';
import { isPgUndefinedRelation } from '../utils/pg-undefined-relation';
import {
  assertCanManageChurchJoinLink,
  assertCanRevokeChurchJoinLink,
  assertCanViewChurchJoinLink,
  churchJoinUrl,
  findLiveJoinLink,
  followableChannelsForChurch,
  generateChurchJoinToken,
  pickChannelsToFollow,
  planJoinRedeem,
  renderChurchJoinQrSvg,
  resolveJoinLinkToken,
  totalJoinedViaLinks,
  viewerChurchConnection,
  type ChurchJoinLinkRow,
} from '../utils/church-join-link';

const app = new Hono();

type GateFailure = { ok: false; status: 402 | 403 | 404 | 409; code: string; error: string };

function gateResponse(gate: GateFailure) {
  return { body: { error: gate.error, code: gate.code }, status: gate.status };
}

async function readOrgId(c: { req: { json: () => Promise<unknown> } }): Promise<string> {
  const body = (await c.req.json().catch(() => ({}))) as { orgId?: unknown };
  return typeof body.orgId === 'string' ? body.orgId.trim() : '';
}

function serializeLink(link: ChurchJoinLinkRow | null, origin: string) {
  if (!link) return null;
  return {
    url: churchJoinUrl(origin, link.token),
    token: link.token,
    useCount: link.useCount,
    createdAt: link.createdAt,
  };
}

async function staffPayload(
  churchId: string,
  link: ChurchJoinLinkRow | null,
  origin: string,
  canManage: boolean,
) {
  const serialized = serializeLink(link, origin);
  return {
    link: serialized,
    totalJoined: await totalJoinedViaLinks(churchId),
    qrSvg: serialized ? renderChurchJoinQrSvg(serialized.url) : null,
    canManage,
  };
}

/** Insert a fresh live link, or return the one a concurrent request just made. */
async function insertLiveLink(churchId: string, userId: string): Promise<ChurchJoinLinkRow> {
  try {
    const inserted = first(
      await db
        .insert(ChurchJoinLinks)
        .values({
          id: `cjl_${crypto.randomUUID()}`,
          churchId,
          token: generateChurchJoinToken(),
          createdBy: userId,
          useCount: 0,
          createdAt: nowISO(),
        })
        .returning(),
    );
    if (inserted) return inserted;
  } catch (error) {
    if (!isUniqueViolation(error, 'ChurchJoinLinks_church_live_unique')) throw error;
  }
  const live = await findLiveJoinLink(churchId);
  if (!live) throw new Error('Join link insert raced and left no live link');
  return live;
}

// ─── GET /api/church/join-link ──────────────────────────────────────────────

app.get('/api/church/join-link', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = (c.req.query('orgId') ?? '').trim();
    const gate = await assertCanViewChurchJoinLink(auth.userId, orgId);
    if (!gate.ok) {
      const { body, status } = gateResponse(gate);
      return c.json(body, status);
    }

    // The not-sponsorship-gated manage check: a lapsed church's admin still sees
    // their own controls (revoke must always work), and the create button then
    // explains the lapse rather than vanishing.
    const canManage = (await assertCanRevokeChurchJoinLink(auth.userId, orgId)).ok;
    const link = await findLiveJoinLink(gate.church.id);
    c.header('Cache-Control', 'private, max-age=0, no-store');
    return c.json(await staffPayload(gate.church.id, link, getPublicAppOrigin(c), canManage));
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/join-link', action: 'get_church_join_link' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/join-link/create ──────────────────────────────────────

app.post('/api/church/join-link/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = await readOrgId(c);
    const gate = await assertCanManageChurchJoinLink(auth.userId, orgId);
    if (!gate.ok) {
      const { body, status } = gateResponse(gate);
      return c.json(body, status);
    }

    // Idempotent: a second press, or a second admin, gets the link that exists.
    const link = (await findLiveJoinLink(gate.church.id)) ?? (await insertLiveLink(gate.church.id, auth.userId));
    return c.json(await staffPayload(gate.church.id, link, getPublicAppOrigin(c), true));
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/join-link/create', action: 'create_church_join_link' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/join-link/rotate ──────────────────────────────────────

app.post('/api/church/join-link/rotate', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = await readOrgId(c);
    const gate = await assertCanManageChurchJoinLink(auth.userId, orgId);
    if (!gate.ok) {
      const { body, status } = gateResponse(gate);
      return c.json(body, status);
    }

    // One transaction, so there is never a moment with two live links (the partial
    // unique index would refuse it) or with none (a scan in that gap would 410).
    const now = nowISO();
    const link = await db.transaction(async (tx) => {
      await tx
        .update(ChurchJoinLinks)
        .set({ revokedAt: now, revokedReason: 'rotated' })
        .where(and(eq(ChurchJoinLinks.churchId, gate.church.id), isNull(ChurchJoinLinks.revokedAt)));
      return first(
        await tx
          .insert(ChurchJoinLinks)
          .values({
            id: `cjl_${crypto.randomUUID()}`,
            churchId: gate.church.id,
            token: generateChurchJoinToken(),
            createdBy: auth.userId,
            useCount: 0,
            createdAt: now,
          })
          .returning(),
      );
    });
    return c.json(await staffPayload(gate.church.id, link ?? null, getPublicAppOrigin(c), true));
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/join-link/rotate', action: 'rotate_church_join_link' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/join-link/revoke ──────────────────────────────────────

app.post('/api/church/join-link/revoke', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = await readOrgId(c);
    // Never sponsorship-gated: stopping a leaked link must work for a lapsed church.
    const gate = await assertCanRevokeChurchJoinLink(auth.userId, orgId);
    if (!gate.ok) {
      const { body, status } = gateResponse(gate);
      return c.json(body, status);
    }

    await db
      .update(ChurchJoinLinks)
      .set({ revokedAt: nowISO(), revokedReason: 'revoked' })
      .where(and(eq(ChurchJoinLinks.churchId, gate.church.id), isNull(ChurchJoinLinks.revokedAt)));
    return c.json(await staffPayload(gate.church.id, null, getPublicAppOrigin(c), true));
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/join-link/revoke', action: 'revoke_church_join_link' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/church/join-preview/:token ────────────────────────────────────
/** Public (no auth required). Rate-limited by IP; never cached. */
app.get('/api/church/join-preview/:token', rateLimit('read'), async (c) => {
  try {
    c.header('Cache-Control', 'private, max-age=0, no-store');
    const resolved = await resolveJoinLinkToken(requireParam(c, 'token'));
    if (!resolved.ok) return c.json({ error: resolved.error, code: resolved.code }, resolved.status);
    const { church } = resolved;

    const channels = await followableChannelsForChurch(church.orgId);
    // Headings for the page: live ministries that have a channel to offer, in the church's order.
    const ministries = (
      await listMinistriesForOrg(church.orgId).catch((error) => {
        if (isPgUndefinedRelation(error, 'ChurchMinistries')) return [];
        throw error;
      })
    )
      .filter((m) => !m.archivedAt && channels.some((channel) => channel.ministryId === m.id))
      .map((m) => ({ id: m.id, name: m.name }));
    const liveMinistryIds = new Set(ministries.map((m) => m.id));

    // Viewer state (optional auth) — only ever the viewer's own facts.
    const auth = getAuth(c);
    let connection: 'here' | 'elsewhere' | 'none' = 'none';
    let elsewhereName: string | null = null;
    let followingIds: string[] = [];
    let leadingIds: string[] = [];
    if (auth.userId) {
      const meta = first(
        await db
          .select({ connectedChurchId: UserMetadata.connectedChurchId, churchName: UserMetadata.churchName })
          .from(UserMetadata)
          .where(eq(UserMetadata.userId, auth.userId))
          .limit(1),
      );
      connection = viewerChurchConnection(meta?.connectedChurchId, church.id);
      elsewhereName = connection === 'elsewhere' ? meta?.churchName ?? null : null;
      if (channels.length > 0) {
        const rows = await db
          .select({ spaceId: SpaceMemberships.spaceId, role: SpaceMemberships.role })
          .from(SpaceMemberships)
          .where(
            and(
              eq(SpaceMemberships.userId, auth.userId),
              inArray(
                SpaceMemberships.spaceId,
                channels.map((channel) => channel.id),
              ),
            ),
          );
        // A follow is a `member` row; staff hold owner/leader rows on the same channels
        // and are told they lead it, not that they follow it.
        followingIds = rows.filter((row) => row.role === 'member').map((row) => row.spaceId);
        leadingIds = rows.filter((row) => row.role === 'owner' || row.role === 'leader').map((row) => row.spaceId);
      }
    }

    return c.json({
      church: { name: church.name, city: church.city, state: church.state },
      ministries,
      channels: channels.map(({ id, title, description, color, ministryId }) => ({
        id,
        title,
        description,
        color,
        ministryId: ministryId && liveMinistryIds.has(ministryId) ? ministryId : null,
      })),
      viewer: { signedIn: Boolean(auth.userId), connection, elsewhereName, followingIds, leadingIds },
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/join-preview/[token]', action: 'church_join_preview' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/join/:token/redeem ────────────────────────────────────

app.post('/api/church/join/:token/redeem', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const resolved = await resolveJoinLinkToken(requireParam(c, 'token'));
    if (!resolved.ok) return c.json({ error: resolved.error, code: resolved.code }, resolved.status);
    const { link, church } = resolved;

    const body = (await c.req.json().catch(() => ({}))) as { channelIds?: unknown; confirmSwitch?: unknown };
    const meta = first(
      await db
        .select({ connectedChurchId: UserMetadata.connectedChurchId, churchName: UserMetadata.churchName })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, auth.userId))
        .limit(1),
    );

    const plan = planJoinRedeem({
      viewerConnectedChurchId: meta?.connectedChurchId,
      churchId: church.id,
      confirmSwitch: body.confirmSwitch === true,
    });
    if (plan.action === 'confirm_switch') {
      return c.json(
        {
          error: 'You are connected to another church. Switching drops that church’s channels.',
          code: 'CHURCH_SWITCH_CONFIRM_REQUIRED',
          currentChurchName: meta?.churchName ?? null,
        },
        409,
      );
    }

    let newlyConnected = false;
    if (plan.action === 'connect') {
      const result = await connectUserToChurch(auth.userId, church);
      newlyConnected = !result.alreadyConnected;
    }
    if (newlyConnected) {
      // A count for the church — never a list of who. Only a genuinely new
      // connection counts, so a second scan by the same person does not.
      await db
        .update(ChurchJoinLinks)
        .set({ useCount: sql`${ChurchJoinLinks.useCount} + 1` })
        .where(eq(ChurchJoinLinks.id, link.id));
    }

    // Follows: only channels the link offers, and only while the church is
    // sponsored — the same rule as the follow route. A lapsed church still connects
    // (as Settings does); the page says why nothing was followed.
    const offered = await followableChannelsForChurch(church.orgId);
    const wanted = pickChannelsToFollow(body.channelIds, offered);
    const sponsored = churchIsSponsored(church);
    const followed: string[] = [];
    if (sponsored) {
      for (const spaceId of wanted) {
        const result = await followMinistryChannel(auth.userId, spaceId);
        if (result.followed || result.reason === 'already_member') followed.push(spaceId);
      }
    }

    // Re-read so the response carries the church exactly as it stands.
    const current = (await getActiveChurchByOrgId(church.orgId)) ?? church;
    const connected = first(
      await db
        .select({
          hmcChurchId: UserMetadata.hmcChurchId,
          churchName: UserMetadata.churchName,
          churchCity: UserMetadata.churchCity,
          churchState: UserMetadata.churchState,
          churchCountry: UserMetadata.churchCountry,
          connectedChurchId: UserMetadata.connectedChurchId,
          connectedOrgId: UserMetadata.connectedOrgId,
          connectedChurchAt: UserMetadata.connectedChurchAt,
        })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, auth.userId))
        .limit(1),
    );
    return c.json({
      success: true,
      church: { id: current.id, name: current.name, orgId: current.orgId },
      // The viewer's own church fields as now saved — the same shape update-church
      // returns, so the client patches its cached profile the same way.
      connection: connected ?? null,
      alreadyConnected: plan.action === 'already_connected',
      followed,
      followsSkipped: !sponsored && wanted.length > 0,
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/join/[token]/redeem', action: 'redeem_church_join_link' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
