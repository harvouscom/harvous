import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIVE_CHURCH_CONTENT_DDL } from '../add-church-content-schema';

const schemaSource = () => readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');
function schemaColumns(table: string): string[] {
  const text = schemaSource();
  const start = text.indexOf(`export const ${table} = pgTable(`);
  const nextExport = text.indexOf('\nexport const ', start + 1);
  const body = text.slice(start, nextExport < 0 ? undefined : nextExport);
  return [...body.matchAll(/^\s{2,4}(\w+): (?:text|integer|boolean|ts|real)\(/gm)].map((m) => m[1]);
}

describe('church content migration', () => {
  it('is idempotent and additive only', () => {
    for (const statement of ADDITIVE_CHURCH_CONTENT_DDL) {
      expect(statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY'), statement.slice(0, 60)).toBe(true);
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|DELETE|ALTER COLUMN)\b/i);
    }
  });

  it('creates every column the schema declares for submissions', () => {
    const create = ADDITIVE_CHURCH_CONTENT_DDL.find((s) => s.startsWith('CREATE TABLE IF NOT EXISTS "ChurchContentSubmissions"'))!;
    const ddl = [...create.matchAll(/^\s*"([A-Za-z]+)"/gm)].map((m) => m[1]);
    expect(ddl.sort()).toEqual(schemaColumns('ChurchContentSubmissions').sort());
  });

  it('adds contentApproval to Churches, off by default', () => {
    expect(schemaColumns('Churches')).toContain('contentApproval');
    expect(ADDITIVE_CHURCH_CONTENT_DDL.join('\n')).toContain(
      `ALTER TABLE "Churches" ADD COLUMN IF NOT EXISTS "contentApproval" boolean NOT NULL DEFAULT false`,
    );
  });

  it('enables RLS on the new table', () => {
    expect(ADDITIVE_CHURCH_CONTENT_DDL).toContain('ALTER TABLE "ChurchContentSubmissions" ENABLE ROW LEVEL SECURITY');
  });
});
