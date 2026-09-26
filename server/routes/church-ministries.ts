/**
 * Ministries — create, arrange, and scope them (docs/CHURCH_V2_ROADMAP.md §C).
 *
 * Every write is `manage_staff` and sponsorship-gated: putting a space in a ministry, or a staffer
 * in one, changes who leads what. Any staff member may read. Each write that moves leadership runs
 * a targeted staff sync and reports whether it landed; a failed sync leaves the saved change in
 * place and the hub's Sync button to finish it.
 *
 * Endpoints:
 *   GET  /api/church/ministries?orgId=
 *   POST /api/church/ministries/create        { orgId, name, description? }
 *   POST /api/church/ministries/update        { orgId, ministryId, name?, description?, sortOrder? }
 *   POST /api/church/ministries/archive       { orgId, ministryId, releaseSpaces? }
 *   POST /api/church/ministries/restore       { orgId, ministryId }
 *   POST /api/church/ministries/assign-space  { orgId, spaceId, ministryId | null, movePair? }
 *   POST /api/church/ministries/set-staff     { orgId, userId, ministryIds[] }  — [] = church-wide
 *   POST /api/church/ministries/set-channel-audience { orgId, spaceId, audience, dryRun? }
 */

import { Hono } from 'hono';
import {
  db,
  first,
  ChurchMinistries,
  ChurchMinistryStaff,
  ChurchSpaceChannelLinks,
  Spaces,
  and,
  eq,
  inArray,
  isNull,
  or,
} from '../db';
import { nowISO } from '../db/dates';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { isUniqueViolation } from '../utils/db-unique-violation';
import { resolveChurchOrgAccess, type ChurchOrgAccessRule } from '../utils/church-org-access';
import { fetchClerkOrgMemberships } from '../utils/clerk-org';
import { isMinistryScopableRole } from '../utils/church-role-capabilities';
import { syncChurchStaffForOrg } from '../utils/church-staff-sync';
import {
  MINISTRY_DESCRIPTION_MAX,
  cleanMinistryName,
  listMinistriesForOrg,
  planArchiveMinistry,
  planAssignSpace,
  spacesInMinistry,
} from '../utils/church-ministries';
import {
  isChannelAudience,
  reconcileChannelAudience,
  reconcileOrgChannelAudiences,
} from '../utils/church-channel-audience';

const app = new Hono();

const READ: ChurchOrgAccessRule = {
  capability: 'publish',
  code: 'CHURCH_MINISTRIES_FORBIDDEN',
  staffError: 'Only church staff can see ministries',
  roleError: 'Your role does not include ministries',
  sponsorshipGated: false,
};
const WRITE: ChurchOrgAccessRule = {
  capability: 'manage_staff',
  code: 'CHURCH_MINISTRIES_ROLE_REQUIRED',
  staffError: 'Only church staff can change ministries',
  roleError: 'A church admin arranges ministries',
  sponsorshipGated: true,
};

/* Who may see a channel is privacy, not a paid feature: a lapsed church can still narrow a
   channel (or open it back up) — the same reasoning as revoking a join link. */
const AUDIENCE: ChurchOrgAccessRule = { ...WRITE, sponsorshipGated: false };

type Body = Record<string, unknown>;
const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<Body> {
  const body = await c.req.json().catch(() => ({}));
  return body && typeof body === 'object' ? (body as Body) : {};
}

function cleanDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, MINISTRY_DESCRIPTION_MAX) : null;
}

/** Sync after a leadership change; report, never fail the saved change on it. */
async function syncAfter(orgId: string, spaceIds?: string[]) {
  try {
    const result = await syncChurchStaffForOrg(orgId, spaceIds ? { spaceIds } : undefined);
    return { ok: result.ok };
  } catch (error) {
    console.warn('[church-ministries] sync after change failed', error);
    return { ok: false };
  }
}

