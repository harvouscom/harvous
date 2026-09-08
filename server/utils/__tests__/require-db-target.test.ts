/**
 * The guard's behaviour at the two moments that matter: a write aimed at the live database,
 * and a read that must not be made annoying enough to get removed.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_ACK_FLAG,
  decideDbTarget,
  effectiveDatabaseUrl,
} from '../require-db-target';
import { PRODUCTION_SUPABASE_PROJECT_REF } from '@/utils/supabase-project-ref';

const PROD = `postgresql://postgres.${PRODUCTION_SUPABASE_PROJECT_REF}:pw@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;
const OTHER = 'postgresql://postgres.zzzzzzzzzzzzzzzzz:pw@aws-1-eu-west-2.pooler.supabase.com:5432/postgres';
const decide = (url: string | undefined, writes: boolean, argv: readonly string[] = []) =>
  decideDbTarget({ url, writes, argv, scriptName: 'test-script' });

describe('writing to production', () => {
  it('is refused without the flag', () => {
    const d = decide(PROD, true);
    expect(d.allowed).toBe(false);
    expect(d.message).toMatch(/refusing to write/);
    expect(d.message).toMatch(/PRODUCTION/);
  });

  it('says what the flag is, so the message is actionable', () => {
    expect(decide(PROD, true).message).toContain(PRODUCTION_ACK_FLAG);
  });

  it('proceeds once acknowledged, and says so', () => {
    const d = decide(PROD, true, [PRODUCTION_ACK_FLAG]);
    expect(d.allowed).toBe(true);
    expect(d.message).toMatch(/acknowledged/);
  });

  it('never prints the password in any branch', () => {
    for (const d of [decide(PROD, true), decide(PROD, true, [PRODUCTION_ACK_FLAG]), decide(PROD, false)]) {
      expect(d.message).not.toContain('pw@');
    }
  });
});

describe('a target it cannot identify', () => {
  it('is refused for writes, because production cannot be ruled out', () => {
    const d = decide('postgresql://localhost:5432/harvous', true);
    expect(d.allowed).toBe(false);
    expect(d.message).toMatch(/could not be read/);
  });

  it('stays out of the way when no URL is configured at all', () => {
    // Nothing to be pointed at, so nothing to protect — and each script's own error names the
    // variable that is missing, which is more useful than the guard's.
    for (const url of [undefined, '', '   ']) {
      const d = decide(url, true);
      expect(d.allowed).toBe(true);
      expect(d.message).toMatch(/no database configured/);
    }
  });
});

describe('a project it positively cleared', () => {
  it('proceeds without ceremony', () => {
    const d = decide(OTHER, true);
    expect(d.allowed).toBe(true);
    expect(d.message).toMatch(/not production/);
  });
});

describe('reads', () => {
  it('are never refused, including against production', () => {
    // A guard that makes `list-recent-deleted-notes` demand a flag is a guard that gets
    // deleted. Reads damage nothing; they only need to say where they are pointed.
    for (const url of [PROD, OTHER, undefined]) {
      expect(decide(url, false).allowed).toBe(true);
    }
  });

  it('still name the target', () => {
    expect(decide(PROD, false).message).toMatch(/PRODUCTION/);
  });
});

describe('effectiveDatabaseUrl', () => {
  it('resolves the way server/db/client.ts does, so the guard checks the real connection', () => {
    expect(effectiveDatabaseUrl({ SUPABASE_DATABASE_URL: 'a', SUPABASE_DIRECT_URL: 'b' })).toBe('a');
    expect(effectiveDatabaseUrl({ SUPABASE_DIRECT_URL: 'b' })).toBe('b');
    expect(effectiveDatabaseUrl({})).toBeUndefined();
  });
});
