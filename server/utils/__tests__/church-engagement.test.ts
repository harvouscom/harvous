import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resolveChurchOrgAccess = vi.fn();
const spaceRows = vi.fn();
const membershipRows = vi.fn();
const metadataRows = vi.fn();

vi.mock('../church-org-access', () => ({
  resolveChurchOrgAccess: (...args: unknown[]) => resolveChurchOrgAccess(...args),
}));

/* '../../db', not '../db' — see the note in church-space-plan.test.ts. */
vi.mock('../../db', () => {
  const SPACES = { __table: 'Spaces' };
  const MEMBERSHIPS = { __table: 'SpaceMemberships' };
  const METADATA = { __table: 'UserMetadata' };
  /*
    Each `from()` returns its OWN chain bound to that table. A module-level
    "last table seen" tracker looks simpler and is wrong here: getChurchEngagement
    runs its two queries in Promise.all, so the second `from()` overwrites the
    first before either `where()` resolves, and both reads answer with the same
    table's rows.
  */
  // Compared by name, not identity: the exported table objects below spread
  // these sentinels into new ones, so `table === MEMBERSHIPS` is never true and
  // every read would quietly answer with the wrong table's rows.
  const rowsFor = (table: { __table: string }) => {
    if (table.__table === MEMBERSHIPS.__table) return membershipRows();
    if (table.__table === METADATA.__table) return metadataRows();
    return spaceRows();
  };
  const chainFor = (table: { __table: string }) => {
    const bound = {
      where: () => Object.assign(Promise.resolve(rowsFor(table)), bound),
      groupBy: () => rowsFor(table),
    };
    return bound;
  };
  const chain = {
    select: () => chain,
    from: (table: { __table: string }) => chainFor(table),
  };
  return {
    db: chain,
    Spaces: { ...SPACES, id: 'id', title: 'title', type: 'type', orgId: 'orgId', isActive: 'isActive', deletedAt: 'deletedAt' },
    SpaceMemberships: { ...MEMBERSHIPS, spaceId: 'spaceId', role: 'role' },
    UserMetadata: { ...METADATA, connectedChurchId: 'connectedChurchId' },
    and: (...args: unknown[]) => ({ op: 'and', args }),
    eq: (col: unknown, value: unknown) => ({ op: 'eq', col, value }),
    inArray: vi.fn(),
    isNull: vi.fn(),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
      {},
    ),
  };
});

const { assertCanViewChurchEngagement, getChurchEngagement } = await import('../church-engagement');

const CHURCH = { id: 'chur_1', orgId: 'org_1' };

beforeEach(() => {
  vi.clearAllMocks();
  spaceRows.mockResolvedValue([]);
  membershipRows.mockResolvedValue([]);
  metadataRows.mockResolvedValue([{ n: 0 }]);
});

describe('assertCanViewChurchEngagement', () => {
  it('asks for manage_staff and is never sponsorship-gated', async () => {
    resolveChurchOrgAccess.mockResolvedValue({ ok: true, church: CHURCH });
    await assertCanViewChurchEngagement('user_admin', 'org_1');
    expect(resolveChurchOrgAccess).toHaveBeenCalledWith(
      'user_admin',
      'org_1',
      expect.objectContaining({ capability: 'manage_staff', sponsorshipGated: false }),
    );
  });

  it('passes the shared resolver’s verdict through untouched', async () => {
    const denial = { ok: false, status: 403, code: 'CHURCH_STAFF_REQUIRED', error: 'nope' };
    resolveChurchOrgAccess.mockResolvedValue(denial);
    await expect(assertCanViewChurchEngagement('u', 'org_1')).resolves.toBe(denial);
  });
});

