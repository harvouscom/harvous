/**
 * Admin › Families — support's view of a family and the overrides for when something is
 * abused or simply not working. See docs/future/FAMILY_ACCOUNTS.md, "Support".
 *
 *   GET  /api/admin/families?q=                       — find by email, user id or family id
 *   GET  /api/admin/families/:familyId                — members, coverage, invites, requests, history
 *   POST /api/admin/families/:familyId/role           — {userId, role, reason}
 *   POST /api/admin/families/:familyId/requests/:id   — {decision, reason}
 *   POST /api/admin/families/:familyId/remove         — {userId, reason}
 *   POST /api/admin/families/:familyId/invites/:id/revoke — {reason}
 *   POST /api/admin/families/:familyId/stop           — {reason}  (stop family sharing)
 *   POST /api/admin/families/:familyId/freeze         — {frozen, reason}
 *   POST /api/admin/families/:familyId/transfer       — {userId, reason}
 *
 * Every write needs a reason and lands in FamilyEvents as a support action, so the family
 * sees "Changed by Harvous support" and the next person on the case sees why. Support may
 * do what members can't (move someone *into* the child role, decide while frozen) — that is
 * the point of an override — but never reads anyone's notes: this surface has no route to them.
 */

import { Hono, type Context } from 'hono';
import {
  db,
  first,
  Families,
  FamilyEvents,
  FamilyInvites,
  FamilyMembers,
  FamilyRoleRequests,
  SpaceMemberships,
  Spaces,
  UserMetadata,
  and,
  desc,
  eq,
  sql,
  inArray,
  isNull,
  or,
} from '../db';
import { nowISO } from '../db/dates';
import { getAuth } from '../middleware/auth';
import { requireHarvousAdmin } from '../utils/harvous-admin';
import { handleAPIError } from '@/utils/error-handling';
import { broadcastInvalidation } from '../utils/realtime';
import { removeMemberPreservingResponses, safeMemberDisplayName } from '../utils/shared-space-lifecycle';
import {
  coveredMemberIds,
  reconcileFamilyCoverage,
  reconcileFamilyCoverageForUser,
  sponsorFeatureKeys,
} from '../utils/family-entitlements';
import {
  applyRoleChange,
  closePendingRequests,
  dissolveFamily,
  recordFamilyEvent,
  upsertSpaceRole,
} from '../utils/family-lifecycle';
import { isFamilyRole } from '@/lib/family-roles';

const app = new Hono();

const REASON_MAX = 500;

/** Who is acting. An admin using the shared secret has no user id; say so in the record. */
function adminId(c: Context): string {
  return getAuth(c).userId ?? 'admin_secret';
}

async function readReason(c: Context): Promise<{ body: Record<string, unknown>; reason: string | null }> {
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, REASON_MAX) : '';
  return { body, reason: reason || null };
}

const NEED_REASON = { error: 'Say why — it goes in the family’s history.', code: 'REASON_REQUIRED' } as const;

async function loadFamily(familyId: string) {
  return first(await db.select().from(Families).where(eq(Families.id, familyId)).limit(1)) ?? null;
}

function broadcastFamily(userIds: Iterable<string>, spaceId: string) {
  for (const userId of new Set(userIds)) broadcastInvalidation(userId, { type: 'space:updated', id: spaceId });
}

async function memberIdsOf(familyId: string): Promise<string[]> {
  const rows = await db.select({ userId: FamilyMembers.userId }).from(FamilyMembers).where(eq(FamilyMembers.familyId, familyId));
  return rows.map((r) => r.userId);
}

// ─── Find ────────────────────────────────────────────────────────────────────

