import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
vi.mock('../../db/client', () => ({ db: {} }));
import { startingChildTranslation } from '../bible';
import type { FamilyTx } from '../service';

/** A transaction whose `BibleVerses` lookups find text only for the given translations. */
function databaseWith(...withText: string[]) {
  const asked: string[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: (condition: SQL) => ({
          limit: async () => {
            const translation = new PgDialect().sqlToQuery(condition).params[0] as string;
            asked.push(translation);
            return withText.includes(translation) ? [{ verse: 1 }] : [];
          },
        }),
      }),
    }),
  } as unknown as FamilyTx;
  return { tx, asked };
}

describe('the translation a new notebook starts on', () => {
  it('is ERV when the young-reader editions are loaded', async () => {
    const { tx, asked } = databaseWith('ERV', 'CEV', 'NLV', 'BSB');
    expect(await startingChildTranslation(tx)).toBe('ERV');
    expect(asked).toEqual(['ERV']);
  });
  it('skips a young-reader edition with no text', async () => {
    expect(await startingChildTranslation(databaseWith('CEV', 'BSB').tx)).toBe('CEV');
  });
  it('falls back to the older defaults when none of the young-reader editions are loaded', async () => {
    expect(await startingChildTranslation(databaseWith('NIV').tx)).toBe('NIV');
  });
  it('is BSB when the database has none of them', async () => {
    expect(await startingChildTranslation(databaseWith().tx)).toBe('BSB');
  });
});
