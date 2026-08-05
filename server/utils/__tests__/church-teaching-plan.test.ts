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

const { assertCanManageTeachingPlan, deriveSeriesTitles } = await import(
  '../church-teaching-plan',
);

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

describe('assertCanManageTeachingPlan', () => {
  it('lets a pastor through', async () => {
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toEqual({ ok: true, church: CHURCH });
  });

  it.each([['org:teacher'], ['org:admin']])('lets %s through too', async (role) => {
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role }]);
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result.ok).toBe(true);
  });

  it('refuses a plain staff member — publishing is not planning', async () => {
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:member' }]);
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ ok: false, status: 403, code: 'SERMON_TOOLS_REQUIRED' });
  });

  it('404s an unknown church', async () => {
    getActiveChurchByOrgId.mockResolvedValue(null);
    const result = await assertCanManageTeachingPlan(USER, 'org_nope');
    expect(result).toMatchObject({ ok: false, status: 404, code: 'CHURCH_NOT_FOUND' });
  });

  it('409s a deactivated church', async () => {
    getActiveChurchByOrgId.mockResolvedValue({ ...CHURCH, isActive: false });
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ ok: false, status: 409, code: 'CHURCH_INACTIVE' });
  });

  it('403s a non-staff caller', async () => {
    isChurchStaffForOrg.mockResolvedValue(false);
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ ok: false, status: 403, code: 'CHURCH_STAFF_REQUIRED' });
  });

  it('402s a lapsed church — writes stop, reads never do', async () => {
    churchIsSponsored.mockReturnValue(false);
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ ok: false, status: 402, code: 'CHURCH_NOT_SPONSORED' });
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

  it('fails closed when Clerk is unreachable', async () => {
    // A Clerk outage must not let a plain staff member publish what the whole
    // congregation sees on Sunday.
    fetchClerkOrgMemberships.mockRejectedValue(new Error('clerk down'));
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ ok: false, status: 403, code: 'SERMON_TOOLS_REQUIRED' });
  });

  it('fails closed for a user missing from the roster', async () => {
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: 'someone_else', role: 'org:admin' }]);
    const result = await assertCanManageTeachingPlan(USER, 'org_1');
    expect(result).toMatchObject({ ok: false, code: 'SERMON_TOOLS_REQUIRED' });
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

describe('deriveSeriesTitles', () => {
  /** Rows arrive from the plan query in `serviceDate ASC` order. */
  const svc = (seriesTitle: string | null) => ({ seriesTitle });

  it('returns the most recently dated series first', () => {
    // The bug this replaced: reusing the ascending query order put the
    // church's oldest series at the top of the editor's picker, so the one a
    // pastor is adding a week to sat at the bottom.
    expect(deriveSeriesTitles([svc('Advent 2024'), svc('Romans'), svc('Life in the Spirit')])).toEqual([
      'Life in the Spirit',
      'Romans',
      'Advent 2024',
    ]);
  });

  it('de-duplicates a multi-week series down to one entry, at its latest use', () => {
    const rows = [svc('Romans'), svc('Advent'), svc('Romans'), svc('Romans')];
    expect(deriveSeriesTitles(rows)).toEqual(['Romans', 'Advent']);
  });

  it('drops services with no series, including whitespace-only ones', () => {
    expect(deriveSeriesTitles([svc(null), svc('   '), svc('Romans')])).toEqual(['Romans']);
  });

  it('trims, so " Romans " and "Romans" are one series', () => {
    expect(deriveSeriesTitles([svc('Romans'), svc(' Romans ')])).toEqual(['Romans']);
  });

  it('is empty for a plan with no series at all', () => {
    expect(deriveSeriesTitles([])).toEqual([]);
    expect(deriveSeriesTitles([svc(null), svc(null)])).toEqual([]);
  });
});