app.get('/api/admin/families', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const q = (c.req.query('q') ?? '').trim();
    let familyIds: string[] = [];
    if (q.startsWith('fam_')) {
      familyIds = [q];
    } else if (q) {
      const users = await db
        .select({ userId: UserMetadata.userId })
        .from(UserMetadata)
        .where(or(eq(UserMetadata.userId, q), sql`lower(${UserMetadata.email}) = ${q.toLowerCase()}`))
        .limit(20);
      const ids = users.map((u) => u.userId);
      if (ids.length) {
        const rows = await db.select({ familyId: FamilyMembers.familyId }).from(FamilyMembers).where(inArray(FamilyMembers.userId, ids));
        familyIds = rows.map((r) => r.familyId);
      }
    } else {
      // No query: the most recently active families — open requests and frozen ones first.
      const rows = await db.select({ id: Families.id }).from(Families).orderBy(desc(Families.updatedAt)).limit(25);
      familyIds = rows.map((r) => r.id);
    }
    if (familyIds.length === 0) return c.json({ families: [] });

    const [families, members, pending] = await Promise.all([
      db.select().from(Families).where(inArray(Families.id, familyIds)),
      db.select({ familyId: FamilyMembers.familyId }).from(FamilyMembers).where(inArray(FamilyMembers.familyId, familyIds)),
      db
        .select({ familyId: FamilyRoleRequests.familyId, escalatedAt: FamilyRoleRequests.escalatedAt })
        .from(FamilyRoleRequests)
        .where(and(inArray(FamilyRoleRequests.familyId, familyIds), eq(FamilyRoleRequests.status, 'pending'))),
    ]);
    const spaces = await db
      .select({ id: Spaces.id, title: Spaces.title })
      .from(Spaces)
      .where(inArray(Spaces.id, families.map((f) => f.spaceId)));
    const titleOf = new Map(spaces.map((s) => [s.id, s.title]));
    return c.json({
      families: families
        .map((f) => ({
          id: f.id,
          name: titleOf.get(f.spaceId) ?? '(no space)',
          ownerUserId: f.ownerUserId,
          members: members.filter((m) => m.familyId === f.id).length,
          pendingRequests: pending.filter((p) => p.familyId === f.id).length,
          escalated: pending.some((p) => p.familyId === f.id && p.escalatedAt),
          frozen: Boolean(f.frozenAt),
          createdAt: f.createdAt,
        }))
        .sort((a, b) => Number(b.escalated) - Number(a.escalated) || Number(b.frozen) - Number(a.frozen)),
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families', action: 'admin_families_list' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── One family ──────────────────────────────────────────────────────────────

app.get('/api/admin/families/:familyId', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const family = await loadFamily(c.req.param('familyId'));
    if (!family) return c.json({ error: 'Family not found', code: 'NOT_FOUND' }, 404);
    const [space, members, invites, requests, events, covered, sponsorKeys] = await Promise.all([
      db.select({ title: Spaces.title, deletedAt: Spaces.deletedAt }).from(Spaces).where(eq(Spaces.id, family.spaceId)).limit(1).then(first),
      db
        .select({
          userId: FamilyMembers.userId,
          role: FamilyMembers.role,
          joinedAt: FamilyMembers.joinedAt,
          roleChangedAt: FamilyMembers.roleChangedAt,
          roleChangedBy: FamilyMembers.roleChangedBy,
          firstName: UserMetadata.firstName,
          lastName: UserMetadata.lastName,
          email: UserMetadata.email,
        })
        .from(FamilyMembers)
        .leftJoin(UserMetadata, eq(UserMetadata.userId, FamilyMembers.userId))
        .where(eq(FamilyMembers.familyId, family.id)),
      db
        .select()
        .from(FamilyInvites)
        .where(and(eq(FamilyInvites.familyId, family.id), isNull(FamilyInvites.redeemedAt), isNull(FamilyInvites.revokedAt))),
      db.select().from(FamilyRoleRequests).where(eq(FamilyRoleRequests.familyId, family.id)).orderBy(desc(FamilyRoleRequests.createdAt)).limit(20),
      db.select().from(FamilyEvents).where(eq(FamilyEvents.familyId, family.id)).orderBy(desc(FamilyEvents.createdAt)).limit(100),
      coveredMemberIds(family.id),
      sponsorFeatureKeys(family.ownerUserId),
    ]);
    const nameOf = new Map(members.map((m) => [m.userId, safeMemberDisplayName({ firstName: m.firstName, lastName: m.lastName })]));
    return c.json({
      family: {
        id: family.id,
        name: space?.title ?? '(no space)',
        spaceId: family.spaceId,
        spaceDeleted: Boolean(space?.deletedAt),
        ownerUserId: family.ownerUserId,
        sponsoring: sponsorKeys.length > 0,
        frozenAt: family.frozenAt,
        frozenReason: family.frozenReason,
        createdAt: family.createdAt,
      },
      members: members.map((m) => ({
        userId: m.userId,
        name: nameOf.get(m.userId),
        email: m.email,
        role: m.role,
        isOwner: m.userId === family.ownerUserId,
        covered: m.userId === family.ownerUserId ? sponsorKeys.length > 0 : covered.has(m.userId),
        joinedAt: m.joinedAt,
        roleChangedAt: m.roleChangedAt,
        roleChangedBy: m.roleChangedBy,
      })),
      invites: invites.map((i) => ({ id: i.id, role: i.role, label: i.label, expiresAt: i.expiresAt, createdBy: i.createdBy })),
      requests: requests.map((r) => ({ ...r, name: nameOf.get(r.userId) ?? r.userId })),
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        actorKind: e.actorKind,
        actor: e.actorUserId ? nameOf.get(e.actorUserId) ?? e.actorUserId : null,
        target: e.targetUserId ? nameOf.get(e.targetUserId) ?? e.targetUserId : null,
        detail: e.detail ? JSON.parse(e.detail) : null,
        reason: e.reason,
        createdAt: e.createdAt,
      })),
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]', action: 'admin_family_detail' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── Overrides ───────────────────────────────────────────────────────────────

/** Any role, any direction — including into child, which members can never do. */
app.post('/api/admin/families/:familyId/role', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const { body, reason } = await readReason(c);
    if (!reason) return c.json(NEED_REASON, 400);
    const family = await loadFamily(c.req.param('familyId'));
    if (!family) return c.json({ error: 'Family not found', code: 'NOT_FOUND' }, 404);
    if (!isFamilyRole(body.role) || typeof body.userId !== 'string') {
      return c.json({ error: 'userId and a role are required', code: 'BAD_REQUEST' }, 400);
    }
    if (body.userId === family.ownerUserId && body.role !== 'parent') {
      return c.json({ error: 'The owner is always a parent. Transfer ownership first.', code: 'OWNER_ROLE_FIXED' }, 409);
    }
    const member = first(
      await db.select().from(FamilyMembers).where(and(eq(FamilyMembers.familyId, family.id), eq(FamilyMembers.userId, body.userId))).limit(1),
    );
    if (!member) return c.json({ error: 'Not in this family', code: 'NOT_FOUND' }, 404);
    if (member.role === body.role) return c.json({ error: 'They already have that role', code: 'ROLE_UNCHANGED' }, 409);
    const role = body.role;
    await db.transaction((tx) =>
      applyRoleChange(tx, { family, member, to: role, actorUserId: adminId(c), actorKind: 'support', reason, now: nowISO() }),
    );
    broadcastFamily(await memberIdsOf(family.id), family.spaceId);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]/role', action: 'admin_family_role' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/admin/families/:familyId/requests/:requestId', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const { body, reason } = await readReason(c);
    if (!reason) return c.json(NEED_REASON, 400);
    if (body.decision !== 'approve' && body.decision !== 'decline') {
      return c.json({ error: 'Approve or decline.', code: 'BAD_DECISION' }, 400);
    }
    const family = await loadFamily(c.req.param('familyId'));
    if (!family) return c.json({ error: 'Family not found', code: 'NOT_FOUND' }, 404);
    const request = first(
      await db
        .select()
        .from(FamilyRoleRequests)
        .where(and(eq(FamilyRoleRequests.id, c.req.param('requestId')), eq(FamilyRoleRequests.familyId, family.id)))
        .limit(1),
    );
    if (!request) return c.json({ error: 'Request not found', code: 'NOT_FOUND' }, 404);
    // Support may also overturn a parent's "not now", so a declined request can be approved.
    if (request.status !== 'pending' && !(request.status === 'declined' && body.decision === 'approve')) {
      return c.json({ error: 'This request is already settled.', code: 'NOT_PENDING' }, 409);
    }
    const member = first(
      await db.select().from(FamilyMembers).where(and(eq(FamilyMembers.familyId, family.id), eq(FamilyMembers.userId, request.userId))).limit(1),
    );
    const now = nowISO();
    const actor = adminId(c);
    await db.transaction(async (tx) => {
      if (body.decision === 'approve' && member?.role === 'child') {
        await applyRoleChange(tx, { family, member, to: 'adult', actorUserId: actor, actorKind: 'support', reason, now });
      }
      await tx
        .update(FamilyRoleRequests)
        .set({ status: body.decision === 'approve' ? 'approved' : 'declined', decidedBy: actor, decidedVia: 'support', decidedAt: now })
        .where(eq(FamilyRoleRequests.id, request.id));
      await recordFamilyEvent(tx, {
        familyId: family.id,
        actorUserId: actor,
        actorKind: 'support',
        kind: 'request_decided',
        targetUserId: request.userId,
        detail: { decision: body.decision },
        reason,
        now,
      });
    });
    broadcastFamily(await memberIdsOf(family.id), family.spaceId);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]/requests/[requestId]', action: 'admin_family_request' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/admin/families/:familyId/remove', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const { body, reason } = await readReason(c);
    if (!reason) return c.json(NEED_REASON, 400);
    const family = await loadFamily(c.req.param('familyId'));
    if (!family) return c.json({ error: 'Family not found', code: 'NOT_FOUND' }, 404);
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (userId === family.ownerUserId) {
      return c.json({ error: 'Transfer ownership or stop family sharing to remove the owner.', code: 'OWNER' }, 409);
    }
    const member = first(
      await db.select().from(FamilyMembers).where(and(eq(FamilyMembers.familyId, family.id), eq(FamilyMembers.userId, userId))).limit(1),
    );
    if (!member) return c.json({ error: 'Not in this family', code: 'NOT_FOUND' }, 404);
    const now = nowISO();
    const actor = adminId(c);
    const before = await memberIdsOf(family.id);
    await db.transaction(async (tx) => {
      await tx.delete(FamilyMembers).where(eq(FamilyMembers.id, member.id));
      const inSpace = first(
        await tx
          .select({ id: SpaceMemberships.id })
          .from(SpaceMemberships)
          .where(and(eq(SpaceMemberships.spaceId, family.spaceId), eq(SpaceMemberships.userId, userId)))
          .limit(1),
      );
      if (inSpace) {
        await removeMemberPreservingResponses(tx, { spaceId: family.spaceId, targetUserId: userId, actorId: actor, now });
      }
      await closePendingRequests(tx, userId, 'withdrawn', actor, 'support', now);
      await reconcileFamilyCoverage(family.id, tx);
      await reconcileFamilyCoverageForUser(userId, tx);
      await recordFamilyEvent(tx, { familyId: family.id, actorUserId: actor, actorKind: 'support', kind: 'removed', targetUserId: userId, detail: { role: member.role }, reason, now });
    });
    broadcastFamily(before, family.spaceId);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]/remove', action: 'admin_family_remove' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

