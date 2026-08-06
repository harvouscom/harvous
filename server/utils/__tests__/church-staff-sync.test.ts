import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canInviteMoreStaff, isClerkOrgAdminRole, CLERK_ORG_STAFF_CAP } from '../clerk-org';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('staff seat cap', () => {
  it('counts pending invites against the cap', () => {
    // 18 staff + 2 pending is already full: those invites become members.
    expect(canInviteMoreStaff({ memberCount: 18, pendingInviteCount: 1 })).toBe(true);
    expect(canInviteMoreStaff({ memberCount: 18, pendingInviteCount: 2 })).toBe(false);
    expect(canInviteMoreStaff({ memberCount: 20, pendingInviteCount: 0 })).toBe(false);
    expect(canInviteMoreStaff({ memberCount: 0, pendingInviteCount: 0 })).toBe(true);
  });

  it('lands exactly on the documented cap', () => {
    expect(CLERK_ORG_STAFF_CAP).toBe(20);
    expect(
      canInviteMoreStaff({ memberCount: CLERK_ORG_STAFF_CAP - 1, pendingInviteCount: 0 }),
    ).toBe(true);
    expect(canInviteMoreStaff({ memberCount: CLERK_ORG_STAFF_CAP, pendingInviteCount: 0 })).toBe(
      false,
    );
  });

  it('supports inviting several at once', () => {
    expect(canInviteMoreStaff({ memberCount: 15, pendingInviteCount: 0, adding: 5 })).toBe(true);
    expect(canInviteMoreStaff({ memberCount: 15, pendingInviteCount: 0, adding: 6 })).toBe(false);
  });
});

describe('roster-change authority', () => {
  it('recognises only org:admin', () => {
    expect(isClerkOrgAdminRole('org:admin')).toBe(true);
    expect(isClerkOrgAdminRole('org:member')).toBe(false);
    expect(isClerkOrgAdminRole('org:pastor')).toBe(false);
    expect(isClerkOrgAdminRole(null)).toBe(false);
    expect(isClerkOrgAdminRole(undefined)).toBe(false);
  });
});

describe('shared staff-sync implementation', () => {
  const sync = () => source('server/utils/church-staff-sync.ts');

  it('is the single implementation — the admin route delegates to it', () => {
    const admin = source('server/routes/churches.ts');
    expect(admin).toContain('syncChurchStaffForOrg');
    // The reconciliation loop must no longer be duplicated in the route.
    expect(admin).not.toContain('computeStaffSyncPlan');
    expect(admin).not.toContain('db.delete(SpaceMemberships)');
  });

  it('deletes only leader rows, in SQL as well as in the plan', () => {
    expect(sync()).toMatch(
      /delete\(SpaceMemberships\)[\s\S]*?eq\(SpaceMemberships\.role, 'leader'\)/,
    );
    expect(sync()).toContain('computeStaffSyncPlan');
  });

  it('restates the never-reap-a-grant guard in SQL, not only in the planner', () => {
    // Belt and braces, same as the owner/member guards: a future caller that
    // builds a plan by another route still must not be able to delete a grant.
    const text = sync();
    const deleteBlock = text.slice(text.indexOf('plan.toRemove'));
    expect(deleteBlock).toContain('SpaceMemberships.grantSource');
    expect(deleteBlock).toContain("'grant'");
    // And the read that feeds the planner has to select the column at all.
    expect(text).toContain('grantSource: SpaceMemberships.grantSource');
  });

  it('never mutates when the Clerk roster could not be read', () => {
    // The fetch is awaited before any write; a throw propagates out of the
    // function rather than being treated as an empty roster.
    expect(sync().indexOf('fetchClerkOrgMemberships')).toBeLessThan(sync().indexOf('db.transaction'));
    expect(sync()).not.toMatch(/catch[\s\S]{0,80}staff = \[\]/);
  });

  it('refuses to reconcile an over-cap roster instead of truncating it', () => {
    expect(sync()).toContain('isWithinClerkOrgStaffCap');
    expect(sync()).toContain("code: 'CLERK_ORG_MEMBER_LIMIT'");
  });
});

describe('church staff route contracts', () => {
  const route = () => source('server/routes/church.ts');

  it('separates "can see the team" from "can change the team"', () => {
    // Reading the roster needs staff; every mutation additionally needs admin.
    const mutations = ['invite', 'revoke-invite', 'remove'];
    for (const path of mutations) {
      const start = route().indexOf(`'/api/church/staff/${path}'`);
      expect(start, `${path} endpoint exists`).toBeGreaterThan(-1);
      const handler = route().slice(start, start + 2500);
      expect(handler, `${path} requires org admin`).toContain('isClerkOrgAdminRole(ctx.role)');
      expect(handler, `${path} refuses non-admins`).toContain("code: 'CHURCH_ADMIN_REQUIRED'");
    }
    // Sync is deliberately open to any staff member — it only reconciles.
    const syncStart = route().indexOf("'/api/church/staff/sync'");
    expect(route().slice(syncStart)).not.toContain('CHURCH_ADMIN_REQUIRED');
  });

  it('refuses self-removal so a church cannot lock itself out', () => {
    const remove = route().slice(route().indexOf("'/api/church/staff/remove'"));
    expect(remove).toContain("code: 'CANNOT_REMOVE_SELF'");
  });

  it('reconciles Harvous rows in the same request as a Clerk removal', () => {
    const remove = route().slice(route().indexOf("'/api/church/staff/remove'"));
    expect(remove.indexOf('removeClerkOrgMember')).toBeLessThan(
      remove.indexOf('syncChurchStaffForOrg'),
    );
  });

  it('gates new invites on sponsorship', () => {
    const invite = route().slice(
      route().indexOf("'/api/church/staff/invite'"),
      route().indexOf("'/api/church/staff/revoke-invite'"),
    );
    expect(invite).toContain('CHURCH_LAPSED_CODE');
    expect(invite).toContain('canInviteMoreStaff');
  });
});

describe('clerk membership webhook', () => {
  const hook = () => source('server/routes/webhooks.ts');

  it('reconciles staff on membership changes', () => {
    expect(hook()).toContain('organizationMembership.created');
    expect(hook()).toContain('handleOrgMembershipChanged');
    expect(hook()).toContain('syncChurchStaffForOrg');
  });

  it('never throws — a non-church org must not make Clerk retry user events', () => {
    const handler = hook().slice(
      hook().indexOf('async function handleOrgMembershipChanged'),
      hook().indexOf('// ─── POST /api/webhooks/clerk'),
    );
    expect(handler).toContain('catch');
    expect(handler).toContain('getActiveChurchByOrgId');
    expect(handler).not.toMatch(/throw\s/);
  });
});

describe('a granted leader is not church staff', () => {
  it('excludes grantSource=grant rows from the staff predicate', () => {
    /*
      The P5 escalation this prevents. Several callers treat "is staff" as
      sufficient with no capability check after — church billing, checkout, and
      the isStaff flag that decides whether the hub shows staff tools at all.
      Before grants existed, an owner/leader row could only have come from the
      roster sync, so the predicate was sound; a grant breaks that equivalence,
      and a youth volunteer must not reach the church's billing.
    */
    const text = source('server/utils/church-staff.ts');
    const fn = text.slice(text.indexOf('export async function isChurchStaffForOrg'));
    expect(fn).toContain('SpaceMemberships.grantSource');
    expect(fn).toContain("'grant'");
  });
});
