/**
 * Contract tests for the Review exercise-settings stage.
 *
 * The column already existed in `schema.ts` with nothing recording that a database needs it. What
 * this holds together is that record: the DDL, the schema declaration, the validator that checks a
 * database has it, the guard that names it when it is missing, and the npm script that applies it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL,
  runAddReviewExerciseSettingsSchema,
} from '../add-review-exercise-settings-schema';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('review exercise settings migration', () => {
  it('is idempotent — re-running must be a no-op', () => {
    for (const statement of ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL) {
      expect(statement.includes('IF NOT EXISTS'), `not idempotent: ${statement.slice(0, 60)}`).toBe(true);
    }
  });

  it('is additive only — never drops or rewrites existing data', () => {
    for (const statement of ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL) {
      expect(statement).not.toMatch(/\bDROP\b/i);
      expect(statement).not.toMatch(/\bTRUNCATE\b/i);
      expect(statement).not.toMatch(/\bDELETE\b/i);
      expect(statement).not.toMatch(/\bALTER COLUMN\b/i);
      expect(statement).not.toMatch(/\bUPDATE\b/i);
    }
  });

  it('touches only UserMetadata', () => {
    for (const statement of ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL) {
      const target = statement.match(/TABLE (?:IF NOT EXISTS )?"(\w+)"/)?.[1];
      expect(target, `unexpected target: ${target}`).toBe('UserMetadata');
    }
  });

  it('adds the column the schema declares, and no others', () => {
    const added = ADDITIVE_REVIEW_EXERCISE_SETTINGS_DDL.flatMap(
      (s) => s.match(/ADD COLUMN IF NOT EXISTS "(\w+)"/)?.slice(1) ?? [],
    );
    expect(added).toEqual(['reviewExerciseSettings']);
    expect(source('server/db/schema.ts')).toContain("reviewExerciseSettings: text('reviewExerciseSettings')");
  });

  it('is checked for by the schema validator', () => {
    expect(source('server/db/validate-schema.ts')).toContain("'reviewExerciseSettings'");
  });

  it('is named when it is missing, by the one route that writes it', () => {
    expect(source('server/utils/pg-undefined-relation.ts')).toContain(
      'export function isReviewExerciseSettingsColumnMissing',
    );
    expect(source('server/routes/user.ts')).toContain('isReviewExerciseSettingsColumnMissing(error)');
  });

  it('is reachable by name from package.json', () => {
    const pkg = JSON.parse(source('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['review-exercises:schema']).toContain('add-review-exercise-settings-schema.ts');
    expect(pkg.scripts['review-exercises:schema:apply']).toContain('--apply');
  });
});

describe('review exercise settings migration runner', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dry-runs without a database URL and without connecting', async () => {
    await runAddReviewExerciseSettingsSchema([], {});
    const logged = (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join('\n');
    expect(logged).toContain('DRY RUN');
    expect(logged).toContain('ADD COLUMN IF NOT EXISTS "reviewExerciseSettings"');
    expect(logged).toContain('re-run with --apply');
  });

  it('refuses to apply without SUPABASE_DIRECT_URL', async () => {
    await expect(runAddReviewExerciseSettingsSchema(['--apply'], {})).rejects.toThrow(
      /SUPABASE_DIRECT_URL/,
    );
  });
});
