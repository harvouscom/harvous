import { beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveChurchByOrgId = vi.fn();
const isChurchStaffForChurch = vi.fn();
const churchIsSponsored = vi.fn();
const fetchClerkOrgMemberships = vi.fn();

vi.mock('../church-staff', () => ({
  getActiveChurchByOrgId: (...args: unknown[]) => getActiveChurchByOrgId(...args),
  isChurchStaffForChurch: (...args: unknown[]) => isChurchStaffForChurch(...args),
}));

vi.mock('../church-entitlement', () => ({
  churchIsSponsored: (...args: unknown[]) => churchIsSponsored(...args),
  CHURCH_LAPSED_CODE: 'CHURCH_NOT_SPONSORED',
  CHURCH_LAPSED_ERROR: 'This church does not have an active Harvous plan',
}));

vi.mock('../clerk-org', () => ({
  fetchClerkOrgMemberships: (...args: unknown[]) => fetchClerkOrgMemberships(...args),
}));

const { churchBillingRule, resolveChurchOrgAccess } = await import('../church-org-access');

const CHURCH = { id: 'chur_1', orgId: 'org_1', name: 'New Hope', isActive: true };
const USER = 'user_1';

const gate = () => resolveChurchOrgAccess(USER, 'org_1', churchBillingRule('Only church staff can view billing'));

beforeEach(() => {
  vi.clearAllMocks();
  getActiveChurchByOrgId.mockResolvedValue(CHURCH);
  isChurchStaffForChurch.mockResolvedValue(true);
  churchIsSponsored.mockReturnValue(true);
  fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:admin' }]);
});

describe('the church billing gate', () => {
  it('lets a church admin through', async () => {
    expect(await gate()).toEqual({ ok: true, church: CHURCH });
  });

  it.each([['org:member'], ['org:teacher'], ['org:pastor'], ['org:coordinator']])(
    'refuses %s — staff, but not the church’s money',
    async (role) => {
      fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role }]);
      expect(await gate()).toMatchObject({
        ok: false,
        status: 403,
        code: 'CHURCH_BILLING_ROLE_REQUIRED',
      });
    },
  );

  it('still lets an admin in when the church has lapsed', async () => {
    // The billing page is how a lapsed church gets un-lapsed.
    churchIsSponsored.mockReturnValue(false);
    expect((await gate()).ok).toBe(true);
  });

  it('refuses a non-staff caller with 403, never 402', async () => {
    churchIsSponsored.mockReturnValue(false);
    isChurchStaffForChurch.mockResolvedValue(false);
    expect(await gate()).toMatchObject({ ok: false, status: 403, code: 'CHURCH_STAFF_REQUIRED' });
  });

  it('fails closed when Clerk cannot confirm the role', async () => {
    fetchClerkOrgMemberships.mockRejectedValue(new Error('clerk down'));
    expect(await gate()).toMatchObject({ ok: false, status: 403 });
  });
});

describe('assertChurchStaffOrgWrite ordering', () => {
  it('proves staff before revealing sponsorship', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(process.cwd(), 'server/utils/church-staff.ts'), 'utf8');
    const body = src.slice(src.indexOf('async function assertChurchStaffOrgWrite'));
    // A stranger must get 403 on a lapsed church, never the 402 that says it lapsed.
    expect(body.indexOf('isChurchStaffForChurch(userId, church)')).toBeGreaterThan(-1);
    expect(body.indexOf('isChurchStaffForChurch(userId, church)')).toBeLessThan(
      body.indexOf('churchIsSponsored(church)'),
    );
  });
});
