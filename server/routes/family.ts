/**
 * Family Accounts — a household over a shared space. See docs/future/FAMILY_ACCOUNTS.md.
 *
 * Endpoints:
 *   GET    /api/family                              — my family, or how to start one
 *   POST   /api/family                              — start one (Plus; preview-gated)
 *   PATCH  /api/family                              — rename (parents)
 *   DELETE /api/family                              — dissolve (owner)
 *   POST   /api/family/invites                      — single-use invite link (parents)
 *   DELETE /api/family/invites/:inviteId            — revoke (parents)
 *   GET    /api/family/invites/preview/:token       — public; what the invite page shows
 *   POST   /api/family/invites/:token/redeem        — join; must echo the role back
 *   PATCH  /api/family/members/:userId              — change role
 *   DELETE /api/family/members/:userId              — remove, or leave
 *   GET    /api/family/progress                     — children's progress (parents); my own (child)
 *
 * The rules themselves live in src/lib/family-roles.ts, pure and table-tested; every write
 * here asks them before touching a row. The Family Space's SpaceMemberships rows are kept in
 * step with family roles in the same transaction, and coverage (Entitlements, source
 * 'family') is reconciled in it too.
 */

import { Hono } from 'hono';
import {
  db,
  first,
  Families,
  FamilyInvites,
  FamilyMembers,
  SpaceMemberships,
  Spaces,
  UserMetadata,
  and,
  count,
  eq,
  gt,
  inArray,
  isNull,
} from '../db';
import { nowISO } from '../db/dates';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import { rateLimit } from '@/utils/rate-limit';
import { handleAPIError } from '@/utils/error-handling';
import { validateTitle } from '@/utils/validation';
import { generateShareToken } from '@/utils/ids';
import { getPublicAppOrigin } from '../utils/public-app-origin';
import { broadcastInvalidation } from '../utils/realtime';
import { removeMemberPreservingResponses, safeMemberDisplayName } from '../utils/shared-space-lifecycle';
import { insertPersonalSharedSpace } from '../utils/shared-space-create';
import { syncEntitlementsFromProvider } from '../utils/entitlements';
import {
  coveredMemberIds,
  hasOwnStudyPlus,
  reconcileFamilyCoverage,
  reconcileFamilyCoverageForUser,
  sponsorFeatureKeys,
} from '../utils/family-entitlements';
import { canStartFamilyInPreview } from '../utils/family-preview';
import { familyProgressFor } from '../utils/family-progress';
import { dissolveFamily, isFamilyMembershipRace } from '../utils/family-lifecycle';
import { FAMILY_MAX_MEMBERS } from '@/lib/billing-plans';
import {
  FAMILY_INVITE_LABEL_MAX,
  FAMILY_INVITE_TTL_MS,
  FAMILY_ROLE_DISCLOSURE,
  canChangeFamilyRole,
  canInviteToFamily,
  canRemoveFamilyMember,
  canRenameFamily,
  evaluateFamilyInviteRedemption,
  familyInviteDeadReason,
  isFamilyRole,
  spaceRoleForFamilyRole,
  type FamilyRole,
} from '@/lib/family-roles';

const app = new Hono();

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;
type FamilyRow = typeof Families.$inferSelect;
type MemberRow = typeof FamilyMembers.$inferSelect;

function familyJoinUrl(origin: string, token: string): string {
  return `${origin}/family/join/${token}`;
}

/** My family membership and the family it belongs to, or nulls. */
async function loadMyFamily(
  userId: string,
  exec: Executor = db,
): Promise<{ family: FamilyRow; me: MemberRow } | null> {
  const me = first(
    await exec.select().from(FamilyMembers).where(eq(FamilyMembers.userId, userId)).limit(1),
  );
  if (!me) return null;
  const family = first(await exec.select().from(Families).where(eq(Families.id, me.familyId)).limit(1));
  if (!family) return null;
  return { family, me };
}

function actorOf(me: MemberRow | null | undefined, userId: string) {
  return { userId, role: me && isFamilyRole(me.role) ? me.role : null };
}

function refusal(c: any, result: { ok: false; code: string; error: string }, status: 403 | 409 = 403) {
  return c.json({ error: result.error, code: result.code }, status);
}

