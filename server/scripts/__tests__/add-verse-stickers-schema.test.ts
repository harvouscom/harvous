/**
 * Contract tests for the verse-stickers migration: additive, idempotent, only `VerseStickers`, and
 * in step with schema.ts (a column Drizzle declares but Postgres lacks fails every select).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ADDITIVE_VERSE_STICKERS_DDL, runAddVerseStickersSchema } from '../add-verse-stickers-schema';

describe('verse stickers migration', () => {
  it('is idempotent and additive only', () => {
    for (const statement of ADDITIVE_VERSE_STICKERS_DDL) {
      expect(/IF NOT EXISTS|ENABLE ROW LEVEL SECURITY/.test(statement), statement.slice(0, 60)).toBe(true);
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER COLUMN)\b/i);
    }
  });

  it('touches only VerseStickers', () => {
    for (const statement of ADDITIVE_VERSE_STICKERS_DDL) {
      expect(statement.match(/TABLE (?:IF NOT EXISTS )?"(\w+)"/)?.[1]).toBe('VerseStickers');
    }
  });

  it('creates every column the schema declares, keyed by user and verse', () => {
    const create = ADDITIVE_VERSE_STICKERS_DDL[0];
    const schema = readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');
    const block = schema.slice(schema.indexOf("pgTable('VerseStickers'"), schema.indexOf("pgTable('VerseTextCache'"));
    const declared = [...block.matchAll(/(\w+): (?:text|integer|ts)\('(\w+)'\)/g)].map((m) => m[2]);
    expect(declared.sort()).toEqual(['book', 'chapter', 'createdAt', 'sticker', 'updatedAt', 'userId', 'verse']);
    for (const column of declared) expect(create).toContain(`"${column}"`);
    expect(create).toContain('PRIMARY KEY ("userId", "book", "chapter", "verse")');
  });

  it('opens no connection without --apply', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runAddVerseStickersSchema([], {});
    expect(log.mock.calls.flat().join('\n')).toContain('DRY RUN');
    log.mockRestore();
  });
});
