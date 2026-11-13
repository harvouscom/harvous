import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { chapterStickers, exportVerseStickers, setVerseSticker, verseStickerInput } from '../stickers';
import { VERSE_STICKER_LIMIT, verseStickers } from '../../../shared/child-verse-stickers';
import { coverSymbols } from '../../../shared/child-notebook';
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

describe('verse stickers', () => {
  it('offers every cover sticker except the child’s initial', () => {
    expect(verseStickers).toEqual(coverSymbols.filter(symbol => symbol !== 'initial'));
  });

  it.each([
    [{ book: 'Psalms', chapter: 23, verse: 1, sticker: 'star' }, true],
    [{ book: 'Psalms', chapter: 23, verse: 1, sticker: null }, true],
    [{ book: 'Psalms', chapter: 151, verse: 1, sticker: 'star' }, false],
    [{ book: 'Hezekiah', chapter: 1, verse: 1, sticker: 'star' }, false],
    [{ book: 'Psalms', chapter: 119, verse: 177, sticker: 'star' }, false],
    [{ book: 'Psalms', chapter: 23, verse: 1, sticker: 'initial' }, false],
    // The grown-up themes are the adult reader's only; a child's My Bible never offers them.
    [{ book: 'Psalms', chapter: 23, verse: 1, sticker: 'scale-balanced' }, false],
    [{ book: 'Psalms', chapter: 23, verse: 1, sticker: 'star', note: 'hi' }, false]
  ])('accepts only a real verse and a sticker from the set: %o', (input, ok) => {
    expect(verseStickerInput.safeParse(input).success).toBe(ok);
  });

  it('reads only the signed-in child’s stickers for the chapter', async () => {
    const { tx, wheres } = fakeTx([[{ verse: 1, sticker: 'star' }, { verse: 4, sticker: 'retired-sticker' }]]);
    expect(await chapterStickers(tx, child, 'Psalms', 23)).toEqual([{ verse: 1, sticker: 'star' }]);
    expect(dialect.sqlToQuery(wheres[0]).params).toEqual(['child-a', 'Psalms', 23]);
  });

  it('upserts a sticker for the child at that verse', async () => {
    const { tx, values, onConflictDoUpdate } = fakeTx([[{ count: 3 }]]);
    expect(await setVerseSticker(tx, child, { book: 'Psalms', chapter: 23, verse: 1, sticker: 'sun' })).toEqual({ verse: 1, sticker: 'sun' });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ childId: 'child-a', book: 'Psalms', chapter: 23, verse: 1, sticker: 'sun' }));
    expect(onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({ set: expect.objectContaining({ sticker: 'sun' }) }));
  });

  it('takes a sticker off without inserting anything', async () => {
    const { tx, raw, wheres } = fakeTx();
    await setVerseSticker(tx, child, { book: 'Psalms', chapter: 23, verse: 1, sticker: null });
    expect(raw.insert).not.toHaveBeenCalled();
    expect(dialect.sqlToQuery(wheres[0]).params).toEqual(['child-a', 'Psalms', 23, 1]);
  });

  it('refuses a new sticker past the limit but still lets the child swap one', async () => {
    const full = fakeTx([[{ count: VERSE_STICKER_LIMIT }], []]);
    await expect(setVerseSticker(full.tx, child, { book: 'Psalms', chapter: 23, verse: 2, sticker: 'sun' })).rejects.toMatchObject({ status: 409 });
    expect(full.raw.insert).not.toHaveBeenCalled();
    const swap = fakeTx([[{ count: VERSE_STICKER_LIMIT }], [{ verse: 2 }]]);
    await setVerseSticker(swap.tx, child, { book: 'Psalms', chapter: 23, verse: 2, sticker: 'sun' });
    expect(swap.raw.insert).toHaveBeenCalled();
  });

  it('exports every sticker the child placed, scoped to that child', async () => {
    const rows = [{ book: 'John', chapter: 1, verse: 5, sticker: 'sun', createdAt: new Date() }];
    const { tx, wheres } = fakeTx([rows]);
    expect(await exportVerseStickers(tx, child)).toEqual(rows);
    expect(dialect.sqlToQuery(wheres[0]).params).toEqual(['child-a']);
  });

  it('creates the table so deleting the child deletes its stickers, with RLS on', () => {
    const create = FAMILY_DDL.find(statement => statement.includes('CREATE TABLE IF NOT EXISTS "FamilyChildVerseStickers"'));
    expect(create).toContain('REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE');
    expect(FAMILY_DDL).toContain('ALTER TABLE "FamilyChildVerseStickers" ENABLE ROW LEVEL SECURITY');
  });
});
