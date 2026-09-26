import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDITIVE_LEADER_KIT_DDL } from '../add-leader-kit-schema';

const source = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
function schemaColumns(table: string): string[] {
  const text = source('server/db/schema.ts');
  const start = text.indexOf(`export const ${table} = pgTable(`);
  const nextExport = text.indexOf('\nexport const ', start + 1);
  const body = text.slice(start, nextExport < 0 ? undefined : nextExport);
  return [...body.matchAll(/^\s{2,4}(\w+): (?:text|integer|boolean|ts|real)\(/gm)].map((m) => m[1]);
}
function ddlColumns(table: string): string[] {
  const create = ADDITIVE_LEADER_KIT_DDL.find((s) => s.startsWith(`CREATE TABLE IF NOT EXISTS "${table}"`))!;
  return [...create.matchAll(/^\s*"([A-Za-z]+)"/gm)].map((m) => m[1]);
}
const TABLES = ['StudyPlanStepGuides', 'GatheringAgendas', 'StudyPlanLibraryItems', 'StudyPlanCopyBaselines'];

describe('leader kit migration', () => {
  it('is idempotent and additive only', () => {
    for (const statement of ADDITIVE_LEADER_KIT_DDL) {
      expect(statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY'), statement.slice(0, 60)).toBe(true);
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|DELETE|ALTER COLUMN)\b/i);
    }
  });

  it('touches only its own four tables', () => {
    for (const statement of ADDITIVE_LEADER_KIT_DDL) {
      const table = /"(\w+)"/.exec(statement.replace(/INDEX IF NOT EXISTS "\w+" ON/, 'ON'))?.[1];
      expect(TABLES, statement.slice(0, 80)).toContain(table);
    }
  });

  it.each(TABLES)('creates every column the schema declares for %s, with RLS on', (table) => {
    expect(ddlColumns(table).sort()).toEqual(schemaColumns(table).sort());
    expect(ADDITIVE_LEADER_KIT_DDL).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  });

  it('is named in validate-schema, with its guarantees', () => {
    const text = source('server/db/validate-schema.ts');
    for (const table of TABLES) expect(text).toContain(`'${table}'`);
    expect(text).toContain('StudyPlanStepGuides_thread_note_unique');
    expect(text).toContain('StudyPlanCopyBaselines_threadId_unique');
  });
});
