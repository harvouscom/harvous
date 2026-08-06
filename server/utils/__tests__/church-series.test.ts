import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const selectRows = vi.fn();
const insertValues = vi.fn();
const onConflictDoNothing = vi.fn();
const updateReturning = vi.fn();

/*
  '../../db', not '../db' — vi.mock resolves relative to *this* file, so '../db'
  would name `server/utils/db`, which does not exist, and the mock would
  silently no-op while the real Supabase client was constructed. Same note as
  church-space-plan.test.ts.
*/
vi.mock('../../db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => chain,
    orderBy: () => selectRows(),
    limit: () => selectRows(),
    insert: () => chain,
    values: (row: unknown) => { insertValues(row); return chain; },
    onConflictDoNothing: () => onConflictDoNothing(),
    update: () => chain,
    set: () => chain,
    returning: () => updateReturning(),
    delete: () => chain,
    transaction: async (fn: (tx: unknown) => Promise<void>) => fn(chain),
  };
  return {
    db: chain,
    first: (rows: unknown[]) => rows?.[0],
    ChurchSeries: { id: 'id', churchId: 'churchId', spaceId: 'spaceId', title: 'title', createdAt: 'createdAt' },
    ChurchServices: { id: 'id', seriesId: 'seriesId', serviceDate: 'serviceDate' },
    and: (...args: unknown[]) => ({ op: 'and', args }),
    asc: vi.fn(),
    desc: vi.fn(),
    eq: (col: unknown, value: unknown) => ({ op: 'eq', col, value }),
    inArray: vi.fn(),
    isNull: (col: unknown) => ({ op: 'isNull', col }),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
      {},
    ),
  };
});

const { resolveSeriesForWrite, renameSeries, findOrCreateSeries, SERIES_TITLE_MAX } = await import(
  '../church-series'
);

const CHURCH_SCOPE = { churchId: 'chur_1', spaceId: null };
const YOUTH_SCOPE = { churchId: 'chur_1', spaceId: 'space_youth' };

beforeEach(() => {
  vi.clearAllMocks();
  selectRows.mockResolvedValue([]);
  insertValues.mockReturnValue(undefined);
  onConflictDoNothing.mockResolvedValue(undefined);
  updateReturning.mockResolvedValue([]);
});

describe('resolveSeriesForWrite', () => {
  it('leaves the sermon unattached when neither key is sent', async () => {
    const result = await resolveSeriesForWrite({ scope: CHURCH_SCOPE, userId: 'u1' });
    expect(result).toEqual({ ok: true, seriesId: null });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('detaches on an explicit null, either grain', async () => {
    expect(await resolveSeriesForWrite({ scope: CHURCH_SCOPE, seriesId: null, userId: 'u1' })).toEqual({
      ok: true,
      seriesId: null,
    });
    expect(
      await resolveSeriesForWrite({ scope: CHURCH_SCOPE, seriesTitle: null, userId: 'u1' }),
    ).toEqual({ ok: true, seriesId: null });
  });

  it('accepts a seriesId that is in this plan', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_1' }]);
    const result = await resolveSeriesForWrite({
      scope: CHURCH_SCOPE,
      seriesId: 'csrs_1',
      userId: 'u1',
    });
    expect(result).toEqual({ ok: true, seriesId: 'csrs_1' });
  });

  /*
    The cross-scope guard, and the reason it cannot be an index: no constraint
    can see which plan a foreign id belongs to. A granted volunteer leader
    editing Youth must not be able to point a gathering at a church-plan series
    — that is the row they could then rename.
  */
  it('refuses a seriesId from another plan as SERIES_NOT_FOUND, not a 403', async () => {
    selectRows.mockResolvedValue([]);
    const result = await resolveSeriesForWrite({
      scope: YOUTH_SCOPE,
      seriesId: 'csrs_church_plan',
      userId: 'volunteer',
    });
    expect(result).toEqual({
      ok: false,
      code: 'SERIES_NOT_FOUND',
      error: 'That series is not part of this plan',
    });
  });

  it('creates the row when given a name that does not exist yet', async () => {
    // Miss, insert, then the re-read that settles which row won.
    selectRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'csrs_new' }]);
    const result = await resolveSeriesForWrite({
      scope: CHURCH_SCOPE,
      seriesTitle: 'Life in the Spirit',
      userId: 'user_pastor',
    });
    expect(result.ok).toBe(true);
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toMatchObject({
      churchId: 'chur_1',
      spaceId: null,
      title: 'Life in the Spirit',
      createdBy: 'user_pastor',
    });
  });

  it('reuses the existing row rather than minting a twin', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_existing' }]);
    const result = await resolveSeriesForWrite({
      scope: CHURCH_SCOPE,
      seriesTitle: 'life IN the spirit',
      userId: 'u1',
    });
    expect(result).toEqual({ ok: true, seriesId: 'csrs_existing' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('trims and caps the title it stores', async () => {
    selectRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'csrs_new' }]);
    await resolveSeriesForWrite({
      scope: CHURCH_SCOPE,
      seriesTitle: `  ${'x'.repeat(SERIES_TITLE_MAX + 40)}  `,
      userId: 'u1',
    });
    expect(String(insertValues.mock.calls[0][0].title)).toHaveLength(SERIES_TITLE_MAX);
  });

  it('prefers seriesId over seriesTitle when a caller sends both', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_picked' }]);
    const result = await resolveSeriesForWrite({
      scope: CHURCH_SCOPE,
      seriesId: 'csrs_picked',
      seriesTitle: 'Something Else',
      userId: 'u1',
    });
    expect(result).toEqual({ ok: true, seriesId: 'csrs_picked' });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('carries the space scope onto rows it creates', async () => {
    selectRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'csrs_new' }]);
    await resolveSeriesForWrite({ scope: YOUTH_SCOPE, seriesTitle: 'Identity', userId: 'u1' });
    expect(insertValues.mock.calls[0][0]).toMatchObject({ spaceId: 'space_youth' });
  });
});

