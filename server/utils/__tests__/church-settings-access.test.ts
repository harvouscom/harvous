import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const getActiveChurchByOrgId = vi.fn();
const isChurchStaffForOrg = vi.fn();
const churchIsSponsored = vi.fn();
const fetchClerkOrgMemberships = vi.fn();

vi.mock('../church-staff', () => ({
  getActiveChurchByOrgId: (...args: unknown[]) => getActiveChurchByOrgId(...args),
  isChurchStaffForOrg: (...args: unknown[]) => isChurchStaffForOrg(...args),
}));

vi.mock('../church-entitlement', () => ({
  churchIsSponsored: (...args: unknown[]) => churchIsSponsored(...args),
  CHURCH_LAPSED_CODE: 'CHURCH_NOT_SPONSORED',
  CHURCH_LAPSED_ERROR: 'This church does not have an active Harvous plan',
}));

vi.mock('../clerk-org', () => ({
  fetchClerkOrgMemberships: (...args: unknown[]) => fetchClerkOrgMemberships(...args),
}));

const { assertCanViewChurchSettings, assertCanManageChurchSettings } = await import(
  '../church-settings-access'
);

const CHURCH = { id: 'chur_1', orgId: 'org_1', name: 'New Hope', isActive: true };
const USER = 'user_admin';

const BOTH_GATES = [
  ['assertCanViewChurchSettings', assertCanViewChurchSettings],
  ['assertCanManageChurchSettings', assertCanManageChurchSettings],
] as const;

/** Everything passing — each test then knocks out exactly one gate. */
function allowAll() {
  getActiveChurchByOrgId.mockResolvedValue(CHURCH);
  isChurchStaffForOrg.mockResolvedValue(true);
  churchIsSponsored.mockReturnValue(true);
  fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:admin' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  allowAll();
});

describe('the church settings gates', () => {
  it('lets an admin both see and change the settings', async () => {
    expect(await assertCanViewChurchSettings(USER, 'org_1')).toEqual({ ok: true, church: CHURCH });
    expect(await assertCanManageChurchSettings(USER, 'org_1')).toEqual({ ok: true, church: CHURCH });
  });

  it.each([['org:pastor'], ['org:teacher'], ['org:member']])(
    'lets %s see the settings but not change them',
    async (role) => {
      // Knowing what time the church meets is context every staff member needs;
      // setting it is administration.
      fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role }]);
      expect((await assertCanViewChurchSettings(USER, 'org_1')).ok).toBe(true);
      expect(await assertCanManageChurchSettings(USER, 'org_1')).toMatchObject({
        ok: false,
        status: 403,
        code: 'CHURCH_SETTINGS_ROLE_REQUIRED',
      });
    },
  );

  it('lets a staff member with a role Clerk has never heard of still read', async () => {
    // Unknown roles degrade to publish-only, and the read asks for `publish`.
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:worship_leader' }]);
    expect((await assertCanViewChurchSettings(USER, 'org_1')).ok).toBe(true);
  });

  it.each(BOTH_GATES)('404s an unknown church (%s)', async (_name, gate) => {
    getActiveChurchByOrgId.mockResolvedValue(null);
    expect(await gate(USER, 'org_nope')).toMatchObject({
      ok: false,
      status: 404,
      code: 'CHURCH_NOT_FOUND',
    });
  });

  it.each(BOTH_GATES)('409s a deactivated church (%s)', async (_name, gate) => {
    getActiveChurchByOrgId.mockResolvedValue({ ...CHURCH, isActive: false });
    expect(await gate(USER, 'org_1')).toMatchObject({
      ok: false,
      status: 409,
      code: 'CHURCH_INACTIVE',
    });
  });

  it.each(BOTH_GATES)('403s a non-staff caller (%s)', async (_name, gate) => {
    isChurchStaffForOrg.mockResolvedValue(false);
    expect(await gate(USER, 'org_1')).toMatchObject({
      ok: false,
      status: 403,
      code: 'CHURCH_STAFF_REQUIRED',
    });
  });

  it('checks staff BEFORE sponsorship, so a stranger never learns a church lapsed', async () => {
    isChurchStaffForOrg.mockResolvedValue(false);
    churchIsSponsored.mockReturnValue(false);
    expect(await assertCanManageChurchSettings(USER, 'org_1')).toMatchObject({
      code: 'CHURCH_STAFF_REQUIRED',
    });
    expect(churchIsSponsored).not.toHaveBeenCalled();
  });

  it('402s a lapsed church on a write but never on a read', async () => {
    churchIsSponsored.mockReturnValue(false);
    expect(await assertCanManageChurchSettings(USER, 'org_1')).toMatchObject({
      ok: false,
      status: 402,
      code: 'CHURCH_NOT_SPONSORED',
    });
    expect(await assertCanViewChurchSettings(USER, 'org_1')).toEqual({ ok: true, church: CHURCH });
  });

  it.each(BOTH_GATES)('fails closed when Clerk is unreachable (%s)', async (_name, gate) => {
    // An outage denies both — the catch returns before any capability is read.
    fetchClerkOrgMemberships.mockRejectedValue(new Error('clerk down'));
    expect(await gate(USER, 'org_1')).toMatchObject({ ok: false, status: 403 });
  });

  it('degrades a user absent from a healthy roster to read-only, and refuses the write', async () => {
    /*
      Deliberately asymmetric with the outage case above, and worth stating.
      `isChurchStaffForOrg` has already proven this person is staff by some
      other means (they created the church, or hold an owner/leader row). Clerk
      simply has no role for them, so `capabilitiesForChurchRole(null)` is
      publish-only: enough for the read, never enough for the write.
    */
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: 'someone_else', role: 'org:admin' }]);
    expect((await assertCanViewChurchSettings(USER, 'org_1')).ok).toBe(true);
    expect(await assertCanManageChurchSettings(USER, 'org_1')).toMatchObject({
      ok: false,
      status: 403,
      code: 'CHURCH_SETTINGS_ROLE_REQUIRED',
    });
  });
});

describe('the gate composes the shared ordering rather than re-implementing it', () => {
  it('delegates to resolveChurchOrgAccess and re-checks nothing itself', () => {
    // The order (staff before sponsorship, fail-closed on Clerk) is the kind of
    // thing that goes subtly wrong on a second copy — church-staff.ts already
    // has a sibling with it backwards. This module must not grow its own.
    const module = source('server/utils/church-settings-access.ts');
    expect(module).toContain('resolveChurchOrgAccess');
    expect(module).not.toMatch(/isChurchStaffForOrg|churchIsSponsored|fetchClerkOrgMemberships/);
  });
});