async function payload(orgId: string, canManage: boolean) {
  const [ministries, spaces, staff] = await Promise.all([
    listMinistriesForOrg(orgId),
    db
      .select({
        id: Spaces.id,
        title: Spaces.title,
        type: Spaces.type,
        color: Spaces.color,
        ministryId: Spaces.ministryId,
        audience: Spaces.audience,
      })
      .from(Spaces)
      .where(and(eq(Spaces.orgId, orgId), isNull(Spaces.deletedAt))),
    db
      .select({ userId: ChurchMinistryStaff.userId, ministryId: ChurchMinistryStaff.ministryId })
      .from(ChurchMinistryStaff)
      .where(eq(ChurchMinistryStaff.orgId, orgId)),
  ]);
  const live = new Set(ministries.filter((m) => !m.archivedAt).map((m) => m.id));
  const serializeSpace = (s: (typeof spaces)[number]) => ({
    id: s.id,
    title: s.title,
    kind: s.type === 'public' ? ('channel' as const) : ('group' as const),
    color: s.color,
    audience: s.audience,
  });
  return {
    canManage,
    ministries: ministries.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      sortOrder: m.sortOrder,
      archivedAt: m.archivedAt,
      spaces: spaces.filter((s) => s.ministryId === m.id).map(serializeSpace),
      staffUserIds: staff.filter((row) => row.ministryId === m.id).map((row) => row.userId),
    })),
    // A space whose ministry is gone or archived reads as church-wide.
    unassignedSpaces: spaces.filter((s) => !s.ministryId || !live.has(s.ministryId)).map(serializeSpace),
  };
}

async function loadMinistry(orgId: string, ministryId: string) {
  if (!ministryId) return null;
  return (
    first(
      await db
        .select()
        .from(ChurchMinistries)
        .where(and(eq(ChurchMinistries.id, ministryId), eq(ChurchMinistries.orgId, orgId)))
        .limit(1),
    ) ?? null
  );
}

// ─── GET /api/church/ministries ─────────────────────────────────────────────

