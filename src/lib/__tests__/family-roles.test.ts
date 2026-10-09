/**
 * The Family Accounts permission matrix, table-tested. The routes ask exactly these
 * functions before any write, so this file is the matrix in docs/future/FAMILY_ACCOUNTS.md.
 */
import { describe, expect, it } from 'vitest';
import {
  askAgainAt,
  canDecideRequest,
  canEscalateRequest,
  canRequestAdult,
  escalationOpensAt,
  canChangeFamilyRole,
  canInviteToFamily,
  canRemoveFamilyMember,
  canRenameFamily,
  evaluateFamilyInviteRedemption,
  familyInviteDeadReason,
  spaceRoleForFamilyRole,
  FAMILY_ROLE_DISCLOSURE,
  type FamilyRole,
} from '../family-roles';

const OWNER = 'u_owner';
const PARENT = 'u_parent';
const CHILD = 'u_child';
const ADULT = 'u_adult';
const ROLE: Record<string, FamilyRole> = { [OWNER]: 'parent', [PARENT]: 'parent', [CHILD]: 'child', [ADULT]: 'adult' };
const actor = (userId: string) => ({ userId, role: ROLE[userId] ?? null });

describe('canChangeFamilyRole', () => {
  const cases: Array<[actor: string, target: string, to: FamilyRole, ok: boolean | string]> = [
    // child → adult: any parent; the child has to ask
    [OWNER, CHILD, 'adult', true],
    [PARENT, CHILD, 'adult', true],
    [CHILD, CHILD, 'adult', 'NEEDS_PARENT_APPROVAL'],
    [ADULT, CHILD, 'adult', 'FAMILY_PARENTS_ONLY'],
    // → parent, parent → adult: owner only
    [OWNER, ADULT, 'parent', true],
    [OWNER, CHILD, 'parent', true],
    [OWNER, PARENT, 'adult', true],
    [PARENT, ADULT, 'parent', 'FAMILY_OWNER_ONLY'],
    [PARENT, PARENT, 'adult', 'FAMILY_OWNER_ONLY'],
    [ADULT, ADULT, 'parent', 'FAMILY_OWNER_ONLY'],
    // nobody becomes a child after joining
    [OWNER, ADULT, 'child', 'ROLE_CHANGE_NEEDS_CONSENT'],
    [OWNER, PARENT, 'child', 'ROLE_CHANGE_NEEDS_CONSENT'],
    [ADULT, ADULT, 'child', 'ROLE_CHANGE_NEEDS_CONSENT'],
    // the owner is always a parent
    [OWNER, OWNER, 'adult', 'FAMILY_OWNER_ROLE_FIXED'],
    // no-ops
    [OWNER, CHILD, 'child', 'ROLE_UNCHANGED'],
  ];
  it.each(cases)('%s moving %s to %s', (who, target, to, expected) => {
    const result = canChangeFamilyRole({ actor: actor(who), ownerUserId: OWNER, targetUserId: target, from: ROLE[target], to });
    if (expected === true) expect(result).toEqual({ ok: true });
    else expect(result).toMatchObject({ ok: false, code: expected });
  });

  it('refuses someone outside the family', () => {
    const result = canChangeFamilyRole({ actor: { userId: 'u_x', role: null }, ownerUserId: OWNER, targetUserId: CHILD, from: 'child', to: 'adult' });
    expect(result).toMatchObject({ ok: false, code: 'NOT_IN_FAMILY' });
  });
});

describe('canRemoveFamilyMember', () => {
  const cases: Array<[actor: string, target: string, ok: boolean | string]> = [
    [OWNER, CHILD, true],
    [OWNER, ADULT, true],
    [OWNER, PARENT, true],
    [PARENT, CHILD, true],
    [PARENT, ADULT, true],
    [PARENT, PARENT, true], // leaving
    [CHILD, CHILD, true], // leaving
    [ADULT, ADULT, true], // leaving
    [PARENT, OWNER, 'FAMILY_OWNER_CANNOT_LEAVE'],
    [OWNER, OWNER, 'FAMILY_OWNER_CANNOT_LEAVE'],
    [CHILD, ADULT, 'FAMILY_PARENTS_ONLY'],
    [ADULT, CHILD, 'FAMILY_PARENTS_ONLY'],
    [CHILD, PARENT, 'FAMILY_OWNER_ONLY'],
  ];
  it.each(cases)('%s removing %s', (who, target, expected) => {
    const result = canRemoveFamilyMember({ actor: actor(who), ownerUserId: OWNER, targetUserId: target, targetRole: ROLE[target] });
    if (expected === true) expect(result).toEqual({ ok: true });
    else expect(result).toMatchObject({ ok: false, code: expected });
  });
});

