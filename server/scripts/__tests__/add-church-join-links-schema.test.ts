import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADDITIVE_CHURCH_JOIN_LINKS_DDL,
  runAddChurchJoinLinksSchema,
} from '../add-church-join-links-schema';

const schemaSource = () => readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');

function ddlColumns(table: string): string[] {
  const create = ADDITIVE_CHURCH_JOIN_LINKS_DDL.find((s) =>
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
  return [...body.matchAll(/^\s{2,4}(\w+): (?:text|integer|boolean|ts)\(/gm)].map((m) => m[1]);
}

describe('church join links migration', () => {
  it('is idempotent — re-running must be a no-op', () => {
    for (const statement of ADDITIVE_CHURCH_JOIN_LINKS_DDL) {
      const idempotent =
        statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY');
      expect(idempotent, `not idempotent: ${statement.slice(0, 60)}`).toBe(true);
    }
  });

  it('is additive only', () => {
    for (const statement of ADDITIVE_CHURCH_JOIN_LINKS_DDL) {
      expect(statement).not.toMatch(/\bDROP\b/i);
      expect(statement).not.toMatch(/\bTRUNCATE\b/i);
      expect(statement).not.toMatch(/\bDELETE\b/i);
      expect(statement).not.toMatch(/\bALTER COLUMN\b/i);
      expect(statement).not.toMatch(/\bADD COLUMN\b/i);
    }
  });

  it('touches only the table it owns — never Churches', () => {
    for (const statement of ADDITIVE_CHURCH_JOIN_LINKS_DDL) {
      const target = statement.match(/(?:TABLE|ON) (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(target).toBe('ChurchJoinLinks');
    }
  });

  it('creates every column ChurchJoinLinks declares', () => {
    expect(ddlColumns('ChurchJoinLinks').sort()).toEqual(schemaColumns('ChurchJoinLinks').sort());
  });

  it('creates both indexes schema.ts declares, the live one partial', () => {
    const text = schemaSource();
    for (const name of ['ChurchJoinLinks_token_unique', 'ChurchJoinLinks_church_live_unique']) {
      expect(text).toContain(`'${name}'`);
      expect(ADDITIVE_CHURCH_JOIN_LINKS_DDL.some((s) => s.includes(`"${name}"`))).toBe(true);
    }
    const live = ADDITIVE_CHURCH_JOIN_LINKS_DDL.find((s) =>
      s.includes('"ChurchJoinLinks_church_live_unique"'),
    );
    expect(live).toContain('UNIQUE');
    expect(live).toContain('WHERE "revokedAt" IS NULL');
  });

  it('enables RLS on the table it creates', () => {
    expect(ADDITIVE_CHURCH_JOIN_LINKS_DDL).toContain(
      'ALTER TABLE "ChurchJoinLinks" ENABLE ROW LEVEL SECURITY',
    );
  });
});

describe('church join links migration runner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dry-runs without a database target', async () => {
    await expect(
      runAddChurchJoinLinksSchema([], { NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).resolves.toBeUndefined();
    const printed = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => String(call[0]))
      .join('\n');
    expect(printed).toContain('DRY RUN');
    expect(printed).toContain('CREATE TABLE IF NOT EXISTS "ChurchJoinLinks"');
  });
});