app.get('/api/church/ministries', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const orgId = str(c.req.query('orgId'));
    const gate = await resolveChurchOrgAccess(auth.userId, orgId, READ);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    // Not sponsorship-gated: a lapsed church's admin still sees the controls.
    const manage = await resolveChurchOrgAccess(auth.userId, orgId, { ...WRITE, sponsorshipGated: false });
    c.header('Cache-Control', 'private, max-age=0, no-store');
    return c.json(await payload(gate.church.orgId, manage.ok));
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/ministries', action: 'church_ministries' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/ministries/create | update ────────────────────────────

app.post('/api/church/ministries/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(body.orgId), WRITE);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const name = cleanMinistryName(body.name);
    if (!name) return c.json({ error: 'Give the ministry a short name', code: 'MINISTRY_NAME_INVALID' }, 400);

    const existing = await listMinistriesForOrg(gate.church.orgId);
    try {
      await db.insert(ChurchMinistries).values({
        id: `min_${crypto.randomUUID()}`,
        orgId: gate.church.orgId,
        name,
        description: cleanDescription(body.description),
        sortOrder: existing.filter((m) => !m.archivedAt).length,
        createdByUserId: auth.userId,
        createdAt: nowISO(),
      });
    } catch (error) {
      if (isUniqueViolation(error, 'ChurchMinistries_org_name_live_unique')) {
        return c.json({ error: 'A ministry already has that name', code: 'MINISTRY_NAME_TAKEN' }, 409);
      }
      throw error;
    }
    return c.json({ success: true, ...(await payload(gate.church.orgId, true)) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/ministries/create', action: 'church_ministry_create' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/church/ministries/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(body.orgId), WRITE);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const ministry = await loadMinistry(gate.church.orgId, str(body.ministryId));
    if (!ministry) return c.json({ error: 'Ministry not found', code: 'NOT_FOUND' }, 404);

    const set: Partial<typeof ChurchMinistries.$inferInsert> = { updatedAt: nowISO() };
    if (body.name !== undefined) {
      const name = cleanMinistryName(body.name);
      if (!name) return c.json({ error: 'Give the ministry a short name', code: 'MINISTRY_NAME_INVALID' }, 400);
      set.name = name;
    }
    if (body.description !== undefined) set.description = cleanDescription(body.description);
    if (typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder)) set.sortOrder = body.sortOrder;
    try {
      await db.update(ChurchMinistries).set(set).where(eq(ChurchMinistries.id, ministry.id));
    } catch (error) {
      if (isUniqueViolation(error, 'ChurchMinistries_org_name_live_unique')) {
        return c.json({ error: 'A ministry already has that name', code: 'MINISTRY_NAME_TAKEN' }, 409);
      }
      throw error;
    }
    return c.json({ success: true, ...(await payload(gate.church.orgId, true)) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/ministries/update', action: 'church_ministry_update' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/ministries/archive | restore ──────────────────────────

app.post('/api/church/ministries/archive', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(body.orgId), WRITE);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const ministry = await loadMinistry(gate.church.orgId, str(body.ministryId));
    if (!ministry || ministry.archivedAt) return c.json({ error: 'Ministry not found', code: 'NOT_FOUND' }, 404);

    const spaces = await spacesInMinistry(ministry.id);
    const plan = planArchiveMinistry({ spaces, releaseSpaces: body.releaseSpaces === true });
    if (plan.action === 'refuse') return c.json({ error: plan.error, code: plan.code }, 409);

    const now = nowISO();
    await db.transaction(async (tx) => {
      if (plan.releaseSpaceIds.length) {
        await tx.update(Spaces).set({ ministryId: null }).where(inArray(Spaces.id, plan.releaseSpaceIds));
      }
      // Its staff rows stay: a teacher scoped only here now leads nothing, which fails closed.
      await tx.update(ChurchMinistries).set({ archivedAt: now, updatedAt: now }).where(eq(ChurchMinistries.id, ministry.id));
    });
    const sync = await syncAfter(gate.church.orgId);
    return c.json({ success: true, sync, ...(await payload(gate.church.orgId, true)) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/ministries/archive', action: 'church_ministry_archive' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/church/ministries/restore', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(body.orgId), WRITE);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const ministry = await loadMinistry(gate.church.orgId, str(body.ministryId));
    if (!ministry || !ministry.archivedAt) return c.json({ error: 'Ministry not found', code: 'NOT_FOUND' }, 404);
    try {
      await db.update(ChurchMinistries).set({ archivedAt: null, updatedAt: nowISO() }).where(eq(ChurchMinistries.id, ministry.id));
    } catch (error) {
      if (isUniqueViolation(error, 'ChurchMinistries_org_name_live_unique')) {
        return c.json({ error: 'Another ministry has that name now', code: 'MINISTRY_NAME_TAKEN' }, 409);
      }
      throw error;
    }
    const sync = await syncAfter(gate.church.orgId);
    return c.json({ success: true, sync, ...(await payload(gate.church.orgId, true)) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/ministries/restore', action: 'church_ministry_restore' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/ministries/assign-space ───────────────────────────────

app.post('/api/church/ministries/assign-space', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(body.orgId), WRITE);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const orgId = gate.church.orgId;

    const space = first(
      await db
        .select({ id: Spaces.id, orgId: Spaces.orgId, type: Spaces.type, audience: Spaces.audience, deletedAt: Spaces.deletedAt })
        .from(Spaces)
        .where(eq(Spaces.id, str(body.spaceId)))
        .limit(1),
    );
    if (!space || space.deletedAt || space.orgId !== orgId || space.type === 'personal') {
      return c.json({ error: 'Space not found', code: 'NOT_FOUND' }, 404);
    }
    const targetMinistryId = str(body.ministryId) || null;
    if (targetMinistryId) {
      const ministry = await loadMinistry(orgId, targetMinistryId);
      if (!ministry || ministry.archivedAt) return c.json({ error: 'Ministry not found', code: 'NOT_FOUND' }, 404);
    }

    // The channel or group this one is paired with, from either side of the link.
    const link = first(
      await db
        .select({ spaceId: ChurchSpaceChannelLinks.spaceId, channelSpaceId: ChurchSpaceChannelLinks.channelSpaceId })
        .from(ChurchSpaceChannelLinks)
        .where(
          and(
            eq(ChurchSpaceChannelLinks.orgId, orgId),
            or(eq(ChurchSpaceChannelLinks.spaceId, space.id), eq(ChurchSpaceChannelLinks.channelSpaceId, space.id)),
          ),
        )
        .limit(1),
    );
    const pairedId = link ? (link.spaceId === space.id ? link.channelSpaceId : link.spaceId) : null;
    const paired = pairedId
      ? first(
          await db
            .select({ id: Spaces.id, ministryId: Spaces.ministryId, audience: Spaces.audience, deletedAt: Spaces.deletedAt })
            .from(Spaces)
            .where(eq(Spaces.id, pairedId))
            .limit(1),
        )
      : undefined;

    const plan = planAssignSpace({
      space,
      pairedSpace: paired && !paired.deletedAt ? paired : null,
      targetMinistryId,
      movePair: body.movePair === true,
    });
    if (plan.action === 'refuse') return c.json({ error: plan.error, code: plan.code }, 409);

    await db.update(Spaces).set({ ministryId: targetMinistryId }).where(inArray(Spaces.id, plan.spaceIds));
    /* A group moving changes who is in its old and new ministry, and a restricted channel moving
       changes which ministry its audience is — either way, re-check the church's restricted follows. */
    await reconcileOrgChannelAudiences(orgId);
    const sync = await syncAfter(orgId, plan.spaceIds);
    return c.json({ success: true, sync, ...(await payload(orgId, true)) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/ministries/assign-space', action: 'church_ministry_assign' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/ministries/set-staff ──────────────────────────────────

app.post('/api/church/ministries/set-staff', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(body.orgId), WRITE);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const orgId = gate.church.orgId;
    const userId = str(body.userId);

    const roster = await fetchClerkOrgMemberships(orgId);
    const member = roster.find((m) => m.userId === userId);
    if (!member) return c.json({ error: 'Not on your team', code: 'NOT_STAFF' }, 404);

    const requested = Array.isArray(body.ministryIds)
      ? [...new Set(body.ministryIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
      : [];
    if (requested.length && !isMinistryScopableRole(member.role)) {
      return c.json(
        { error: 'Admins, pastors and coordinators lead the whole church', code: 'ROLE_IS_CHURCH_WIDE' },
        409,
      );
    }
    const live = new Set((await listMinistriesForOrg(orgId)).filter((m) => !m.archivedAt).map((m) => m.id));
    if (requested.some((id) => !live.has(id))) return c.json({ error: 'Ministry not found', code: 'NOT_FOUND' }, 404);

    // Replace their whole set: [] means church-wide again.
    const now = nowISO();
    await db.transaction(async (tx) => {
      await tx
        .delete(ChurchMinistryStaff)
        .where(and(eq(ChurchMinistryStaff.orgId, orgId), eq(ChurchMinistryStaff.userId, userId)));
      if (requested.length) {
        await tx.insert(ChurchMinistryStaff).values(
          requested.map((ministryId) => ({
            id: `mstf_${crypto.randomUUID()}`,
            orgId,
            ministryId,
            userId,
            createdByUserId: auth.userId,
            createdAt: now,
          })),
        );
      }
    });
    const sync = await syncAfter(orgId);
    return c.json({ success: true, sync, ...(await payload(orgId, true)) });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/church/ministries/set-staff', action: 'church_ministry_staff' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/church/ministries/set-channel-audience ────────────────────────
/**
 * Who may follow a channel: the whole church, its ministry, or its ministry's group leaders.
 * Narrowing removes the follows of everyone outside — `dryRun` answers "how many" first so the
 * editor can say so before anyone confirms. A count, never who.
 */
app.post('/api/church/ministries/set-channel-audience', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const body = await readBody(c);
    const gate = await resolveChurchOrgAccess(auth.userId, str(body.orgId), AUDIENCE);
    if (!gate.ok) return c.json({ error: gate.error, code: gate.code }, gate.status);
    const orgId = gate.church.orgId;

    const audience = body.audience;
    if (!isChannelAudience(audience)) {
      return c.json({ error: 'Choose church, ministry or leaders', code: 'INVALID_AUDIENCE' }, 400);
    }
    const space = first(
      await db
        .select({ id: Spaces.id, orgId: Spaces.orgId, type: Spaces.type, ministryId: Spaces.ministryId, deletedAt: Spaces.deletedAt })
        .from(Spaces)
        .where(eq(Spaces.id, str(body.spaceId)))
        .limit(1),
    );
    if (!space || space.deletedAt || space.orgId !== orgId || space.type !== 'public') {
      return c.json({ error: 'Channel not found', code: 'NOT_FOUND' }, 404);
    }
    if (audience !== 'church') {
      const ministry = space.ministryId ? await loadMinistry(orgId, space.ministryId) : null;
      if (!ministry || ministry.archivedAt) {
        return c.json(
          { error: 'Put this channel in a ministry before restricting it', code: 'AUDIENCE_REQUIRES_MINISTRY' },
          409,
        );
      }
    }

    const channel = { id: space.id, audience, ministryId: space.ministryId };
    if (body.dryRun === true) {
      return c.json({ success: true, affectedFollowCount: await reconcileChannelAudience(orgId, [channel], { dryRun: true }) });
    }
    await db.update(Spaces).set({ audience }).where(eq(Spaces.id, space.id));
    const affectedFollowCount = await reconcileChannelAudience(orgId, [channel]);
    return c.json({ success: true, affectedFollowCount, ...(await payload(orgId, true)) });
  } catch (error) {
    const e = handleAPIError(error, {
      endpoint: '/api/church/ministries/set-channel-audience',
      action: 'church_channel_audience',
    });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
