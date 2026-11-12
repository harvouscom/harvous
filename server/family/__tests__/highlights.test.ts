import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { chapterHighlights, exportVerseHighlights, setVerseHighlight, verseHighlightInput } from '../highlights';
import { VERSE_HIGHLIGHT_LIMIT } from '../../../shared/child-verse-highlights';
import { FAMILY_DDL } from '../../scripts/add-child-account-schema';
import type { Child, FamilyTx } from '../service';

const child = { id: 'child-a' } as Child;
const dialect = new PgDialect();

function fakeTx(results: unknown[][] = []) {
  const wheres: any[] = [];
  const builder = (value: unknown[]): any => {
    const b: any = {
      from: () => b, orderBy: () => b,
      where: (condition: any) => { wheres.push(condition); return b; },
      then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
    };
    return b;
  };
  const onConflictDoUpdate = vi.fn().mockResolvedValue([]);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const deleteWhere = vi.fn((condition: any) => { wheres.push(condition); return Promise.resolve([]); });
  const tx = {
    select: vi.fn(() => builder(results.shift() ?? [])),
    insert: vi.fn(() => ({ values })),
    delete: vi.fn(() => ({ where: deleteWhere }))
  };
  return { tx: tx as unknown as FamilyTx, raw: tx, values, onConflictDoUpdate, wheres };
}

describe('verse highlights', () => {
  it.each([
    [{ book: 'John', chapter: 1, verse: 1, color: 'mintGreen' }, true],
    [{ book: 'John', chapter: 1, verse: 1, color: null }, true],
    [{ book: 'John', chapter: 22, verse: 1, color: 'mintGreen' }, false],
    [{ book: 'Psalms', chapter: 119, verse: 177, color: 'violet' }, false],
    [{ book: 'John', chapter: 1, verse: 1, color: 'neutral' }, false],
    [{ book: 'John', chapter: 1, verse: 1, color: 'skyBlue', note: 'hi' }, false]
  ])('accepts only a real verse and one of the five colours: %o', (input, ok) => {
    expect(verseHighlightInput.safeParse(input).success).toBe(ok);
  });

  it('reads only the signed-in child’s highlights for the chapter', async () => {
    const { tx, wheres } = fakeTx([[{ verse: 1, color: 'mintGreen' }, { verse: 3, color: 'retired' }]]);
    expect(await chapterHighlights(tx, child, 'John', 1)).toEqual([{ verse: 1, color: 'mintGreen' }]);
    expect(dialect.sqlToQuery(wheres[0]).params).toEqual(['child-a', 'John', 1]);
  });

  it('upserts the colour, and clearing deletes without inserting', async () => {
    const set = fakeTx([[{ count: 2 }]]);
    expect(await setVerseHighlight(set.tx, child, { book: 'John', chapter: 1, verse: 4, color: 'coralRose' })).toEqual({ verse: 4, color: 'coralRose' });
    expect(set.values).toHaveBeenCalledWith(expect.objectContaining({ childId: 'child-a', book: 'John', chapter: 1, verse: 4, color: 'coralRose' }));
    const clear = fakeTx();
    await setVerseHighlight(clear.tx, child, { book: 'John', chapter: 1, verse: 4, color: null });
    expect(clear.raw.insert).not.toHaveBeenCalled();
    expect(dialect.sqlToQuery(clear.wheres[0]).params).toEqual(['child-a', 'John', 1, 4]);
  });

  it('refuses a new highlight past the limit but still lets the child recolour one', async () => {
    const full = fakeTx([[{ count: VERSE_HIGHLIGHT_LIMIT }], []]);
    await expect(setVerseHighlight(full.tx, child, { book: 'John', chapter: 1, verse: 2, color: 'skyBlue' })).rejects.toMatchObject({ status: 409 });
    const swap = fakeTx([[{ count: VERSE_HIGHLIGHT_LIMIT }], [{ verse: 2 }]]);
    await setVerseHighlight(swap.tx, child, { book: 'John', chapter: 1, verse: 2, color: 'skyBlue' });
    expect(swap.raw.insert).toHaveBeenCalled();
  });

  it('exports every highlight, scoped to that child', async () => {
    const rows = [{ book: 'John', chapter: 1, verse: 4, color: 'coralRose', createdAt: new Date() }];
    const { tx, wheres } = fakeTx([rows]);
    expect(await exportVerseHighlights(tx, child)).toEqual(rows);
    expect(dialect.sqlToQuery(wheres[0]).params).toEqual(['child-a']);
  });

  it('creates highlights and the consent history so they go with the child, with RLS on', () => {
    for (const table of ['FamilyChildVerseHighlights', 'FamilyChildConsents']) {
      const create = FAMILY_DDL.find(statement => statement.includes(`CREATE TABLE IF NOT EXISTS "${table}"`));
      expect(create).toContain('REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE');
      expect(FAMILY_DDL).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('backfills consent history once per notebook, from its current agreement', () => {
    const backfill = FAMILY_DDL.find(statement => statement.includes('INSERT INTO "FamilyChildConsents"'));
    expect(backfill).toContain('FROM "FamilyChildren" c');
    expect(backfill).toContain('WHERE NOT EXISTS (SELECT 1 FROM "FamilyChildConsents" h WHERE h."childId" = c."id")');
    // Runs after the table exists.
    expect(FAMILY_DDL.indexOf(backfill!)).toBeGreaterThan(FAMILY_DDL.findIndex(statement => statement.includes('CREATE TABLE IF NOT EXISTS "FamilyChildConsents"')));
  });
});