app.post('/api/admin/families/:familyId/invites/:inviteId/revoke', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const { reason } = await readReason(c);
    if (!reason) return c.json(NEED_REASON, 400);
    const familyId = c.req.param('familyId');
    const now = nowISO();
    const rows = await db
      .update(FamilyInvites)
      .set({ revokedAt: now })
      .where(and(eq(FamilyInvites.id, c.req.param('inviteId')), eq(FamilyInvites.familyId, familyId), isNull(FamilyInvites.revokedAt)))
      .returning({ id: FamilyInvites.id });
    if (rows.length === 0) return c.json({ error: 'Invite not found', code: 'NOT_FOUND' }, 404);
    await recordFamilyEvent(db, { familyId, actorUserId: adminId(c), actorKind: 'support', kind: 'invite_revoked', reason, now });
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]/invites/[inviteId]/revoke', action: 'admin_family_revoke' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

/** Stop family sharing — the same dissolve a family's owner can do, recorded as support. */
app.post('/api/admin/families/:familyId/stop', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const { reason } = await readReason(c);
    if (!reason) return c.json(NEED_REASON, 400);
    const family = await loadFamily(c.req.param('familyId'));
    if (!family) return c.json({ error: 'Family not found', code: 'NOT_FOUND' }, 404);
    const now = nowISO();
    const actor = adminId(c);
    const memberIds = await db.transaction(async (tx) => {
      await tx
        .update(FamilyRoleRequests)
        .set({ status: 'withdrawn', decidedBy: actor, decidedVia: 'support', decidedAt: now })
        .where(and(eq(FamilyRoleRequests.familyId, family.id), eq(FamilyRoleRequests.status, 'pending')));
      await recordFamilyEvent(tx, { familyId: family.id, actorUserId: actor, actorKind: 'support', kind: 'dissolved', reason, now });
      return dissolveFamily(tx, family, now);
    });
    broadcastFamily(memberIds, family.spaceId);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]/stop', action: 'admin_family_stop' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

