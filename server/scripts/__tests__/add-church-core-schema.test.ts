import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIVE_CHURCH_CORE_DDL } from '../add-church-core-schema';

const schemaSource = () => readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');

function ddlColumns(table: string): string[] {
  const create = ADDITIVE_CHURCH_CORE_DDL.find((s) => s.startsWith(`CREATE TABLE IF NOT EXISTS "${table}"`));
  if (!create) throw new Error(`no CREATE TABLE for ${table}`);
  return [...create.matchAll(/^\s*"([A-Za-z]+)"/gm)].map((m) => m[1]).sort();
}

function schemaColumns(table: string): string[] {
  const text = schemaSource();
  const start = text.indexOf(`export const ${table} = pgTable(`);
  if (start < 0) throw new Error(`no pgTable for ${table}`);
  const end = text.indexOf('}, (table)', start);
  const body = text.slice(start, end);
  return [...body.matchAll(/^\s+(\w+): (?:text|integer|boolean|ts)\(/gm)].map((m) => m[1]).sort();
}

const TABLES = ['ChurchMemberships', 'ChurchServiceTimes', 'ChurchServiceTimeAssignments', 'ChurchServices'];

describe('church core schema script', () => {
  it('is idempotent and additive', () => {
    for (const statement of ADDITIVE_CHURCH_CORE_DDL) {
      expect(
        statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY'),
        statement.slice(0, 60),
      ).toBe(true);
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|DELETE|ALTER COLUMN)\b/i);
    }
  });

  it.each(TABLES)('creates exactly the columns schema.ts declares for %s', (table) => {
    expect(ddlColumns(table)).toEqual(schemaColumns(table));
  });

  it('turns on RLS for every table it creates', () => {
    for (const table of TABLES) {
      expect(ADDITIVE_CHURCH_CORE_DDL).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('keeps the one-gathering-per-room-per-date guarantee', () => {
    expect(ADDITIVE_CHURCH_CORE_DDL.join('\n')).toContain(
      `"ChurchServices_space_date_unique" ON "ChurchServices" ("spaceId", "serviceDate") WHERE "spaceId" IS NOT NULL AND "kind" = 'gathering'`,
    );
  });
});
