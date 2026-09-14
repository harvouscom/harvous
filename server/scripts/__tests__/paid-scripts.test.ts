/**
 * Argument handling for the paid measurement scripts, plus the guard they must not lose.
 *
 * These read production by default. `requireDbTarget` is what prints which database that is
 * and what refuses an accidental write, so "the script still calls it" is worth pinning: a
 * future version that starts writing would otherwise inherit a read-only script's freedom.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs as censusArgs } from '../paid-entitlement-census';
import { parseArgs as activationArgs } from '../paid-feature-activation';
import { parseArgs as conversionArgs } from '../paid-conversion-lag';
import { parseArgs as ladderArgs } from '../review-ladder-health';

const SCRIPTS = [
  'paid-entitlement-census',
  'paid-feature-activation',
  'paid-conversion-lag',
  'review-ladder-health',
] as const;

const PARSERS = [
  { name: 'census', parse: censusArgs, fallback: 30 },
  { name: 'activation', parse: activationArgs, fallback: 30 },
  { name: 'conversion', parse: conversionArgs, fallback: 365 },
  { name: 'ladder', parse: ladderArgs, fallback: 60 },
] as const;

describe.each(PARSERS)('$name parseArgs', ({ parse, fallback }) => {
  it('defaults when no flag is passed', () => {
    expect(parse(['node', 'script']).days).toBe(fallback);
  });

  it('reads an explicit --days', () => {
    expect(parse(['node', 'script', '--days=7']).days).toBe(7);
  });

  it('clamps a non-positive window to 1 rather than querying the future', () => {
    expect(parse(['node', 'script', '--days=0']).days).toBe(1);
    expect(parse(['node', 'script', '--days=-30']).days).toBe(1);
  });

  it('falls back on garbage instead of producing NaN', () => {
    // A NaN window becomes an Invalid Date and then a silently empty result set, which
    // reads as "nothing happened" rather than as a bad flag.
    expect(parse(['node', 'script', '--days=abc']).days).toBe(fallback);
    expect(parse(['node', 'script', '--days=']).days).toBe(fallback);
  });
});

describe('paid scripts', () => {
  it.each(SCRIPTS)('%s names its database target and declares itself read-only', (name) => {
    const source = readFileSync(resolve(process.cwd(), `server/scripts/${name}.ts`), 'utf8');
    expect(source).toContain('requireDbTarget');
    expect(source).toContain(`scriptName: '${name}'`);
    expect(source).toContain('writes: false');
  });

  it.each(SCRIPTS)('%s prints counts, never identifiers', (name) => {
    const source = readFileSync(resolve(process.cwd(), `server/scripts/${name}.ts`), 'utf8');

    /*
     * The check is on what reaches the console, not on the SQL: a grouped CTE may legitimately
     * select "userId" to join on (paid-conversion-lag does), and that value never leaves the
     * query. What would turn a census into a roster is printing one.
     */
    const printed = [...source.matchAll(/console\.log\(([\s\S]*?)\);\n/g)].map((m) => m[1]).join('\n');
    expect(printed).not.toMatch(/userId/i);
    expect(printed).not.toMatch(/email/i);

    // And nothing may select an identifier into a row type that the printer could reach.
    expect(source).not.toMatch(/type\s+\w*Row\s*=\s*\{[^}]*userId/);
  });
});