/** Live invites count against the cap, so a family can't hand out more links than seats. */
async function seatsTaken(familyId: string, exec: Executor, now: Date): Promise<number> {
  const [{ value: members }] = await exec
    .select({ value: count() })
    .from(FamilyMembers)
    .where(eq(FamilyMembers.familyId, familyId));
  const [{ value: invites }] = await exec
    .select({ value: count() })
    .from(FamilyInvites)
    .where(
      and(
        eq(FamilyInvites.familyId, familyId),
        isNull(FamilyInvites.redeemedAt),
        isNull(FamilyInvites.revokedAt),
        gt(FamilyInvites.expiresAt, now),
      ),
    );
  return Number(members) + Number(invites);
}

/** Keep the Family Space membership in step with a family role. */
async function upsertSpaceRole(
  tx: Executor,
  input: { spaceId: string; userId: string; role: FamilyRole; isOwner: boolean; invitedBy?: string | null; now: Date },
): Promise<void> {
  const spaceRole = spaceRoleForFamilyRole(input.role, input.isOwner);
  const existing = first(
    await tx
      .select({ id: SpaceMemberships.id, role: SpaceMemberships.role })
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, input.spaceId), eq(SpaceMemberships.userId, input.userId)))
      .limit(1),
  );
  if (existing) {
    if (existing.role === 'owner') return;
    await tx
      .update(SpaceMemberships)
      .set({ role: spaceRole, grantSource: spaceRole === 'leader' ? 'family' : null, updatedAt: input.now })
      .where(eq(SpaceMemberships.id, existing.id));
    return;
  }
  await tx.insert(SpaceMemberships).values({
    id: `smem_${crypto.randomUUID()}`,
    spaceId: input.spaceId,
    userId: input.userId,
    role: spaceRole,
    invitedBy: input.invitedBy ?? null,
    grantSource: spaceRole === 'leader' ? 'family' : null,
    joinedAt: input.now,
    createdAt: input.now,
  });
}

function broadcastSpace(userIds: Iterable<string>, spaceId: string) {
  for (const userId of new Set(userIds)) broadcastInvalidation(userId, { type: 'space:updated', id: spaceId });
}

// ─── GET /api/family ────────────────────────────────────────────────────────

