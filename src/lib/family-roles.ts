/**
 * Family Accounts — the rules, with no database in them.
 *
 * Shared by the API (server/routes/family.ts decides with these) and the SPA (Settings ›
 * Family offers only what these allow, and the invite page shows the same disclosure the
 * server makes the invitee acknowledge). Pure so the whole permission matrix is table-tested.
 * See docs/future/FAMILY_ACCOUNTS.md.
 */

export const FAMILY_ROLES = ['parent', 'child', 'adult'] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

export function isFamilyRole(value: unknown): value is FamilyRole {
  return typeof value === 'string' && (FAMILY_ROLES as readonly string[]).includes(value);
}

/** Single-use links, a week long — a household passes them around in days, not months. */
export const FAMILY_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FAMILY_INVITE_LABEL_MAX = 40;

/** The Family Space role a family role maps to. Parents arrange the space; everyone writes. */
export function spaceRoleForFamilyRole(role: FamilyRole, isOwner: boolean): 'owner' | 'leader' | 'member' {
  if (isOwner) return 'owner';
  return role === 'parent' ? 'leader' : 'member';
}

export const FAMILY_ROLE_LABEL: Record<FamilyRole, string> = {
  parent: 'Parent',
  child: 'Child',
  adult: 'Adult member',
};

/**
 * What each role shares, said the way the invitee reads it before joining. The server makes
 * the redeem echo the role back, so this text is the thing actually consented to.
 */
export const FAMILY_ROLE_DISCLOSURE: Record<FamilyRole, { summary: string; shares: string[]; never: string }> = {
  parent: {
    summary: 'You can invite people and see how each child’s study is going.',
    shares: ['Your study stays private. Other parents can’t see it.'],
    never: 'No one in the family can see your notes.',
  },
  child: {
    summary: 'Your parents can see how your study is going, never what you write.',
    shares: [
      'When you were last active',
      'How many chapters you read, and which books they were in',
      'How many notes you wrote',
    ],
    never: 'They can never see your notes, highlights, searches, or Review. You can ask to become an adult member, and you can leave the family any time.',
  },
  adult: {
    summary: 'You share the Family Space and the family plan. Your study stays private.',
    shares: ['Nothing about your study is shown to anyone.'],
    never: 'No one in the family can see your notes.',
  },
};

/** The same roles, described to the parent choosing one for an invite. */
export const FAMILY_ROLE_FOR_INVITER: Record<FamilyRole, string> = {
  child: 'Parents see how their study is going, never what they write. They can ask to become an adult member.',
  adult: 'They share the Family Space and your plan. Their study stays private.',
  parent: 'They can invite people and see the children’s progress.',
};

export type FamilyRuleRefusal = { ok: false; code: string; error: string };
export type FamilyRuleResult = { ok: true } | FamilyRuleRefusal;

const OK: FamilyRuleResult = { ok: true };
function refuse(code: string, error: string): FamilyRuleRefusal {
  return { ok: false, code, error };
}

export interface FamilyActor {
  userId: string;
  /** Null when the actor is not in this family. */
  role: FamilyRole | null;
}

export function canInviteToFamily(actor: FamilyActor): FamilyRuleResult {
  return actor.role === 'parent' ? OK : refuse('FAMILY_PARENTS_ONLY', 'Only parents can invite people.');
}

export function canRenameFamily(actor: FamilyActor): FamilyRuleResult {
  return actor.role === 'parent' ? OK : refuse('FAMILY_PARENTS_ONLY', 'Only parents can rename the family.');
}

/**
 * Who may move whom between roles.
 *
 * - child → adult: any parent. The child cannot make the switch alone — they *ask*
 *   (`canRequestAdult`), and a parent or Harvous support decides. Leaving the family is
 *   always theirs, so asking is never the only way to stop being seen.
 * - anything → parent, parent → adult: the owner only. Being a parent grants sight of the
 *   children's progress, so it is the owner's to hand out.
 * - anything → child: never. The child role adds visibility, so it is only entered by
 *   accepting an invite that says so.
 * - The owner's own role never changes.
 */