/** Pause member-initiated changes while a case is open. Leaving stays open regardless. */
app.post('/api/admin/families/:familyId/freeze', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const { body, reason } = await readReason(c);
    if (!reason) return c.json(NEED_REASON, 400);
    const family = await loadFamily(c.req.param('familyId'));
    if (!family) return c.json({ error: 'Family not found', code: 'NOT_FOUND' }, 404);
    const frozen = body.frozen === true;
    const now = nowISO();
    await db.transaction(async (tx) => {
      await tx
        .update(Families)
        .set({ frozenAt: frozen ? now : null, frozenReason: frozen ? reason : null, updatedAt: now })
        .where(eq(Families.id, family.id));
      await recordFamilyEvent(tx, { familyId: family.id, actorUserId: adminId(c), actorKind: 'support', kind: frozen ? 'frozen' : 'unfrozen', reason, now });
    });
    broadcastFamily(await memberIdsOf(family.id), family.spaceId);
    return c.json({ success: true, frozen });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]/freeze', action: 'admin_family_freeze' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

/**
 * Make another member the owner. They become a parent if they weren't one, take the Family
 * Space's ownership, and coverage comes from *their* Plus from now on — reconciled at once,
 * so a household whose new owner has no Plus loses coverage rather than riding the old one.
 */
