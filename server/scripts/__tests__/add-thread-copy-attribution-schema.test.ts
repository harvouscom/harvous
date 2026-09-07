/**
 * Contract tests for the thread-copy attribution migration.
 *
 * The pair this holds together — the migration and `schema.ts` — drift silently
 * otherwise, and the failure only shows up on a database that never got the
 * DDL: the import route's duplicate guard depends on an index, and an index
 * that exists in Drizzle but not in Postgres refuses nothing at all.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL,
  runAddThreadCopyAttributionSchema,
} from '../add-thread-copy-attribution-schema';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const ddl = () => ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL.join('\n');

describe('thread copy attribution migration', () => {
  it('is idempotent — re-running must be a no-op', () => {
    for (const statement of ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL) {
      expect(statement.includes('IF NOT EXISTS'), `not idempotent: ${statement.slice(0, 60)}`)
        .toBe(true);
    }
  });

  it('is additive only — never drops or rewrites existing data', () => {
    for (const statement of ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL) {
      expect(statement).not.toMatch(/\bDROP\b/i);
      expect(statement).not.toMatch(/\bTRUNCATE\b/i);
      expect(statement).not.toMatch(/\bDELETE\b/i);
      expect(statement).not.toMatch(/\bALTER COLUMN\b/i);
      expect(statement).not.toMatch(/\bUPDATE\b/i);
    }
  });

  it('touches only Threads', () => {
    // The allowlist is the point: this runs against a shared dev database while
    // other branches are mid-flight, so a statement naming another table is a
    // merge accident, not a feature.
    for (const statement of ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL) {
      const target = statement.match(/(?:TABLE|ON) (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(target, `unexpected target: ${target}`).toBe('Threads');
    }
  });

  it('adds every column the schema declares, and no others', () => {
    const added = ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL.flatMap(
      (s) => s.match(/ADD COLUMN IF NOT EXISTS "(\w+)"/)?.slice(1) ?? [],
    );
    expect(added.sort()).toEqual(['copiedFromAuthorId', 'copiedFromThreadId']);
    const schema = source('server/db/schema.ts');
    for (const column of added) {
      expect(schema, `schema.ts is missing ${column}`).toContain(`${column}: text('${column}')`);
    }
  });

  it('creates the unique index under the name Drizzle and the validator use', () => {
    expect(ddl()).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Threads_copiedFromThread_unique"');
    expect(source('server/db/schema.ts')).toContain("uniqueIndex('Threads_copiedFromThread_unique')");
    expect(source('server/db/validate-schema.ts')).toContain('Threads_copiedFromThread_unique');
  });

  it('matches the schema on both the index columns and its predicate', () => {
    // A non-partial index, or one on the wrong pair, would still be *an* index
    // named right — and would either constrain the wrong thing or nothing.
    expect(ddl()).toContain('ON "Threads" ("userId", "copiedFromThreadId")');
    expect(ddl()).toContain('WHERE "copiedFromThreadId" IS NOT NULL');
    const schema = source('server/db/schema.ts');
    expect(schema).toContain('.on(table.userId, table.copiedFromThreadId)');
    expect(schema).toContain('.where(sql`${table.copiedFromThreadId} IS NOT NULL`)');
  });

  it('adds the columns before the index that constrains them', () => {
    const statements = [...ADDITIVE_THREAD_COPY_ATTRIBUTION_DDL];
    const lastColumn = statements.map((s) => s.includes('ADD COLUMN')).lastIndexOf(true);
    const index = statements.findIndex((s) => s.includes('CREATE UNIQUE INDEX'));
    expect(lastColumn).toBeLessThan(index);
  });

  it('is reachable by name from package.json', () => {
    const pkg = JSON.parse(source('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['thread-copy:schema']).toContain('add-thread-copy-attribution-schema.ts');
    expect(pkg.scripts['thread-copy:schema:apply']).toContain('--apply');
  });
});

describe('thread copy attribution migration runner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dry-runs without a database URL and without connecting', async () => {
    await runAddThreadCopyAttributionSchema([], {});
    const logged = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(logged).toContain('DRY RUN');
    expect(logged).toContain('ADD COLUMN IF NOT EXISTS "copiedFromThreadId"');
    expect(logged).toContain('re-run with --apply');
  });

  it('refuses to apply without SUPABASE_DIRECT_URL', async () => {
    await expect(runAddThreadCopyAttributionSchema(['--apply'], {})).rejects.toThrow(
      /SUPABASE_DIRECT_URL/,
    );
  });
});