export function canChangeFamilyRole(input: {
  actor: FamilyActor;
  ownerUserId: string;
  targetUserId: string;
  from: FamilyRole;
  to: FamilyRole;
}): FamilyRuleResult {
  const { actor, ownerUserId, targetUserId, from, to } = input;
  if (actor.role === null) return refuse('NOT_IN_FAMILY', 'You are not in this family.');
  if (from === to) return refuse('ROLE_UNCHANGED', 'They already have that role.');
  if (targetUserId === ownerUserId) return refuse('FAMILY_OWNER_ROLE_FIXED', 'The family’s owner is always a parent.');
  if (to === 'child') {
    return refuse('ROLE_CHANGE_NEEDS_CONSENT', 'Someone can only become a child by accepting a child invite.');
  }
  const isOwner = actor.userId === ownerUserId;
  const isSelf = actor.userId === targetUserId;
  if (from === 'child' && to === 'adult') {
    if (actor.role === 'parent') return OK;
    if (isSelf) {
      return refuse('NEEDS_PARENT_APPROVAL', 'Ask a parent to approve this, or ask Harvous to review it.');
    }
    return refuse('FAMILY_PARENTS_ONLY', 'Only a parent can make this change.');
  }
  // → parent, parent → adult
  return isOwner ? OK : refuse('FAMILY_OWNER_ONLY', 'Only the family’s owner can change who is a parent.');
}

/**
 * Removing someone, or leaving. The owner can't leave — they dissolve the family instead,
 * because the family's coverage is theirs.
 */
export function canRemoveFamilyMember(input: {
  actor: FamilyActor;
  ownerUserId: string;
  targetUserId: string;
  targetRole: FamilyRole;
}): FamilyRuleResult {
  const { actor, ownerUserId, targetUserId, targetRole } = input;
  if (actor.role === null) return refuse('NOT_IN_FAMILY', 'You are not in this family.');
  if (targetUserId === ownerUserId) {
    return refuse('FAMILY_OWNER_CANNOT_LEAVE', 'The person who started the family can’t leave. Stop family sharing instead.');
  }
  if (actor.userId === targetUserId) return OK;
  if (targetRole === 'parent') {
    return actor.userId === ownerUserId
      ? OK
      : refuse('FAMILY_OWNER_ONLY', 'Only the family’s owner can remove a parent.');
  }
  return actor.role === 'parent' ? OK : refuse('FAMILY_PARENTS_ONLY', 'Only parents can remove people.');
}

// ─── Asking to become an adult member ───────────────────────────────────────

/** After a parent says "not now", a child can ask again after this long. */
export const FAMILY_REQUEST_COOLDOWN_DAYS = 30;
/** With no answer this long, the child can ask Harvous to review it. */
export const FAMILY_ESCALATE_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type FamilyRoleRequestStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export interface FamilyRoleRequestLike {
  status: FamilyRoleRequestStatus | string;
  createdAt: Date | string;
  decidedAt: Date | string | null;
  escalatedAt: Date | string | null;
}

/**
 * May this person ask to become an adult member now? `latest` is their most recent request,
 * whatever its status.
 */
export function canRequestAdult(input: {
  role: FamilyRole | null;
  latest: FamilyRoleRequestLike | null;
  frozen: boolean;
  now: Date;
}): FamilyRuleResult {
  const { role, latest, frozen, now } = input;
  if (role !== 'child') return refuse('NOT_A_CHILD', 'Only a child member can ask for this.');
  if (frozen) return refuse('FAMILY_FROZEN', 'Harvous support has paused changes to this family.');
  if (latest?.status === 'pending') return refuse('REQUEST_PENDING', 'You’ve already asked. A parent can answer it now.');
  if (latest?.status === 'declined' && latest.decidedAt) {
    const again = askAgainAt(latest);
    if (again && again.getTime() > now.getTime()) {
      return refuse('REQUEST_COOLDOWN', `You can ask again on ${again.toDateString()}.`);
    }
  }
  return OK;
}