describe('findOrCreateSeries', () => {
  /*
    The SELECT is not the guard — two staff saving week 4 at once both find
    nothing and both insert. The loser must end up on the winner's row.
  */
  it('re-reads and returns the winner when it loses the unique-index race', async () => {
    selectRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'csrs_winner' }]);
    await expect(findOrCreateSeries(CHURCH_SCOPE, 'Romans', 'u1')).resolves.toBe('csrs_winner');
  });

  /*
    Why DO NOTHING rather than catching the violation: this runs inside the
    sermon's transaction, and a raised unique violation aborts that transaction
    — taking the sermon down with the series it was naming.
  */
  it('never lets a title collision raise, so the caller’s transaction survives', async () => {
    selectRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'csrs_winner' }]);
    await findOrCreateSeries(CHURCH_SCOPE, 'Romans', 'u1');
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it('throws when the row cannot be resolved even after inserting', async () => {
    selectRows.mockResolvedValue([]);
    await expect(findOrCreateSeries(CHURCH_SCOPE, 'Romans', 'u1')).rejects.toThrow(
      'Could not resolve series',
    );
  });

  it('accepts a transaction and uses it for every statement', async () => {
    const tx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'csrs_tx' }]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      findOrCreateSeries(CHURCH_SCOPE, 'Romans', 'u1', tx as never),
    ).resolves.toBe('csrs_tx');
    expect(tx.insert).toHaveBeenCalled();
    // Nothing may leak onto the outer connection, or the rollback misses it.
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe('renameSeries', () => {
  it('refuses an empty name', async () => {
    const result = await renameSeries(CHURCH_SCOPE, 'csrs_1', '   ');
    expect(result).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('refuses a name another series in the same plan already holds', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_other' }]);
    const result = await renameSeries(CHURCH_SCOPE, 'csrs_1', 'Romans');
    expect(result).toMatchObject({ ok: false, code: 'SERIES_TITLE_TAKEN' });
  });

  it('allows a rename that resolves to the same row (a case fix)', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_1' }]);
    updateReturning.mockResolvedValue([{ id: 'csrs_1', title: 'Romans' }]);
    const result = await renameSeries(CHURCH_SCOPE, 'csrs_1', 'Romans');
    expect(result).toMatchObject({ ok: true });
  });

  it('reports a series outside this plan as not found', async () => {
    selectRows.mockResolvedValue([]);
    updateReturning.mockResolvedValue([]);
    const result = await renameSeries(YOUTH_SCOPE, 'csrs_church_plan', 'Anything');
    expect(result).toMatchObject({ ok: false, code: 'SERIES_NOT_FOUND' });
  });
});

/*
  Contract tests. These read source rather than behaviour because what they
  protect is structural: a future edit that reintroduces the string, or that
  makes a series reachable across plan scopes, would pass every unit test above.
*/
describe('series contracts', () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
  const seriesCode = () =>
    source('server/utils/church-series.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

  it('never reads Notes — series are church data, engagement is not', () => {
    // "Review is never shared." A series page shows what was taught, never who
    // took notes on it; the only reader of that lineage stays viewer-scoped in
    // church-teaching-plan.ts.
    expect(seriesCode()).not.toMatch(/\bNotes\b/);
    expect(seriesCode()).not.toMatch(/startedFromServiceId/);
  });

  it('scopes every query through the one scope predicate', () => {
    const code = seriesCode();
    // `eq(spaceId, null)` matches nothing in SQL, so a query that built its own
    // scope clause would hand the church plan an empty list rather than error.
    const scopeUses = code.split('scopeWhere(').length - 1;
    expect(scopeUses).toBeGreaterThanOrEqual(6);
    expect(code).not.toMatch(/eq\(ChurchSeries\.spaceId, null\)/);
  });

  it('holds no gate of its own — callers gate first', () => {
    const code = seriesCode();
    expect(code).not.toMatch(/assertCan/);
    expect(code).not.toMatch(/capabilitiesForChurchRole/);
  });

  it('deleting a series detaches sermons instead of deleting them', () => {
    const code = seriesCode();
    const deleteBody = code.slice(code.indexOf('export async function deleteSeries'));
    expect(deleteBody).toMatch(/set\(\{ seriesId: null \}\)/);
    expect(deleteBody).not.toMatch(/delete\(ChurchServices\)/);
  });
});