describe('getChurchEngagement', () => {
  it('counts only ministry channels, not the church’s shared spaces', async () => {
    spaceRows.mockResolvedValue([
      { id: 'space_youth', title: 'Youth', type: 'public', orgId: 'org_1' },
      // A church Shared Space: an org room, but not something anyone follows.
      { id: 'space_prep', title: 'Teaching prep', type: 'shared', orgId: 'org_1' },
    ]);
    membershipRows.mockResolvedValue([{ spaceId: 'space_youth', n: 12 }]);

    const result = await getChurchEngagement(CHURCH);
    expect(result.channels).toEqual([
      { spaceId: 'space_youth', title: 'Youth', followerCount: 12 },
    ]);
  });

  it('reports a channel nobody follows as zero rather than omitting it', async () => {
    spaceRows.mockResolvedValue([
      { id: 'space_youth', title: 'Youth', type: 'public', orgId: 'org_1' },
      { id: 'space_new', title: 'Young adults', type: 'public', orgId: 'org_1' },
    ]);
    membershipRows.mockResolvedValue([{ spaceId: 'space_youth', n: 3 }]);

    const result = await getChurchEngagement(CHURCH);
    expect(result.channels).toEqual([
      { spaceId: 'space_youth', title: 'Youth', followerCount: 3 },
      { spaceId: 'space_new', title: 'Young adults', followerCount: 0 },
    ]);
  });

  it('skips the membership query entirely when there are no channels', async () => {
    spaceRows.mockResolvedValue([{ id: 'space_prep', title: 'Prep', type: 'shared', orgId: 'org_1' }]);
    const result = await getChurchEngagement(CHURCH);
    expect(result.channels).toEqual([]);
    expect(membershipRows).not.toHaveBeenCalled();
  });

  it('counts connected congregants by church id, not the denormalized org id', async () => {
    metadataRows.mockResolvedValue([{ n: 42 }]);
    const result = await getChurchEngagement(CHURCH);
    expect(result.connectedCount).toBe(42);
  });
});

/*
  The contracts. These read source rather than behaviour because what they
  protect cannot be observed from outside: a future edit that adds a name to a
  SELECT, or reaches into Notes, would pass every assertion above.
*/
describe('privacy contracts: counts, never people', () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
  const strip = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const engagementCode = () => strip(source('server/utils/church-engagement.ts'));
  const engagementRoute = () => strip(source('server/routes/church-engagement.ts'));

  it('never touches Notes, in the helper or the route', () => {
    // "Review is never shared." A pastor learns how many people are here, never
    // who wrote anything or whether anyone wrote at all.
    for (const code of [engagementCode(), engagementRoute()]) {
      expect(code).not.toMatch(/\bNotes\b/);
      expect(code).not.toMatch(/startedFromServiceId/);
      expect(code).not.toMatch(/startedFromServiceTitle/);
    }
  });

  it('selects no user column — count(*) is the only thing that leaves the DB', () => {
    const code = engagementCode();
    // A count and a grouping key are the whole vocabulary. A `userId` *column*
    // reference is the failure this file exists to prevent — the gate's own
    // `userId` argument is how it knows who is asking, and never a projection.
    expect(code).not.toMatch(/\w+\.userId\b/);
    expect(code).not.toMatch(/firstName|lastName|displayName|emailAddress/);
    expect(code).not.toMatch(/profileImageUrl/);
  });

  it('aggregates every membership read rather than listing rows', () => {
    const code = engagementCode();
    const selects = code.match(/\.select\(\{[\s\S]*?\}\)/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      // Spaces are listed by id and title on purpose — a channel's name is the
      // church's own. Everything else must be a count.
      const isSpaceList = select.includes('Spaces.title');
      expect(isSpaceList || select.includes('count(*)'), `un-aggregated select: ${select}`).toBe(true);
    }
  });

  it('has no write half — engagement is observed, never set', () => {
    const route = engagementRoute();
    expect(route).not.toMatch(/app\.post|app\.put|app\.patch|app\.delete/);
    expect(engagementCode()).not.toMatch(/db\.(insert|update|delete)\(/);
  });

  /*
    The count that is deliberately absent. If a future change wants it, this
    test failing is the intended speed bump — the roadmap sanctions two numbers,
    and a note count would be the first church-facing read of the congregant's
    own lineage column.
  */
  it('does not count sermon-started notes', () => {
    expect(engagementCode()).not.toMatch(/sermonStarted|noteCount|notesPerWeek/);
  });
});