/** When a declined request may be asked again. */
export function askAgainAt(request: FamilyRoleRequestLike): Date | null {
  if (request.status !== 'declined' || !request.decidedAt) return null;
  return new Date(new Date(request.decidedAt).getTime() + FAMILY_REQUEST_COOLDOWN_DAYS * DAY_MS);
}

/**
 * When a child may ask Harvous to review: a pending request with no answer for 14 days, or —
 * straight away — a request a parent declined. Once, per request.
 */
export function escalationOpensAt(request: FamilyRoleRequestLike): Date | null {
  if (request.escalatedAt) return null;
  if (request.status === 'pending') return new Date(new Date(request.createdAt).getTime() + FAMILY_ESCALATE_AFTER_DAYS * DAY_MS);
  if (request.status === 'declined' && request.decidedAt) return new Date(request.decidedAt);
  return null;
}

export function canEscalateRequest(request: FamilyRoleRequestLike, now: Date): FamilyRuleResult {
  if (request.escalatedAt) return refuse('ALREADY_ESCALATED', 'Harvous support is already reviewing this.');
  const opens = escalationOpensAt(request);
  if (!opens) return refuse('NOT_ESCALATABLE', 'There’s nothing to review.');
  if (opens.getTime() > now.getTime()) {
    return refuse('TOO_SOON', `Give your parents until ${opens.toDateString()} to answer.`);
  }
  return OK;
}

/** Deciding is a parent's — and never while support has the family paused. */
export function canDecideRequest(actor: FamilyActor, frozen: boolean): FamilyRuleResult {
  if (actor.role !== 'parent') return refuse('FAMILY_PARENTS_ONLY', 'Only a parent can answer this.');
  if (frozen) return refuse('FAMILY_FROZEN', 'Harvous support has paused changes to this family.');
  return OK;
}

export interface FamilyInviteLike {
  familyId: string;
  role: string;
  expiresAt: Date | string;
  redeemedAt: Date | string | null;
  revokedAt: Date | string | null;
}

/** Why an invite can't be used, or null when it is live. */
export function familyInviteDeadReason(invite: FamilyInviteLike, now: Date): string | null {
  if (invite.revokedAt) return 'This invite was turned off.';
  if (invite.redeemedAt) return 'This invite has already been used.';
  if (new Date(invite.expiresAt).getTime() <= now.getTime()) return 'This invite has expired.';
  return null;
}

export type FamilyRedeemOutcome =
  | 'join'
  | 'dead'
  | 'already-member'
  | 'in-other-family'
  | 'full'
  | 'role-not-acknowledged';

/**
 * Decide a redeem, given rows read under lock. Order matters: someone already in this family
 * is told so even if the link has since been used; the role check comes before anything is
 * claimed, so an unacknowledged redeem changes nothing.
 */
export function evaluateFamilyInviteRedemption(input: {
  invite: FamilyInviteLike | null;
  now: Date;
  /** The family the redeemer is already in, if any. */
  viewerFamilyId: string | null;
  memberCount: number;
  maxMembers: number;
  acknowledgedRole: unknown;
}): FamilyRedeemOutcome {
  const { invite, now, viewerFamilyId, memberCount, maxMembers, acknowledgedRole } = input;
  if (!invite) return 'dead';
  if (viewerFamilyId === invite.familyId) return 'already-member';
  if (viewerFamilyId) return 'in-other-family';
  if (familyInviteDeadReason(invite, now)) return 'dead';
  if (acknowledgedRole !== invite.role) return 'role-not-acknowledged';
  if (memberCount >= maxMembers) return 'full';
  return 'join';
}