describe('invite and rename', () => {
  it('are for parents only', () => {
    for (const who of [OWNER, PARENT]) {
      expect(canInviteToFamily(actor(who)).ok).toBe(true);
      expect(canRenameFamily(actor(who)).ok).toBe(true);
    }
    for (const who of [CHILD, ADULT, 'u_x']) {
      expect(canInviteToFamily(actor(who)).ok).toBe(false);
      expect(canRenameFamily(actor(who)).ok).toBe(false);
    }
  });
});

describe('spaceRoleForFamilyRole', () => {
  it('maps owner, parents, and everyone else', () => {
    expect(spaceRoleForFamilyRole('parent', true)).toBe('owner');
    expect(spaceRoleForFamilyRole('parent', false)).toBe('leader');
    expect(spaceRoleForFamilyRole('child', false)).toBe('member');
    expect(spaceRoleForFamilyRole('adult', false)).toBe('member');
  });
});

describe('evaluateFamilyInviteRedemption', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const live = {
    familyId: 'fam_1',
    role: 'child',
    expiresAt: new Date('2026-10-12T00:00:00Z'),
    redeemedAt: null,
    revokedAt: null,
  };
  const base = { invite: live, now, viewerFamilyId: null, memberCount: 2, maxMembers: 6, acknowledgedRole: 'child' };

  it('joins when everything lines up', () => {
    expect(evaluateFamilyInviteRedemption(base)).toBe('join');
  });
  it('requires the role to be echoed back', () => {
    expect(evaluateFamilyInviteRedemption({ ...base, acknowledgedRole: undefined })).toBe('role-not-acknowledged');
    expect(evaluateFamilyInviteRedemption({ ...base, acknowledgedRole: 'adult' })).toBe('role-not-acknowledged');
  });
  it('tells a member they are already in, even on a spent link', () => {
    expect(evaluateFamilyInviteRedemption({ ...base, viewerFamilyId: 'fam_1', invite: { ...live, redeemedAt: now } })).toBe('already-member');
  });
  it('refuses someone in another family', () => {
    expect(evaluateFamilyInviteRedemption({ ...base, viewerFamilyId: 'fam_2' })).toBe('in-other-family');
  });
  it('refuses used, revoked, expired and missing invites', () => {
    expect(evaluateFamilyInviteRedemption({ ...base, invite: { ...live, redeemedAt: now } })).toBe('dead');
    expect(evaluateFamilyInviteRedemption({ ...base, invite: { ...live, revokedAt: now } })).toBe('dead');
    expect(evaluateFamilyInviteRedemption({ ...base, invite: { ...live, expiresAt: now } })).toBe('dead');
    expect(evaluateFamilyInviteRedemption({ ...base, invite: null })).toBe('dead');
  });
  it('refuses a full family', () => {
    expect(evaluateFamilyInviteRedemption({ ...base, memberCount: 6 })).toBe('full');
  });
  it('reports why an invite is dead', () => {
    expect(familyInviteDeadReason(live, now)).toBeNull();
    expect(familyInviteDeadReason({ ...live, expiresAt: '2026-10-01T00:00:00Z' }, now)).toMatch(/expired/);
  });
});

describe('disclosure', () => {
  it('tells a child exactly the four things parents see, and what they never see', () => {
    const child = FAMILY_ROLE_DISCLOSURE.child;
    expect(child.shares).toHaveLength(3);
    expect(child.shares.join(' ')).toMatch(/last active/i);
    expect(child.shares.join(' ')).toMatch(/chapters/i);
    expect(child.shares.join(' ')).toMatch(/books/i);
    expect(child.shares.join(' ')).toMatch(/notes you wrote/i);
    expect(child.never).toMatch(/never see your notes/i);
    expect(child.never).toMatch(/Review/);
  });
});