app.post('/api/admin/families/:familyId/transfer', async (c) => {
  const gate = await requireHarvousAdmin(c);
  if (gate) return gate;
  try {
    const { body, reason } = await readReason(c);
    if (!reason) return c.json(NEED_REASON, 400);
    const family = await loadFamily(c.req.param('familyId'));
    if (!family) return c.json({ error: 'Family not found', code: 'NOT_FOUND' }, 404);
    const toUserId = typeof body.userId === 'string' ? body.userId : '';
    if (!toUserId || toUserId === family.ownerUserId) return c.json({ error: 'Pick another member', code: 'BAD_REQUEST' }, 400);
    const next = first(
      await db.select().from(FamilyMembers).where(and(eq(FamilyMembers.familyId, family.id), eq(FamilyMembers.userId, toUserId))).limit(1),
    );
    if (!next) return c.json({ error: 'Not in this family', code: 'NOT_FOUND' }, 404);
    const now = nowISO();
    const actor = adminId(c);
    const previousOwner = family.ownerUserId;
    await db.transaction(async (tx) => {
      await tx.update(Families).set({ ownerUserId: toUserId, updatedAt: now }).where(eq(Families.id, family.id));
      await tx.update(Spaces).set({ userId: toUserId, updatedAt: now }).where(eq(Spaces.id, family.spaceId));
      const moved = { ...family, ownerUserId: toUserId };
      // The new owner's space row becomes `owner` (upsertSpaceRole leaves an owner row alone,
      // so set it directly); the old owner stays a parent, as a leader.
      await tx
        .update(SpaceMemberships)
        .set({ role: 'owner', grantSource: null, updatedAt: now })
        .where(and(eq(SpaceMemberships.spaceId, family.spaceId), eq(SpaceMemberships.userId, toUserId)));
      await tx
        .update(SpaceMemberships)
        .set({ role: 'leader', grantSource: 'family', updatedAt: now })
        .where(and(eq(SpaceMemberships.spaceId, family.spaceId), eq(SpaceMemberships.userId, previousOwner)));
      if (next.role !== 'parent') {
        await tx
          .update(FamilyMembers)
          .set({ role: 'parent', roleChangedAt: now, roleChangedBy: `support:${actor}`, updatedAt: now })
          .where(eq(FamilyMembers.id, next.id));
        await closePendingRequests(tx, toUserId, 'withdrawn', actor, 'support', now);
      }
      await upsertSpaceRole(tx, { spaceId: family.spaceId, userId: toUserId, role: 'parent', isOwner: true, now });
      await reconcileFamilyCoverage(moved.id, tx);
      await reconcileFamilyCoverageForUser(previousOwner, tx);
      await recordFamilyEvent(tx, {
        familyId: family.id,
        actorUserId: actor,
        actorKind: 'support',
        kind: 'ownership_transferred',
        targetUserId: toUserId,
        detail: { from: previousOwner },
        reason,
        now,
      });
    });
    broadcastFamily(await memberIdsOf(family.id), family.spaceId);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/admin/families/[familyId]/transfer', action: 'admin_family_transfer' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
