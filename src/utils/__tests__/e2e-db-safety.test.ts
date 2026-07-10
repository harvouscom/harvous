import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  E2E_DISPOSABLE_DB_MARKER_VALUE,
  assertDisposableDatabaseIdentity,
  e2eFixtureIds,
  readSafeE2EConfig,
  runWithVerifiedDisposableDatabase,
  supabaseProjectRefFromDatabaseUrl,
} from '../../../e2e/fixtures/e2e-db-safety';

const PROJECT_REF = 'abcdefghijklmnopqrst';
const PRODUCTION_PROJECT_REF = 'zyxwvutsrqponmlkjihg';
const DEDICATED_ROLE = 'harvous_e2e_runner';
const SAFE_ENV = {
  HARVOUS_E2E_DISPOSABLE_DB: E2E_DISPOSABLE_DB_MARKER_VALUE,
  E2E_SUPABASE_DATABASE_URL: `postgresql://${DEDICATED_ROLE}.${PROJECT_REF}:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  HARVOUS_E2E_EXPECTED_PROJECT_REF: PROJECT_REF,
  HARVOUS_E2E_PRODUCTION_PROJECT_REF: PRODUCTION_PROJECT_REF,
  HARVOUS_E2E_EXPECTED_DB_ROLE: DEDICATED_ROLE,
  HARVOUS_E2E_RUN_ID: 'pr-42 attempt 2',
  TEST_USER_A_EMAIL: 'owner@example.test',
  TEST_USER_B_EMAIL: 'member@example.test',
  TEST_USER_A_CLERK_ID: 'user_owner',
  TEST_USER_B_CLERK_ID: 'user_member',
  CLERK_SECRET_KEY: 'sk_test_example',
  PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
} satisfies NodeJS.ProcessEnv;
const SAFE_IDENTITY = {
  databaseName: 'postgres',
  currentUser: DEDICATED_ROLE,
  databaseComment: E2E_DISPOSABLE_DB_MARKER_VALUE,
  projectRef: PROJECT_REF,
};

describe('Shared Spaces E2E database safety', () => {
  it('fails closed when any collaboration prerequisite is absent', () => {
    expect(() => readSafeE2EConfig({})).toThrow(
      /Shared Spaces E2E preflight failed; missing:/,
    );
  });

  it('requires the exact destructive safety marker', () => {
    expect(() =>
      readSafeE2EConfig({
        ...SAFE_ENV,
        HARVOUS_E2E_DISPOSABLE_DB: '1',
      }),
    ).toThrow(/must exactly equal/);
  });

  it('parses direct and pooler Supabase project identities', () => {
    expect(
      supabaseProjectRefFromDatabaseUrl(
        `postgresql://postgres:secret@db.${PROJECT_REF}.supabase.co:5432/postgres`,
      ),
    ).toBe(PROJECT_REF);
    expect(
      supabaseProjectRefFromDatabaseUrl(
        SAFE_ENV.E2E_SUPABASE_DATABASE_URL,
      ),
    ).toBe(PROJECT_REF);
  });

  it('rejects unparseable or mismatched project identities', () => {
    expect(() =>
      supabaseProjectRefFromDatabaseUrl(
        'postgresql://postgres:secret@example.test:6543/postgres',
      ),
    ).toThrow(/could not unambiguously parse/);
    expect(() =>
      readSafeE2EConfig({
        ...SAFE_ENV,
        HARVOUS_E2E_EXPECTED_PROJECT_REF: 'differentprojectref12',
      }),
    ).toThrow(/does not match/);
  });

  it('rejects the known production ref even without a production URL', () => {
    expect(() =>
      readSafeE2EConfig({
        ...SAFE_ENV,
        HARVOUS_E2E_PRODUCTION_PROJECT_REF: PROJECT_REF,
      }),
    ).toThrow(/matches HARVOUS_E2E_PRODUCTION_PROJECT_REF/);
  });

  it('rejects a disposable URL that matches the declared production target', () => {
    expect(() =>
      readSafeE2EConfig({
        ...SAFE_ENV,
        PRODUCTION_SUPABASE_DATABASE_URL:
          `postgresql://other:credentials@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      }),
    ).toThrow(/matches PRODUCTION_SUPABASE_DATABASE_URL/);
  });

  it('requires Clerk test-instance key prefixes', () => {
    expect(() =>
      readSafeE2EConfig({
        ...SAFE_ENV,
        CLERK_SECRET_KEY: 'sk_live_not_allowed',
      }),
    ).toThrow(/sk_test_/);
    expect(() =>
      readSafeE2EConfig({
        ...SAFE_ENV,
        PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_not_allowed',
      }),
    ).toThrow(/pk_test_/);
  });

  it('rejects missing or wrong database-side comments', async () => {
    const config = readSafeE2EConfig(SAFE_ENV);
    await expect(
      assertDisposableDatabaseIdentity(config, async () => ({
        ...SAFE_IDENTITY,
        databaseComment: null,
      })),
    ).rejects.toThrow(/database comment must exactly equal/);
    await expect(
      assertDisposableDatabaseIdentity(config, async () => ({
        ...SAFE_IDENTITY,
        databaseComment: 'almost-disposable',
      })),
    ).rejects.toThrow(/database comment must exactly equal/);
  });

  it('rejects postgres and any role other than the dedicated role', async () => {
    const config = readSafeE2EConfig(SAFE_ENV);
    await expect(
      assertDisposableDatabaseIdentity(config, async () => ({
        ...SAFE_IDENTITY,
        currentUser: 'postgres',
      })),
    ).rejects.toThrow(/current_user must exactly equal dedicated role/);
    await expect(
      assertDisposableDatabaseIdentity(config, async () => ({
        ...SAFE_IDENTITY,
        currentUser: 'some_other_runner',
      })),
    ).rejects.toThrow(/current_user must exactly equal dedicated role/);
    expect(() =>
      readSafeE2EConfig({
        ...SAFE_ENV,
        HARVOUS_E2E_EXPECTED_DB_ROLE: 'supabase_admin',
      }),
    ).toThrow(/dedicated least-privilege role/);
  });

  it('accepts a fully valid independently queried identity', async () => {
    const config = readSafeE2EConfig(SAFE_ENV);
    await expect(
      assertDisposableDatabaseIdentity(config, async () => SAFE_IDENTITY),
    ).resolves.toEqual(SAFE_IDENTITY);
  });

  it('never invokes a destructive callback after identity rejection', async () => {
    const config = readSafeE2EConfig(SAFE_ENV);
    const identityQuery = vi.fn(async () => ({
      ...SAFE_IDENTITY,
      databaseComment: null,
    }));
    const destructiveCallback = vi.fn(async () => 'mutated');
    await expect(
      runWithVerifiedDisposableDatabase(
        config,
        identityQuery,
        destructiveCallback,
      ),
    ).rejects.toThrow(/database comment/);
    expect(identityQuery).toHaveBeenCalledOnce();
    expect(destructiveCallback).not.toHaveBeenCalled();
  });

  it('invokes a destructive callback only after full identity validation', async () => {
    const config = readSafeE2EConfig(SAFE_ENV);
    const identityQuery = vi.fn(async () => SAFE_IDENTITY);
    const destructiveCallback = vi.fn(async () => 'mutated');
    await expect(
      runWithVerifiedDisposableDatabase(
        config,
        identityQuery,
        destructiveCallback,
      ),
    ).resolves.toBe('mutated');
    expect(identityQuery).toHaveBeenCalledOnce();
    expect(destructiveCallback).toHaveBeenCalledOnce();
  });

  it('places recovery cleanup and seed mutations behind separate identity checks', () => {
    const seedSource = readFileSync(
      resolve(process.cwd(), 'scripts/seed-e2e.ts'),
      'utf8',
    );
    expect(
      seedSource.match(/await runWithVerifiedDisposableDatabase\(/g),
    ).toHaveLength(2);
    expect(seedSource).toContain('current_database()');
    expect(seedSource).toContain('current_user');
    expect(seedSource).toContain('FROM pg_database');
    expect(seedSource).toContain("shobj_description(oid, 'pg_database')");
  });

  it('namespaces every fixture identifier by the sanitized run ID', () => {
    const config = readSafeE2EConfig(SAFE_ENV);
    expect(config.runNamespace).toMatch(/^pr-42-attempt-2-[a-f0-9]{16}$/);
    expect(e2eFixtureIds(config).spaceId).toBe(
      `space_e2e_${config.runNamespace}`,
    );
  });

  it('does not collide when long run IDs share the same readable prefix', () => {
    const first = readSafeE2EConfig({
      ...SAFE_ENV,
      HARVOUS_E2E_RUN_ID: `${'same-prefix-'.repeat(8)}one`,
    });
    const second = readSafeE2EConfig({
      ...SAFE_ENV,
      HARVOUS_E2E_RUN_ID: `${'same-prefix-'.repeat(8)}two`,
    });
    expect(first.runNamespace.slice(0, 28)).toBe(
      second.runNamespace.slice(0, 28),
    );
    expect(first.runNamespace).not.toBe(second.runNamespace);
  });
});
