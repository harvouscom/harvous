import { beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveChurchByOrgId = vi.fn();
const churchIsSponsored = vi.fn();
const hasSharedSpacesAddOn = vi.fn();

vi.mock('../church-staff', () => ({
  getActiveChurchByOrgId: (...args: unknown[]) => getActiveChurchByOrgId(...args),
}));
vi.mock('../church-entitlement', () => ({
  churchIsSponsored: (...args: unknown[]) => churchIsSponsored(...args),
  CHURCH_LAPSED_CODE: 'CHURCH_NOT_SPONSORED',
  CHURCH_LAPSED_ERROR: 'This church does not have an active Harvous plan',
}));
vi.mock('../tier-limits', () => ({
  hasSharedSpacesAddOn: (...args: unknown[]) => hasSharedSpacesAddOn(...args),
}));

const { assertCanCreateSpaceInvite } = await import('../space-invite-gate');

const AUTH = { userId: 'user_1' } as never;
const CHURCH = { id: 'chur_1', orgId: 'org_1', isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  getActiveChurchByOrgId.mockResolvedValue(CHURCH);
  churchIsSponsored.mockReturnValue(true);
  hasSharedSpacesAddOn.mockResolvedValue(false);
});

describe('who pays for invite links', () => {
  it('lets a sponsored church room invite without the owner’s personal add-on', async () => {
    expect(await assertCanCreateSpaceInvite(AUTH, { orgId: 'org_1' })).toEqual({ ok: true });
    expect(hasSharedSpacesAddOn).not.toHaveBeenCalled();
  });

  it('refuses a lapsed church room in church terms, not an upgrade link', async () => {
    churchIsSponsored.mockReturnValue(false);
    const result = await assertCanCreateSpaceInvite(AUTH, { orgId: 'org_1' });
    expect(result).toMatchObject({ ok: false, status: 402, code: 'CHURCH_NOT_SPONSORED' });
    expect(result).not.toHaveProperty('upgradeUrl');
  });

  it('refuses a church room whose church is gone or inactive', async () => {
    getActiveChurchByOrgId.mockResolvedValue({ ...CHURCH, isActive: false });
    expect(await assertCanCreateSpaceInvite(AUTH, { orgId: 'org_1' })).toMatchObject({ status: 409 });
    getActiveChurchByOrgId.mockResolvedValue(null);
    expect(await assertCanCreateSpaceInvite(AUTH, { orgId: 'org_1' })).toMatchObject({ status: 409 });
  });

  it('still requires the personal add-on for a personal Shared Space', async () => {
    expect(await assertCanCreateSpaceInvite(AUTH, { orgId: null })).toMatchObject({
      ok: false,
      status: 403,
      code: 'SHARED_SPACE_LIMIT_EXCEEDED',
      upgradeUrl: '/upgrade',
    });
    hasSharedSpacesAddOn.mockResolvedValue(true);
    expect(await assertCanCreateSpaceInvite(AUTH, { orgId: null })).toEqual({ ok: true });
  });
});
