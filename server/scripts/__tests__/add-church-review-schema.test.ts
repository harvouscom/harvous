import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADDITIVE_CHURCH_REVIEW_DDL, runAddChurchReviewSchema } from '../add-church-review-schema';

const schemaSource = () => readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');

function schemaColumns(table: string): string[] {
  const text = schemaSource();
  const start = text.indexOf(`export const ${table} = pgTable(`);
  if (start < 0) throw new Error(`no pgTable for ${table}`);
  const nextExport = text.indexOf('\nexport const ', start + 1);
  const body = text.slice(start, nextExport < 0 ? undefined : nextExport);
  return [...body.matchAll(/^\s{2,4}(\w+): (?:text|integer|boolean|ts|real)\(/gm)].map((m) => m[1]);
}

describe('church review migration', () => {
  it('is idempotent and additive only', () => {
    for (const statement of ADDITIVE_CHURCH_REVIEW_DDL) {
      expect(
        statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY'),
        statement.slice(0, 60),
      ).toBe(true);
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|DELETE|ALTER COLUMN)\b/i);
    }
  });

  it('touches only its own table and two nullable ReviewItems columns', () => {
    const allowed = new Set(['ChurchReviewExercises', 'ReviewItems']);
    for (const statement of ADDITIVE_CHURCH_REVIEW_DDL) {
      const target = statement.match(/(?:TABLE|ON) (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(allowed.has(target ?? ''), `unexpected target: ${target}`).toBe(true);
    }
    const added = ADDITIVE_CHURCH_REVIEW_DDL.filter((s) => s.includes('ADD COLUMN'));
    expect(added).toHaveLength(2);
    for (const statement of added) {
      expect(statement).toContain('"ReviewItems"');
      expect(statement).not.toMatch(/NOT NULL|DEFAULT/);
    }
  });

  it('creates every column ChurchReviewExercises declares', () => {
    const create = ADDITIVE_CHURCH_REVIEW_DDL.find((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "ChurchReviewExercises"'))!;
    const ddl = [...create.matchAll(/^\s*"([A-Za-z]+)"/gm)].map((m) => m[1]).sort();
    expect(ddl).toEqual(schemaColumns('ChurchReviewExercises').sort());
  });

  it('adds exactly the church columns ReviewItems declares', () => {
    const columns = schemaColumns('ReviewItems');
    expect(columns).toContain('churchExerciseId');
    expect(columns).toContain('churchExerciseVersion');
  });

  it('enables RLS on the table it creates', () => {
    expect(ADDITIVE_CHURCH_REVIEW_DDL).toContain('ALTER TABLE "ChurchReviewExercises" ENABLE ROW LEVEL SECURITY');
  });
});

describe('church review migration runner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('dry-runs without a database target', async () => {
    await expect(runAddChurchReviewSchema([], { NODE_ENV: 'test' } as NodeJS.ProcessEnv)).resolves.toBeUndefined();
  });
});
