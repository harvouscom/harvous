import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL,
  runAddSpaceStudySuggestionsSchema,
} from '../add-space-study-suggestions-schema';

const schemaSource = () => readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');

function ddlColumns(table: string): string[] {
  const create = ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL.find((s) =>
    s.startsWith(`CREATE TABLE IF NOT EXISTS "${table}"`),
  );
  if (!create) throw new Error(`no CREATE TABLE for ${table}`);
  return [...create.matchAll(/^\s*"([A-Za-z]+)"/gm)].map((m) => m[1]);
}

function schemaColumns(table: string): string[] {
  const text = schemaSource();
  const start = text.indexOf(`export const ${table} = pgTable(`);
  if (start < 0) throw new Error(`no pgTable for ${table}`);
  const nextExport = text.indexOf('\nexport const ', start + 1);
  const body = text.slice(start, nextExport < 0 ? undefined : nextExport);
  return [...body.matchAll(/^\s{4}(\w+): (?:text|integer|boolean|ts)\(/gm)].map((m) => m[1]);
}

describe('space study suggestions migration', () => {
  it('is idempotent — re-running must be a no-op', () => {
    for (const statement of ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL) {
      const idempotent =
        statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY');
      expect(idempotent, `not idempotent: ${statement.slice(0, 60)}`).toBe(true);
    }
  });

  it('is additive only', () => {
    for (const statement of ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL) {
      expect(statement).not.toMatch(/\bDROP\b/i);
      expect(statement).not.toMatch(/\bTRUNCATE\b/i);
      expect(statement).not.toMatch(/\bDELETE\b/i);
      expect(statement).not.toMatch(/\bALTER COLUMN\b/i);
    }
  });

  it('touches only the suggestions table and the one Spaces column', () => {
    const allowed = new Set(['Spaces', 'SpaceStudySuggestions']);
    for (const statement of ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL) {
      const target = statement.match(/(?:TABLE|ON) (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(allowed.has(target ?? ''), `unexpected target: ${target}`).toBe(true);
    }
    const spacesStatements = ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL.filter((s) =>
      s.includes('"Spaces"'),
    );
    expect(spacesStatements).toHaveLength(1);
    expect(spacesStatements[0]).toContain('ADD COLUMN IF NOT EXISTS "studyPlanningMode"');
  });

  it('creates every column SpaceStudySuggestions declares', () => {
    expect(ddlColumns('SpaceStudySuggestions').sort()).toEqual(
      schemaColumns('SpaceStudySuggestions').sort(),
    );
  });

  it('declares studyPlanningMode on Spaces with the same default as the DDL', () => {
    expect(schemaColumns('Spaces')).toContain('studyPlanningMode');
    expect(schemaSource()).toContain("studyPlanningMode: text('studyPlanningMode').notNull().default('off')");
  });

  it('enables RLS on the table it creates', () => {
    const created = ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL.flatMap(
      (s) => s.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/)?.slice(1) ?? [],
    );
    const secured = ADDITIVE_SPACE_STUDY_SUGGESTIONS_DDL.flatMap(
      (s) => s.match(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/)?.slice(1) ?? [],
    );
    expect(created.sort()).toEqual(secured.sort());
  });
});

describe('space study suggestions migration runner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dry-runs without a database target', async () => {
    await expect(
      runAddSpaceStudySuggestionsSchema([], { NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).resolves.toBeUndefined();
    const printed = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => String(call[0]))
      .join('\n');
    expect(printed).toContain('DRY RUN');
    expect(printed).toContain('CREATE TABLE IF NOT EXISTS "SpaceStudySuggestions"');
  });
});
