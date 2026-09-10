/**
 * The guard's decision table.
 *
 * The case worth staring at is `unknown`. It is not "probably fine" — a connection string this
 * cannot parse might be production reached by some route the regexes do not know, and a guard
 * whose failure mode is "proceed silently" is not a guard.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  classifyDbTarget,
  describeDbTarget,
  supabaseProjectRefFromUrl,
  writeNeedsConfirmation,
} from '../supabase-project-ref';

const REF = PRODUCTION_SUPABASE_PROJECT_REF;
const POOLER = `postgresql://postgres.${REF}:s3cret@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;
const DIRECT = `postgresql://postgres:s3cret@db.${REF}.supabase.co:5432/postgres`;
const OTHER_POOLER = 'postgresql://postgres.abcdefghijklmnopq:pw@aws-1-eu-west-2.pooler.supabase.com:5432/postgres';

describe('supabaseProjectRefFromUrl', () => {
  it('reads the ref from a pooler string, where it lives in the username', () => {
    expect(supabaseProjectRefFromUrl(POOLER)).toBe(REF);
  });

  it('reads the ref from a direct string, where it lives in the host', () => {
    expect(supabaseProjectRefFromUrl(DIRECT)).toBe(REF);
  });

  it('is case-insensitive', () => {
    expect(supabaseProjectRefFromUrl(DIRECT.toUpperCase())).toBe(REF);
  });

  it('returns null rather than guessing', () => {
    expect(supabaseProjectRefFromUrl('postgresql://localhost:5432/harvous')).toBeNull();
    expect(supabaseProjectRefFromUrl('')).toBeNull();
    expect(supabaseProjectRefFromUrl(undefined)).toBeNull();
  });

  it('does not mistake a password that resembles a ref for the ref', () => {
    const ref = supabaseProjectRefFromUrl(
      'postgresql://postgres:mhriprqpyvhjgdssjlfl@localhost:5432/postgres',
    );
    expect(ref).toBeNull();
  });
});

describe('classifyDbTarget', () => {
  it('identifies production from either string shape', () => {
    expect(classifyDbTarget(POOLER)).toEqual({ kind: 'production', projectRef: REF });
    expect(classifyDbTarget(DIRECT)).toEqual({ kind: 'production', projectRef: REF });
  });

  it('clears a different project, which provably is not the live one', () => {
    expect(classifyDbTarget(OTHER_POOLER).kind).toBe('other');
  });

  it('refuses to classify what it cannot read', () => {
    expect(classifyDbTarget('postgresql://localhost/harvous').kind).toBe('unknown');
  });
});

describe('writeNeedsConfirmation', () => {
  it('asks before writing to production', () => {
    expect(writeNeedsConfirmation(classifyDbTarget(POOLER))).toBe(true);
  });

  it('asks before writing to a target it could not identify', () => {
    // The important one: unknown must not be the silent default.
    expect(writeNeedsConfirmation(classifyDbTarget('postgres://somewhere/db'))).toBe(true);
  });

  it('does not ask for a project it positively cleared', () => {
    expect(writeNeedsConfirmation(classifyDbTarget(OTHER_POOLER))).toBe(false);
  });
});

describe('describeDbTarget', () => {
  it('says PRODUCTION in words, not just a ref someone has to recognize', () => {
    expect(describeDbTarget(classifyDbTarget(POOLER))).toMatch(/PRODUCTION/);
  });

  it('never prints the password', () => {
    for (const url of [POOLER, DIRECT, OTHER_POOLER]) {
      expect(describeDbTarget(classifyDbTarget(url))).not.toMatch(/s3cret|pw/);
    }
  });
});
