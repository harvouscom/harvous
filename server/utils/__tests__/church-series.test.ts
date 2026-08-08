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
    ChurchSeries: {
      id: 'id',
      churchId: 'churchId',
      spaceId: 'spaceId',
      title: 'title',
      color: 'color',
      description: 'description',
      runLabel: 'runLabel',
      createdAt: 'createdAt',
    },
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

const {
  nextFreeRunLabel,
  resolveSeriesForWrite,
  updateSeries,
  findOrCreateSeries,
  isSeriesColor,
  SERIES_TITLE_MAX,
  SERIES_DESCRIPTION_MAX,
} = await import('../church-series');

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

describe('updateSeries', () => {
  it('refuses an empty name', async () => {
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { title: '   ' });
    expect(result).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('refuses a name another series in the same plan already holds', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_other' }]);
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { title: 'Romans' });
    expect(result).toMatchObject({ ok: false, code: 'SERIES_TITLE_TAKEN' });
  });

  it('allows a rename that resolves to the same row (a case fix)', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_1' }]);
    updateReturning.mockResolvedValue([{ id: 'csrs_1', title: 'Romans' }]);
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { title: 'Romans' });
    expect(result).toMatchObject({ ok: true });
  });

  it('reports a series outside this plan as not found', async () => {
    selectRows.mockResolvedValue([]);
    updateReturning.mockResolvedValue([]);
    const result = await updateSeries(YOUTH_SCOPE, 'csrs_church_plan', { title: 'Anything' });
    expect(result).toMatchObject({ ok: false, code: 'SERIES_NOT_FOUND' });
  });

  it('recolours without touching the title, so it cannot race a rename', async () => {
    updateReturning.mockResolvedValue([{ id: 'csrs_1', title: 'Romans', color: 'purple' }]);
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { color: 'purple' });
    expect(result).toMatchObject({ ok: true });
    // No uniqueness lookup fires when the title was not sent — that read is the
    // rename's, and borrowing it here would make a colour change fail on a
    // clash that has nothing to do with it.
    expect(selectRows).not.toHaveBeenCalled();
  });

  it('refuses a colour outside the palette rather than storing null', async () => {
    // Silently dropping it would show the pastor a colour they did not pick.
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { color: 'chartreuse' });
    expect(result).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(updateReturning).not.toHaveBeenCalled();
  });

  it('accepts an explicit null colour as "not chosen"', async () => {
    updateReturning.mockResolvedValue([{ id: 'csrs_1', title: 'Romans', color: null }]);
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { color: null });
    expect(result).toMatchObject({ ok: true });
  });

  it('stores a blank description as null, not as an empty string', async () => {
    updateReturning.mockResolvedValue([{ id: 'csrs_1', title: 'Romans', description: null }]);
    await updateSeries(CHURCH_SCOPE, 'csrs_1', { description: '   ' });
    expect(updateReturning).toHaveBeenCalled();
  });

  it('refuses a patch with nothing in it', async () => {
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', {});
    expect(result).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
    expect(updateReturning).not.toHaveBeenCalled();
  });

  it('refuses a rename that would collide with a labelled run', async () => {
    /*
      Locks the behaviour, but note what this harness can and cannot show: the db mock
      ignores WHERE clauses, so it cannot demonstrate that the lookup is now
      runLabel-aware (the old `findSeriesByTitle` filtered `runLabel IS NULL` and would
      have matched here too). The runLabel-only case below is the test that actually
      fails against the old code.
    */
    selectRows.mockResolvedValue([{ id: 'csrs_other', title: 'Advent', runLabel: '2027' }]);
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { title: 'Advent' });
    expect(result).toMatchObject({ ok: false, code: 'SERIES_TITLE_TAKEN' });
  });

  it('checks a runLabel-only change, which used to be checked nowhere', async () => {
    // The re-run flow calls exactly this shape — updateSeries(scope, id, { runLabel }).
    selectRows.mockResolvedValue([{ id: 'csrs_other', title: 'Advent', runLabel: null }]);
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { runLabel: '2027' });
    expect(result).toMatchObject({ ok: false, code: 'SERIES_TITLE_TAKEN' });
  });

  it('translates a lost uniqueness race instead of letting it 500', async () => {
    // The pre-check cannot be atomic; the index is the authority and its rejection is
    // a sentence the UI can show, not a database error.
    selectRows.mockResolvedValue([{ id: 'csrs_1', title: 'Advent', runLabel: null }]);
    updateReturning.mockImplementationOnce(() => {
      throw Object.assign(new Error('Failed query: update "ChurchSeries"'), {
        cause: { constraint_name: 'ChurchSeries_church_title_run_unique' },
      });
    });
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', { title: 'Advent' });
    expect(result).toMatchObject({ ok: false, code: 'SERIES_TITLE_TAKEN' });
  });

  it('caps a long description rather than refusing it', async () => {
    updateReturning.mockResolvedValue([{ id: 'csrs_1', title: 'Romans' }]);
    const result = await updateSeries(CHURCH_SCOPE, 'csrs_1', {
      description: 'x'.repeat(SERIES_DESCRIPTION_MAX + 50),
    });
    expect(result).toMatchObject({ ok: true });
  });
});

