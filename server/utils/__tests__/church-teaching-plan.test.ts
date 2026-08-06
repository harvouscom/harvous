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

vi.mock('../db', () => ({
  db: {},
  first: (rows: unknown[]) => rows?.[0],
  ChurchServices: {},
  Notes: {},
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
  asc: vi.fn(),
}));

const { assertCanManageTeachingPlan, assertCanViewTeachingPlan } = await import(
  '../church-teaching-plan',
);

/** Both gates share one ordering; anything about the order is asserted on both. */
const BOTH_GATES = [
  ['assertCanViewTeachingPlan', assertCanViewTeachingPlan],
  ['assertCanManageTeachingPlan', assertCanManageTeachingPlan],
] as const;

const CHURCH = { id: 'chur_1', orgId: 'org_1', name: 'New Hope', isActive: true };
const USER = 'user_pastor';

/** Everything passing — each test then knocks out exactly one gate. */
function allowAll() {
  getActiveChurchByOrgId.mockResolvedValue(CHURCH);
  isChurchStaffForOrg.mockResolvedValue(true);
  churchIsSponsored.mockReturnValue(true);
  fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:pastor' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  allowAll();
});

describe('the teaching plan gates', () => {
  it('lets a pastor both see the plan and reshape it', async () => {
    expect(await assertCanViewTeachingPlan(USER, 'org_1')).toEqual({ ok: true, church: CHURCH });
    expect(await assertCanManageTeachingPlan(USER, 'org_1')).toEqual({ ok: true, church: CHURCH });
  });

  it.each([['org:pastor'], ['org:teacher'], ['org:admin']])(
    'lets %s see the plan',
    async (role) => {
      fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role }]);
      expect((await assertCanViewTeachingPlan(USER, 'org_1')).ok).toBe(true);
    },
  );

  it.each([['org:pastor'], ['org:admin']])('lets %s reshape the plan', async (role) => {
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role }]);
    expect((await assertCanManageTeachingPlan(USER, 'org_1')).ok).toBe(true);
  });

  it('lets a teacher read the plan but not reshape it', async () => {
    // The whole point of the split: a teacher teaches from what's planned and
    // must be able to see it, without deciding what the church teaches.
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:teacher' }]);
    expect((await assertCanViewTeachingPlan(USER, 'org_1')).ok).toBe(true);
    expect(await assertCanManageTeachingPlan(USER, 'org_1')).toMatchObject({
      ok: false,
      status: 403,
      code: 'TEACHING_PLAN_ROLE_REQUIRED',
    });
  });

  it('refuses a plain staff member either way — publishing is not planning', async () => {
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:member' }]);
    expect(await assertCanViewTeachingPlan(USER, 'org_1')).toMatchObject({
      ok: false,
      status: 403,
      code: 'SERMON_TOOLS_REQUIRED',
    });
    expect(await assertCanManageTeachingPlan(USER, 'org_1')).toMatchObject({
      ok: false,
      status: 403,
      code: 'TEACHING_PLAN_ROLE_REQUIRED',
    });
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

  it('402s a lapsed church on a write', async () => {
    churchIsSponsored.mockReturnValue(false);
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ ok: false, status: 402, code: 'CHURCH_NOT_SPONSORED' });
  });

  it('never sponsorship-gates the read — a lapsed church still sees its own plan', async () => {
    // church-entitlement.ts: "Lapsing is a write gate, never a read gate."
    // Losing a church's study is never how a lapse shows up.
    churchIsSponsored.mockReturnValue(false);
    expect(await assertCanViewTeachingPlan(USER, 'org_1')).toEqual({ ok: true, church: CHURCH });
    expect(churchIsSponsored).not.toHaveBeenCalled();
  });

  it('checks staff BEFORE sponsorship, so a stranger never learns a church lapsed', async () => {
    // The pre-existing assertChurchStaffOrgWrite has these the other way round,
    // which leaks billing state to any signed-in user. Don't regress to that.
    isChurchStaffForOrg.mockResolvedValue(false);
    churchIsSponsored.mockReturnValue(false);
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ code: 'CHURCH_STAFF_REQUIRED' });
    expect(churchIsSponsored).not.toHaveBeenCalled();
  });

  it.each([
    ['assertCanViewTeachingPlan', assertCanViewTeachingPlan, 'SERMON_TOOLS_REQUIRED'],
    ['assertCanManageTeachingPlan', assertCanManageTeachingPlan, 'TEACHING_PLAN_ROLE_REQUIRED'],
  ] as const)('fails closed when Clerk is unreachable (%s)', async (_name, gate, code) => {
    // A Clerk outage must not let a plain staff member publish what the whole
    // congregation sees on Sunday.
    fetchClerkOrgMemberships.mockRejectedValue(new Error('clerk down'));
    expect(await gate(USER, 'org_1')).toMatchObject({ ok: false, status: 403, code });
  });

  it.each([
    ['assertCanViewTeachingPlan', assertCanViewTeachingPlan, 'SERMON_TOOLS_REQUIRED'],
    ['assertCanManageTeachingPlan', assertCanManageTeachingPlan, 'TEACHING_PLAN_ROLE_REQUIRED'],
  ] as const)('fails closed for a user missing from the roster (%s)', async (_name, gate, code) => {
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: 'someone_else', role: 'org:admin' }]);
    expect(await gate(USER, 'org_1')).toMatchObject({ ok: false, code });
  });
});

describe('privacy: the church never learns who took notes', () => {
  /** Source with comments stripped — assertions are about code, not prose. */
  const planCode = () =>
    source('server/utils/church-teaching-plan.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('reads startedFromServiceId only when scoped to one user', () => {
    const code = planCode();
    // Every read of the lineage column must live inside resolveViewerServiceNotes,
    // which filters on Notes.userId. A second reader anywhere fails this.
    const readerBody = code.slice(code.indexOf('export async function resolveViewerServiceNotes'));
    expect(readerBody).toContain('eq(Notes.userId, userId)');

    const occurrences = code.split('Notes.startedFromServiceId').length - 1;
    const inReader = readerBody.split('Notes.startedFromServiceId').length - 1;
    expect(occurrences).toBeGreaterThan(0);
    expect(occurrences).toBe(inReader);
  });

  it('never aggregates over the teaching plan', () => {
    const code = planCode();
    expect(code).not.toMatch(/\bcount\(/);
    expect(code).not.toMatch(/\bgroupBy\b/);
  });
});