app.get('/api/family', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    c.header('Cache-Control', 'private, max-age=0, no-store');

    // Self-heal: a missed webhook or a failed in-transaction reconcile is put right on read.
    await reconcileFamilyCoverageForUser(auth.userId).catch((error) =>
      console.error('[family] reconcile on read failed:', error),
    );

    const mine = await loadMyFamily(auth.userId);
    if (!mine) {
      const sponsorKeys = await sponsorFeatureKeys(auth.userId);
      return c.json({
        family: null,
        start: {
          available: canStartFamilyInPreview(auth.userId),
          hasPlus: sponsorKeys.length > 0,
        },
        maxMembers: FAMILY_MAX_MEMBERS,
      });
    }

    const { family, me } = mine;
    const space = first(
      await db
        .select({ id: Spaces.id, title: Spaces.title, color: Spaces.color, deletedAt: Spaces.deletedAt })
        .from(Spaces)
        .where(eq(Spaces.id, family.spaceId))
        .limit(1),
    );
    const memberRows = await db
      .select({
        userId: FamilyMembers.userId,
        role: FamilyMembers.role,
        joinedAt: FamilyMembers.joinedAt,
        firstName: UserMetadata.firstName,
        lastName: UserMetadata.lastName,
        profileImageUrl: UserMetadata.profileImageUrl,
        userColor: UserMetadata.userColor,
      })
      .from(FamilyMembers)
      .leftJoin(UserMetadata, eq(UserMetadata.userId, FamilyMembers.userId))
      .where(eq(FamilyMembers.familyId, family.id));
    const [covered, sponsorKeys, ownPlus] = await Promise.all([
      coveredMemberIds(family.id),
      sponsorFeatureKeys(family.ownerUserId),
      hasOwnStudyPlus(auth.userId),
    ]);
    const isParent = me.role === 'parent';
    const now = nowISO();

    const invites = isParent
      ? await db
          .select()
          .from(FamilyInvites)
          .where(
            and(
              eq(FamilyInvites.familyId, family.id),
              isNull(FamilyInvites.redeemedAt),
              isNull(FamilyInvites.revokedAt),
              gt(FamilyInvites.expiresAt, now),
            ),
          )
      : [];
    const origin = getPublicAppOrigin(c);
    const owner = memberRows.find((m) => m.userId === family.ownerUserId);

    return c.json({
      family: {
        id: family.id,
        name: space?.title ?? 'Family',
        spaceId: family.spaceId,
        spaceAvailable: Boolean(space && !space.deletedAt),
        ownerUserId: family.ownerUserId,
        ownerFirstName: owner?.firstName?.trim() || null,
        sponsoring: sponsorKeys.length > 0,
        members: memberRows
          .map((m) => ({
            userId: m.userId,
            role: m.role,
            isOwner: m.userId === family.ownerUserId,
            isMe: m.userId === auth.userId,
            displayName: safeMemberDisplayName({ firstName: m.firstName, lastName: m.lastName }),
            profileImageUrl: m.profileImageUrl ?? null,
            userColor: m.userColor ?? 'blue',
            covered: m.userId === family.ownerUserId ? sponsorKeys.length > 0 : covered.has(m.userId),
            joinedAt: m.joinedAt,
          }))
          .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()),
        invites: invites.map((invite) => ({
          id: invite.id,
          role: invite.role,
          label: invite.label,
          url: familyJoinUrl(origin, invite.token),
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        })),
      },
      me: {
        userId: auth.userId,
        role: me.role,
        isOwner: family.ownerUserId === auth.userId,
        hasOwnPlus: ownPlus,
      },
      maxMembers: FAMILY_MAX_MEMBERS,
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family', action: 'get_family' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/family ───────────────────────────────────────────────────────

app.post('/api/family', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    if (!canStartFamilyInPreview(auth.userId)) {
      return c.json({ error: 'Families aren’t open yet.', code: 'FAMILY_NOT_AVAILABLE' }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const titleValidation = validateTitle(name, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);

    if (await loadMyFamily(auth.userId)) {
      return c.json({ error: 'You’re already in a family.', code: 'ALREADY_IN_FAMILY' }, 409);
    }

    // Reconcile-on-write, as create-shared does: a checkout whose webhook hasn't landed yet.
    if ((await sponsorFeatureKeys(auth.userId)).length === 0) {
      await syncEntitlementsFromProvider(auth.userId).catch(() => undefined);
    }
    if ((await sponsorFeatureKeys(auth.userId)).length === 0) {
      return c.json(
        { error: 'Starting a family needs Plus. It covers everyone you invite.', code: 'FAMILY_NEEDS_PLUS', upgradeUrl: '/upgrade' },
        402,
      );
    }

    const now = nowISO();
    let created: { family: FamilyRow; spaceId: string };
    try {
      created = await db.transaction(async (tx) => {
        const space = await insertPersonalSharedSpace(tx, {
          ownerUserId: auth.userId,
          title: name,
          color: 'paper',
          coverVariant: 1,
          now,
        });
        const family = first(
          await tx
            .insert(Families)
            .values({ id: `fam_${crypto.randomUUID()}`, ownerUserId: auth.userId, spaceId: space.id, createdAt: now, updatedAt: now })
            .returning(),
        )!;
        await tx.insert(FamilyMembers).values({
          id: `fmem_${crypto.randomUUID()}`,
          familyId: family.id,
          userId: auth.userId,
          role: 'parent',
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        return { family, spaceId: space.id };
      });
    } catch (error) {
      // A double-tap racing itself into the one-family-per-person index.
      if (isFamilyMembershipRace(error)) {
        return c.json({ error: 'You’re already in a family.', code: 'ALREADY_IN_FAMILY' }, 409);
      }
      throw error;
    }

    broadcastSpace([auth.userId], created.spaceId);
    return c.json({ success: true, familyId: created.family.id, spaceId: created.spaceId });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family', action: 'create_family' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── PATCH /api/family ──────────────────────────────────────────────────────

app.patch('/api/family', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const mine = await loadMyFamily(auth.userId);
    if (!mine) return c.json({ error: 'You’re not in a family.', code: 'NOT_IN_FAMILY' }, 404);
    const allowed = canRenameFamily(actorOf(mine.me, auth.userId));
    if (!allowed.ok) return refusal(c, allowed);

    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const titleValidation = validateTitle(name, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);

    const now = nowISO();
    const title = name.charAt(0).toUpperCase() + name.slice(1);
    await db.update(Spaces).set({ title, updatedAt: now }).where(eq(Spaces.id, mine.family.spaceId));
    await db.update(Families).set({ updatedAt: now }).where(eq(Families.id, mine.family.id));

    const members = await db
      .select({ userId: FamilyMembers.userId })
      .from(FamilyMembers)
      .where(eq(FamilyMembers.familyId, mine.family.id));
    broadcastSpace(members.map((m) => m.userId), mine.family.spaceId);
    return c.json({ success: true, name: title });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family', action: 'rename_family' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── DELETE /api/family (dissolve) ──────────────────────────────────────────

app.delete('/api/family', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const mine = await loadMyFamily(auth.userId);
    if (!mine) return c.json({ error: 'You’re not in a family.', code: 'NOT_IN_FAMILY' }, 404);
    if (mine.family.ownerUserId !== auth.userId) {
      return c.json({ error: 'Only the family’s owner can end it.', code: 'FAMILY_OWNER_ONLY' }, 403);
    }
    const now = nowISO();
    const memberIds = await db.transaction((tx) => dissolveFamily(tx, mine.family, now));
    broadcastSpace(memberIds, mine.family.spaceId);
    return c.json({ success: true, spaceId: mine.family.spaceId });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family', action: 'dissolve_family' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/family/invites ───────────────────────────────────────────────

app.post('/api/family/invites', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const mine = await loadMyFamily(auth.userId);
    if (!mine) return c.json({ error: 'You’re not in a family.', code: 'NOT_IN_FAMILY' }, 404);
    const allowed = canInviteToFamily(actorOf(mine.me, auth.userId));
    if (!allowed.ok) return refusal(c, allowed);

    const body = (await c.req.json().catch(() => ({}))) as { role?: unknown; label?: unknown };
    if (!isFamilyRole(body.role)) {
      return c.json({ error: 'Choose parent, child, or adult member.', code: 'BAD_ROLE' }, 400);
    }
    const label =
      typeof body.label === 'string' && body.label.trim()
        ? body.label.trim().slice(0, FAMILY_INVITE_LABEL_MAX)
        : null;

    // Never-evict: a lapsed family keeps everyone, but can't add people.
    if ((await sponsorFeatureKeys(mine.family.ownerUserId)).length === 0) {
      const isOwner = mine.family.ownerUserId === auth.userId;
      return c.json(
        {
          error: isOwner
            ? 'Your Plus has ended, so you can’t invite anyone new. Renew it to cover your family again.'
            : 'The family’s plan has ended, so no one new can join right now.',
          code: 'FAMILY_PLAN_LAPSED',
          ...(isOwner ? { upgradeUrl: '/upgrade' } : {}),
        },
        402,
      );
    }

    const now = nowISO();
    if ((await seatsTaken(mine.family.id, db, now)) >= FAMILY_MAX_MEMBERS) {
      return c.json(
        { error: `A family can have up to ${FAMILY_MAX_MEMBERS} people, counting open invites.`, code: 'FAMILY_FULL' },
        409,
      );
    }

    const token = generateShareToken();
    const invite = first(
      await db
        .insert(FamilyInvites)
        .values({
          id: `finv_${crypto.randomUUID()}`,
          familyId: mine.family.id,
          token,
          role: body.role,
          label,
          createdBy: auth.userId,
          expiresAt: new Date(now.getTime() + FAMILY_INVITE_TTL_MS),
          createdAt: now,
        })
        .returning(),
    )!;

    return c.json({
      success: true,
      invite: {
        id: invite.id,
        role: invite.role,
        label: invite.label,
        url: familyJoinUrl(getPublicAppOrigin(c), token),
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      },
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family/invites', action: 'create_family_invite' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── DELETE /api/family/invites/:inviteId ───────────────────────────────────

app.delete('/api/family/invites/:inviteId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const inviteId = requireParam(c, 'inviteId');
    const mine = await loadMyFamily(auth.userId);
    if (!mine) return c.json({ error: 'You’re not in a family.', code: 'NOT_IN_FAMILY' }, 404);
    const allowed = canInviteToFamily(actorOf(mine.me, auth.userId));
    if (!allowed.ok) return refusal(c, allowed);

    const updated = await db
      .update(FamilyInvites)
      .set({ revokedAt: nowISO() })
      .where(
        and(
          eq(FamilyInvites.id, inviteId),
          eq(FamilyInvites.familyId, mine.family.id),
          isNull(FamilyInvites.revokedAt),
          isNull(FamilyInvites.redeemedAt),
        ),
      )
      .returning({ id: FamilyInvites.id });
    if (updated.length === 0) return c.json({ error: 'Invite not found', code: 'NOT_FOUND' }, 404);
    return c.json({ success: true });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family/invites/[inviteId]', action: 'revoke_family_invite' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/family/invites/preview/:token (public) ────────────────────────

/**
 * What the invite page shows. A visitor holding the token learns the family's name, the
 * inviter's first name, the role and what that role shares — what the person who sent the
 * link would tell them anyway. Never the member list, never emails, never whether the
 * owner's plan is paid up.
 */
app.get('/api/family/invites/preview/:token', rateLimit('read'), async (c) => {
  try {
    c.header('Cache-Control', 'private, max-age=0, no-store');
    const token = requireParam(c, 'token');
    const invite = first(await db.select().from(FamilyInvites).where(eq(FamilyInvites.token, token)).limit(1));
    if (!invite || !isFamilyRole(invite.role)) {
      return c.json({ error: 'This invite isn’t valid.', code: 'NOT_FOUND' }, 404);
    }
    const family = first(await db.select().from(Families).where(eq(Families.id, invite.familyId)).limit(1));
    if (!family) return c.json({ error: 'This family no longer exists.', code: 'NOT_FOUND' }, 404);
    const [space, inviter] = await Promise.all([
      db.select({ title: Spaces.title }).from(Spaces).where(eq(Spaces.id, family.spaceId)).limit(1).then(first),
      db
        .select({ firstName: UserMetadata.firstName })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, invite.createdBy))
        .limit(1)
        .then(first),
    ]);
    const dead = familyInviteDeadReason(invite, nowISO());
    return c.json({
      familyName: space?.title ?? 'A family',
      inviterFirstName: inviter?.firstName?.trim() || null,
      role: invite.role,
      disclosure: FAMILY_ROLE_DISCLOSURE[invite.role],
      valid: !dead,
      reason: dead,
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family/invites/preview/[token]', action: 'family_invite_preview' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── POST /api/family/invites/:token/redeem ─────────────────────────────────

app.post('/api/family/invites/:token/redeem', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const token = requireParam(c, 'token');
    const body = (await c.req.json().catch(() => ({}))) as { acknowledgedRole?: unknown };

    const invite = first(await db.select({ id: FamilyInvites.id }).from(FamilyInvites).where(eq(FamilyInvites.token, token)).limit(1));
    if (!invite) return c.json({ error: 'This invite isn’t valid.', code: 'NOT_FOUND' }, 404);

    type Outcome =
      | { kind: 'joined'; familyId: string; spaceId: string; role: FamilyRole; memberIds: string[] }
      | { kind: 'already-member'; spaceId: string }
      | { kind: 'refused'; status: 403 | 409 | 410 | 400; code: string; error: string };

    const now = nowISO();
    let outcome: Outcome;
    try {
      outcome = await db.transaction(async (tx): Promise<Outcome> => {
        const locked = first(await tx.select().from(FamilyInvites).where(eq(FamilyInvites.id, invite.id)).for('update').limit(1));
        const family = locked
          ? first(await tx.select().from(Families).where(eq(Families.id, locked.familyId)).for('update').limit(1))
          : null;
        if (!locked || !family || !isFamilyRole(locked.role)) {
          return { kind: 'refused', status: 410, code: 'INVITE_NOT_ACTIVE', error: 'This invite is no longer active.' };
        }
        const viewer = first(
          await tx.select({ familyId: FamilyMembers.familyId }).from(FamilyMembers).where(eq(FamilyMembers.userId, auth.userId)).limit(1),
        );
        const [{ value: memberCount }] = await tx
          .select({ value: count() })
          .from(FamilyMembers)
          .where(eq(FamilyMembers.familyId, family.id));

        const decision = evaluateFamilyInviteRedemption({
          invite: locked,
          now,
          viewerFamilyId: viewer?.familyId ?? null,
          memberCount: Number(memberCount),
          maxMembers: FAMILY_MAX_MEMBERS,
          acknowledgedRole: body.acknowledgedRole,
        });
        switch (decision) {
          case 'already-member':
            return { kind: 'already-member', spaceId: family.spaceId };
          case 'in-other-family':
            return { kind: 'refused', status: 409, code: 'ALREADY_IN_FAMILY', error: 'You’re already in another family. Leave it first to join this one.' };
          case 'dead':
            return { kind: 'refused', status: 410, code: 'INVITE_NOT_ACTIVE', error: familyInviteDeadReason(locked, now) ?? 'This invite is no longer active.' };
          case 'role-not-acknowledged':
            return { kind: 'refused', status: 400, code: 'ROLE_NOT_ACKNOWLEDGED', error: 'Confirm the role you’re joining as.' };
          case 'full':
            return { kind: 'refused', status: 409, code: 'FAMILY_FULL', error: 'This family is full.' };
          case 'join':
            break;
        }

        const role = locked.role as FamilyRole;
        await tx.insert(FamilyMembers).values({
          id: `fmem_${crypto.randomUUID()}`,
          familyId: family.id,
          userId: auth.userId,
          role,
          invitedBy: locked.createdBy,
          inviteId: locked.id,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await tx
          .update(FamilyInvites)
          .set({ redeemedBy: auth.userId, redeemedAt: now })
          .where(eq(FamilyInvites.id, locked.id));
        await upsertSpaceRole(tx, {
          spaceId: family.spaceId,
          userId: auth.userId,
          role,
          isOwner: false,
          invitedBy: locked.createdBy,
          now,
        });
        await reconcileFamilyCoverage(family.id, tx);
        const members = await tx
          .select({ userId: FamilyMembers.userId })
          .from(FamilyMembers)
          .where(eq(FamilyMembers.familyId, family.id));
        return { kind: 'joined', familyId: family.id, spaceId: family.spaceId, role, memberIds: members.map((m) => m.userId) };
      });
    } catch (error) {
      // Racing another redeem into the one-family-per-person index.
      if (isFamilyMembershipRace(error)) {
        return c.json({ error: 'You’re already in a family.', code: 'ALREADY_IN_FAMILY' }, 409);
      }
      throw error;
    }

    if (outcome.kind === 'refused') return c.json({ error: outcome.error, code: outcome.code }, outcome.status);
    if (outcome.kind === 'already-member') return c.json({ success: true, alreadyMember: true, spaceId: outcome.spaceId });

    broadcastSpace(outcome.memberIds, outcome.spaceId);
    return c.json({ success: true, familyId: outcome.familyId, spaceId: outcome.spaceId, role: outcome.role });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family/invites/[token]/redeem', action: 'redeem_family_invite' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── PATCH /api/family/members/:userId ──────────────────────────────────────

app.patch('/api/family/members/:userId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const targetUserId = requireParam(c, 'userId');
    const body = (await c.req.json().catch(() => ({}))) as { role?: unknown };
    if (!isFamilyRole(body.role)) {
      return c.json({ error: 'Choose parent, child, or adult member.', code: 'BAD_ROLE' }, 400);
    }
    const to = body.role;

    const mine = await loadMyFamily(auth.userId);
    if (!mine) return c.json({ error: 'You’re not in a family.', code: 'NOT_IN_FAMILY' }, 404);
    const target = first(
      await db
        .select()
        .from(FamilyMembers)
        .where(and(eq(FamilyMembers.userId, targetUserId), eq(FamilyMembers.familyId, mine.family.id)))
        .limit(1),
    );
    if (!target || !isFamilyRole(target.role)) {
      return c.json({ error: 'They aren’t in your family.', code: 'NOT_FOUND' }, 404);
    }

    const allowed = canChangeFamilyRole({
      actor: actorOf(mine.me, auth.userId),
      ownerUserId: mine.family.ownerUserId,
      targetUserId,
      from: target.role,
      to,
    });
    if (!allowed.ok) return refusal(c, allowed);

    const now = nowISO();
    await db.transaction(async (tx) => {
      await tx
        .update(FamilyMembers)
        .set({ role: to, roleChangedAt: now, roleChangedBy: auth.userId, updatedAt: now })
        .where(eq(FamilyMembers.id, target.id));
      await upsertSpaceRole(tx, { spaceId: mine.family.spaceId, userId: targetUserId, role: to, isOwner: false, now });
    });

    broadcastSpace([auth.userId, targetUserId], mine.family.spaceId);
    return c.json({ success: true, role: to });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family/members/[userId]', action: 'change_family_role' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── DELETE /api/family/members/:userId (remove, or leave) ──────────────────

app.delete('/api/family/members/:userId', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    const targetUserId = requireParam(c, 'userId');
    const mine = await loadMyFamily(auth.userId);
    if (!mine) return c.json({ error: 'You’re not in a family.', code: 'NOT_IN_FAMILY' }, 404);
    const target = first(
      await db
        .select()
        .from(FamilyMembers)
        .where(and(eq(FamilyMembers.userId, targetUserId), eq(FamilyMembers.familyId, mine.family.id)))
        .limit(1),
    );
    if (!target || !isFamilyRole(target.role)) {
      return c.json({ error: 'They aren’t in your family.', code: 'NOT_FOUND' }, 404);
    }
    const allowed = canRemoveFamilyMember({
      actor: actorOf(mine.me, auth.userId),
      ownerUserId: mine.family.ownerUserId,
      targetUserId,
      targetRole: target.role,
    });
    if (!allowed.ok) return refusal(c, allowed);

    const targetMeta = first(
      await db
        .select({ firstName: UserMetadata.firstName, lastName: UserMetadata.lastName })
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, targetUserId))
        .limit(1),
    );
    const snapshot = [targetMeta?.firstName, targetMeta?.lastName].filter(Boolean).join(' ').trim() || 'Former member';
    const now = nowISO();
    await db.transaction(async (tx) => {
      await tx.delete(FamilyMembers).where(eq(FamilyMembers.id, target.id));
      const inSpace = first(
        await tx
          .select({ id: SpaceMemberships.id })
          .from(SpaceMemberships)
          .where(and(eq(SpaceMemberships.spaceId, mine.family.spaceId), eq(SpaceMemberships.userId, targetUserId)))
          .limit(1),
      );
      if (inSpace) {
        await removeMemberPreservingResponses(tx, {
          spaceId: mine.family.spaceId,
          targetUserId,
          actorId: auth.userId,
          now,
          displayNameSnapshot: snapshot,
        });
      }
      await reconcileFamilyCoverage(mine.family.id, tx);
      await reconcileFamilyCoverageForUser(targetUserId, tx);
    });

    broadcastSpace([auth.userId, targetUserId], mine.family.spaceId);
    return c.json({ success: true, left: targetUserId === auth.userId });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family/members/[userId]', action: 'remove_family_member' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ─── GET /api/family/progress ───────────────────────────────────────────────

/**
 * Parents get every child; a child gets their own entry (the mirror of what parents see);
 * adults get nothing. Parents never see other parents or adult members.
 */
app.get('/api/family/progress', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    c.header('Cache-Control', 'private, max-age=0, no-store');
    const mine = await loadMyFamily(auth.userId);
    if (!mine) return c.json({ entries: [] });

    let subjects: string[] = [];
    if (mine.me.role === 'parent') {
      const children = await db
        .select({ userId: FamilyMembers.userId })
        .from(FamilyMembers)
        .where(and(eq(FamilyMembers.familyId, mine.family.id), eq(FamilyMembers.role, 'child')));
      subjects = children.map((m) => m.userId);
    } else if (mine.me.role === 'child') {
      subjects = [auth.userId];
    }
    if (subjects.length === 0) return c.json({ entries: [] });

    const [progress, names] = await Promise.all([
      familyProgressFor(subjects),
      db
        .select({ userId: UserMetadata.userId, firstName: UserMetadata.firstName, lastName: UserMetadata.lastName })
        .from(UserMetadata)
        .where(inArray(UserMetadata.userId, subjects)),
    ]);
    const nameOf = new Map(names.map((n) => [n.userId, safeMemberDisplayName(n)]));
    return c.json({
      entries: progress.map((p) => ({
        userId: p.userId,
        displayName: nameOf.get(p.userId) ?? 'Member',
        lastActive: p.lastActive,
        chaptersRead: p.chaptersRead,
        booksRead: p.booksRead,
        notesWritten: p.notesWritten,
      })),
    });
  } catch (error) {
    const e = handleAPIError(error, { endpoint: '/api/family/progress', action: 'family_progress' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default app;
