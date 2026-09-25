import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIVE_CHURCH_MINISTRIES_DDL } from '../add-church-ministries-schema';

const schemaSource = () => readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');
function schemaColumns(table: string): string[] {
  const text = schemaSource();
  const start = text.indexOf(`export const ${table} = pgTable(`);
  const nextExport = text.indexOf('\nexport const ', start + 1);
  const body = text.slice(start, nextExport < 0 ? undefined : nextExport);
  return [...body.matchAll(/^\s{2,4}(\w+): (?:text|integer|boolean|ts|real)\(/gm)].map((m) => m[1]);
}
function ddlColumns(table: string): string[] {
  const create = ADDITIVE_CHURCH_MINISTRIES_DDL.find((s) => s.startsWith(`CREATE TABLE IF NOT EXISTS "${table}"`))!;
  return [...create.matchAll(/^\s*"([A-Za-z]+)"/gm)].map((m) => m[1]);
}

describe('church ministries migration', () => {
  it('is idempotent and additive only', () => {
    for (const statement of ADDITIVE_CHURCH_MINISTRIES_DDL) {
      expect(statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY'), statement.slice(0, 60)).toBe(true);
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|DELETE|ALTER COLUMN)\b/i);
    }
  });

  it('touches only its own tables and two Spaces columns', () => {
    const allowed = new Set(['ChurchMinistries', 'ChurchMinistryStaff', 'Spaces']);
    for (const statement of ADDITIVE_CHURCH_MINISTRIES_DDL) {
      const target = statement.match(/(?:TABLE|ON) (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(allowed.has(target ?? ''), `unexpected target: ${target}`).toBe(true);
    }
    const spaces = ADDITIVE_CHURCH_MINISTRIES_DDL.filter((s) => s.includes('ADD COLUMN'));
    expect(spaces.map((s) => s.match(/ADD COLUMN IF NOT EXISTS "(\w+)"/)?.[1]).sort()).toEqual(['audience', 'ministryId']);
  });

  it('gives audience a constant default, so the add is instant and every channel stays open', () => {
    const audience = ADDITIVE_CHURCH_MINISTRIES_DDL.find((s) => s.includes('"audience"'))!;
    expect(audience).toContain("NOT NULL DEFAULT 'church'");
    expect(schemaSource()).toContain("audience: text('audience').notNull().default('church')");
  });

  it('creates every column its tables declare', () => {
    for (const table of ['ChurchMinistries', 'ChurchMinistryStaff']) {
      expect(ddlColumns(table).sort()).toEqual(schemaColumns(table).sort());
    }
    expect(schemaColumns('Spaces')).toEqual(expect.arrayContaining(['ministryId', 'audience']));
  });

  it('enables RLS on both tables it creates', () => {
    expect(ADDITIVE_CHURCH_MINISTRIES_DDL).toContain('ALTER TABLE "ChurchMinistries" ENABLE ROW LEVEL SECURITY');
    expect(ADDITIVE_CHURCH_MINISTRIES_DDL).toContain('ALTER TABLE "ChurchMinistryStaff" ENABLE ROW LEVEL SECURITY');
  });
});
