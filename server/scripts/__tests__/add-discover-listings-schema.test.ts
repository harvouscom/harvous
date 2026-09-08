import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADDITIVE_DISCOVER_LISTINGS_DDL,
  runAddDiscoverListingsSchema,
} from '../add-discover-listings-schema';

const schemaSource = () => readFileSync(resolve(process.cwd(), 'server/db/schema.ts'), 'utf8');

function ddlColumns(table: string): string[] {
  const create = ADDITIVE_DISCOVER_LISTINGS_DDL.find((s) =>
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

describe('discover listings migration', () => {
  it('is idempotent — re-running must be a no-op', () => {
    for (const statement of ADDITIVE_DISCOVER_LISTINGS_DDL) {
      const idempotent =
        statement.includes('IF NOT EXISTS') || statement.includes('ENABLE ROW LEVEL SECURITY');
      expect(idempotent, `not idempotent: ${statement.slice(0, 60)}`).toBe(true);
    }
  });

  it('is additive only', () => {
    for (const statement of ADDITIVE_DISCOVER_LISTINGS_DDL) {
      expect(statement).not.toMatch(/\bDROP\b/i);
      expect(statement).not.toMatch(/\bTRUNCATE\b/i);
      expect(statement).not.toMatch(/\bDELETE\b/i);
      expect(statement).not.toMatch(/\bALTER COLUMN\b/i);
    }
  });

  it('touches only the two new tables — nothing that already holds data', () => {
    const allowed = new Set(['DiscoverListings', 'DiscoverInstalls']);
    for (const statement of ADDITIVE_DISCOVER_LISTINGS_DDL) {
      const target = statement.match(/(?:TABLE|ON) (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(allowed.has(target ?? ''), `unexpected target: ${target}`).toBe(true);
    }
  });

  it('adds no column to any existing table', () => {
    for (const statement of ADDITIVE_DISCOVER_LISTINGS_DDL) {
      expect(statement).not.toMatch(/\bADD COLUMN\b/i);
    }
  });

  it('creates every column DiscoverListings declares', () => {
    expect(ddlColumns('DiscoverListings').sort()).toEqual(schemaColumns('DiscoverListings').sort());
  });

  it('creates every column DiscoverInstalls declares', () => {
    expect(ddlColumns('DiscoverInstalls').sort()).toEqual(schemaColumns('DiscoverInstalls').sort());
  });

  it('keeps the slug unique index partial, so pending rows cannot collide', () => {
    const slugIndex = ADDITIVE_DISCOVER_LISTINGS_DDL.find((s) =>
      s.includes('"DiscoverListings_slug_unique"'),
    );
    expect(slugIndex).toBeDefined();
    expect(slugIndex).toContain('CREATE UNIQUE INDEX');
    expect(slugIndex).toContain('WHERE "slug" IS NOT NULL');
    expect(schemaSource()).toContain("uniqueIndex('DiscoverListings_slug_unique')");
  });

  it('makes the install idempotency key unique — the guard is the index, not a check', () => {
    const installIndex = ADDITIVE_DISCOVER_LISTINGS_DDL.find((s) =>
      s.includes('"DiscoverInstalls_listing_user_unique"'),
    );
    expect(installIndex).toContain('CREATE UNIQUE INDEX');
    expect(installIndex).toContain('("listingId", "userId")');
  });

  it('enables RLS on every table it creates', () => {
    const created = ADDITIVE_DISCOVER_LISTINGS_DDL.flatMap(
      (s) => s.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/)?.slice(1) ?? [],
    );
    const secured = ADDITIVE_DISCOVER_LISTINGS_DDL.flatMap(
      (s) => s.match(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/)?.slice(1) ?? [],
    );
    expect(created.sort()).toEqual(secured.sort());
  });
});

describe('discover listings migration runner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dry-runs without a database target', async () => {
    await expect(
      runAddDiscoverListingsSchema([], { NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).resolves.toBeUndefined();
    const printed = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((call) => String(call[0]))
      .join('\n');
    expect(printed).toContain('DRY RUN');
    expect(printed).toContain('CREATE TABLE IF NOT EXISTS "DiscoverListings"');
  });
});
