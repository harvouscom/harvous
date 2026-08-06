import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADDITIVE_RESOURCE_LIBRARY_DDL,
  runAddResourceLibrarySchema,
} from '../add-resource-library-schema';

const schemaSource = () =>
  readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');

/** Columns the migration creates, per table. */
function ddlColumns(table: string): string[] {
  const create = ADDITIVE_RESOURCE_LIBRARY_DDL.find((s) =>
    s.startsWith(`CREATE TABLE IF NOT EXISTS "${table}"`),
  );
  if (!create) throw new Error(`no CREATE TABLE for ${table}`);
  return [...create.matchAll(/^\s*"([A-Za-z]+)"/gm)].map((m) => m[1]);
}

/** Columns the Drizzle table declares, per table. */
function schemaColumns(table: string): string[] {
  const text = schemaSource();
  const start = text.indexOf(`export const ${table} = pgTable(`);
  if (start < 0) throw new Error(`no pgTable for ${table}`);
  // Stop at the next exported table so we only read this one's body.
  const nextExport = text.indexOf('\nexport const ', start + 1);
  const body = text.slice(start, nextExport < 0 ? undefined : nextExport);
  return [...body.matchAll(/^\s{4}(\w+): (?:text|integer|boolean|ts)\(/gm)].map((m) => m[1]);
}

describe('Resource Library migration', () => {
  it('is idempotent — re-running must be a no-op', () => {
    for (const statement of ADDITIVE_RESOURCE_LIBRARY_DDL) {
      const idempotent =
        statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY');
      expect(idempotent, `not idempotent: ${statement.slice(0, 60)}`).toBe(true);
    }
  });

  it('is additive only — never drops or rewrites existing data', () => {
    for (const statement of ADDITIVE_RESOURCE_LIBRARY_DDL) {
      expect(statement).not.toMatch(/\bDROP\b/i);
      expect(statement).not.toMatch(/\bTRUNCATE\b/i);
      expect(statement).not.toMatch(/\bDELETE\b/i);
      expect(statement).not.toMatch(/\bALTER COLUMN\b/i);
    }
  });

  it('touches only the two library tables', () => {
    const allowed = new Set(['ResourceLibraries', 'LibraryItems']);
    for (const statement of ADDITIVE_RESOURCE_LIBRARY_DDL) {
      const target = statement.match(/(?:TABLE|ON) (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(allowed.has(target ?? ''), `unexpected target: ${target}`).toBe(true);
    }
  });

  // The point of these two: schema.ts and the migration drift silently
  // otherwise, and the failure only shows up on a fresh database.
  it('creates every column ResourceLibraries declares', () => {
    expect(ddlColumns('ResourceLibraries').sort()).toEqual(
      schemaColumns('ResourceLibraries').sort(),
    );
  });

  it('creates every column LibraryItems declares', () => {
    expect(ddlColumns('LibraryItems').sort()).toEqual(schemaColumns('LibraryItems').sort());
  });

  it('creates every index the schema validator requires', () => {
    const validator = readFileSync(
      resolve(process.cwd(), 'server/db/validate-schema.ts'),
      'utf8',
    );
    const required = [
      'ResourceLibraries_owner_unique',
      'LibraryItems_libraryId_archivedAtIndex',
      'LibraryItems_libraryId_updatedAtIndex',
    ];
    const ddl = ADDITIVE_RESOURCE_LIBRARY_DDL.join('\n');
    for (const index of required) {
      expect(validator, `validator lost ${index}`).toContain(index);
      expect(ddl, `migration lost ${index}`).toContain(index);
    }
  });

  it('enables RLS on both tables', () => {
    const ddl = ADDITIVE_RESOURCE_LIBRARY_DDL.join('\n');
    expect(ddl).toContain('ALTER TABLE "ResourceLibraries" ENABLE ROW LEVEL SECURITY');
    expect(ddl).toContain('ALTER TABLE "LibraryItems" ENABLE ROW LEVEL SECURITY');
  });
});

describe('Resource Library migration runner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dry-runs without a database URL and without connecting', async () => {
    await runAddResourceLibrarySchema([], {});
    const logged = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(logged).toContain('DRY RUN');
    expect(logged).toContain('CREATE TABLE IF NOT EXISTS "ResourceLibraries"');
    expect(logged).toContain('re-run with --apply');
  });

  it('refuses to apply without SUPABASE_DIRECT_URL', async () => {
    await expect(runAddResourceLibrarySchema(['--apply'], {})).rejects.toThrow(
      /SUPABASE_DIRECT_URL/,
    );
  });
});