describe('isSeriesColor', () => {
  it('accepts the picker palette and nothing else', () => {
    for (const color of ['blue', 'purple', 'orange', 'green', 'pink']) {
      expect(isSeriesColor(color), color).toBe(true);
    }
    // Paper and cream are out for the same reason they are out of the space
    // cover picker: at a rail's width neither survives the page behind it.
    expect(isSeriesColor('paper')).toBe(false);
    expect(isSeriesColor('yellow')).toBe(false);
    expect(isSeriesColor(null)).toBe(false);
    expect(isSeriesColor('#ff0000')).toBe(false);
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

describe('seasonal runs', () => {
  /*
    The constraint this feature relaxes was built to stop a typo forking a
    series, and it is right about that — it just could not tell a typo from
    Advent coming round again. These pin both halves: the fork guard still
    holds, and a labelled run can exist beside an unlabelled one.
  */
  it('resolves a typed series name against the UNLABELLED run only', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_advent_plain' }]);
    const result = await resolveSeriesForWrite({
      scope: CHURCH_SCOPE,
      seriesTitle: 'Advent',
      userId: 'u1',
    });
    expect(result).toMatchObject({ ok: true, seriesId: 'csrs_advent_plain' });
    /*
      The load-bearing assertion. Without `runLabel IS NULL` in that lookup, a
      church with "Advent · 2026" and "Advent · 2027" would have a free-text
      combobox that resolves to whichever row came back first — so typing
      "Advent" on a new sermon could silently file it under last year's run.
    */
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('keeps the typo guard: a case variant still resolves, never forks', async () => {
    selectRows.mockResolvedValue([{ id: 'csrs_spirit' }]);
    const result = await resolveSeriesForWrite({
      scope: CHURCH_SCOPE,
      seriesTitle: 'Life In The Spirit',
      userId: 'u1',
    });
    expect(result).toMatchObject({ ok: true, seriesId: 'csrs_spirit' });
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe('nextFreeRunLabel', () => {
  it('takes the year when it is free', async () => {
    selectRows.mockResolvedValue([]);
    expect(await nextFreeRunLabel(CHURCH_SCOPE, 'Advent', '2027')).toBe('2027');
  });

  it('steps past a year already in use', async () => {
    /*
      The bug this exists for: re-running a study a few months after the first
      run means both want the same year. Left alone, the second run claims the
      year, the source's own labelling then violates the unique index, and the
      route 500s *after* creating the series — leaving a run with no weeks in
      it. Stepping to "2026 (2)" keeps both runs labelled and distinguishable.
    */
    let call = 0;
    selectRows.mockImplementation(async () => (++call === 1 ? [{ id: 'csrs_taken' }] : []));
    expect(await nextFreeRunLabel(CHURCH_SCOPE, 'Hello World', '2026')).toBe('2026 (2)');
  });

  it('keeps stepping while labels are taken', async () => {
    let call = 0;
    selectRows.mockImplementation(async () => (++call <= 2 ? [{ id: 'csrs_taken' }] : []));
    expect(await nextFreeRunLabel(CHURCH_SCOPE, 'Advent', '2026')).toBe('2026 (3)');
  });

  it('falls back rather than looping forever', async () => {
    // Bounded on purpose — an unbounded search against a unique index is how a
    // save hangs. Twenty runs of one name in one plan is not a real church.
    selectRows.mockResolvedValue([{ id: 'csrs_taken' }]);
    const label = await nextFreeRunLabel(CHURCH_SCOPE, 'Advent', '2026');
    expect(label).toMatch(/^2026 \(\d+\)$/);
  });
});