describe('asking to become an adult member', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const days = (n: number) => new Date(now.getTime() - n * 86400000);

  it('only a child can ask, and only once at a time', () => {
    expect(canRequestAdult({ role: 'child', latest: null, frozen: false, now }).ok).toBe(true);
    expect(canRequestAdult({ role: 'adult', latest: null, frozen: false, now })).toMatchObject({ code: 'NOT_A_CHILD' });
    expect(canRequestAdult({ role: 'parent', latest: null, frozen: false, now })).toMatchObject({ code: 'NOT_A_CHILD' });
    const pending = { status: 'pending', createdAt: days(1), decidedAt: null, escalatedAt: null };
    expect(canRequestAdult({ role: 'child', latest: pending, frozen: false, now })).toMatchObject({ code: 'REQUEST_PENDING' });
  });

  it('waits 30 days after a "not now", then lets them ask again', () => {
    const declined = { status: 'declined', createdAt: days(12), decidedAt: days(10), escalatedAt: null };
    expect(canRequestAdult({ role: 'child', latest: declined, frozen: false, now })).toMatchObject({ code: 'REQUEST_COOLDOWN' });
    expect(askAgainAt(declined)?.toISOString()).toBe(new Date(days(10).getTime() + 30 * 86400000).toISOString());
    const old = { ...declined, decidedAt: days(31) };
    expect(canRequestAdult({ role: 'child', latest: old, frozen: false, now }).ok).toBe(true);
  });

  it('a withdrawn request never blocks asking again', () => {
    const withdrawn = { status: 'withdrawn', createdAt: days(1), decidedAt: days(1), escalatedAt: null };
    expect(canRequestAdult({ role: 'child', latest: withdrawn, frozen: false, now }).ok).toBe(true);
  });

  it('nothing moves while support has the family paused', () => {
    expect(canRequestAdult({ role: 'child', latest: null, frozen: true, now })).toMatchObject({ code: 'FAMILY_FROZEN' });
    expect(canDecideRequest({ userId: OWNER, role: 'parent' }, true)).toMatchObject({ code: 'FAMILY_FROZEN' });
  });

  it('only a parent answers', () => {
    expect(canDecideRequest({ userId: OWNER, role: 'parent' }, false).ok).toBe(true);
    expect(canDecideRequest({ userId: ADULT, role: 'adult' }, false)).toMatchObject({ code: 'FAMILY_PARENTS_ONLY' });
    expect(canDecideRequest({ userId: CHILD, role: 'child' }, false)).toMatchObject({ code: 'FAMILY_PARENTS_ONLY' });
  });

  it('opens Harvous review after 14 days of silence', () => {
    const fresh = { status: 'pending', createdAt: days(13), decidedAt: null, escalatedAt: null };
    expect(canEscalateRequest(fresh, now)).toMatchObject({ code: 'TOO_SOON' });
    const stale = { ...fresh, createdAt: days(14) };
    expect(canEscalateRequest(stale, now).ok).toBe(true);
  });

  it('opens Harvous review at once after a "not now"', () => {
    const declined = { status: 'declined', createdAt: days(2), decidedAt: days(1), escalatedAt: null };
    expect(canEscalateRequest(declined, now).ok).toBe(true);
  });

  it('escalates once, and never a settled request', () => {
    expect(canEscalateRequest({ status: 'pending', createdAt: days(20), decidedAt: null, escalatedAt: days(1) }, now)).toMatchObject({ code: 'ALREADY_ESCALATED' });
    expect(canEscalateRequest({ status: 'approved', createdAt: days(20), decidedAt: days(1), escalatedAt: null }, now)).toMatchObject({ code: 'NOT_ESCALATABLE' });
    expect(escalationOpensAt({ status: 'withdrawn', createdAt: days(20), decidedAt: days(1), escalatedAt: null })).toBeNull();
  });
});
