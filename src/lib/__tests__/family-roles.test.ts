/**
 * The Family Accounts permission matrix, table-tested. The routes ask exactly these
 * functions before any write, so this file is the matrix in docs/future/FAMILY_ACCOUNTS.md.
 */
import { describe, expect, it } from 'vitest';
import {
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
    // child → adult: any parent, or the child themself
    [OWNER, CHILD, 'adult', true],
    [PARENT, CHILD, 'adult', true],
    [CHILD, CHILD, 'adult', true],
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
