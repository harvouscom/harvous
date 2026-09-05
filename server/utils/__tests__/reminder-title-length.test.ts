/**
 * Every reminder title fits one line on a lock screen.
 *
 * This is a real bug that shipped to a phone before it was caught: iOS renders a web push
 * title as "<title> from <app name>", so "This is what a reminder looks like" became "This is
 * what a reminder looks like from Harvous" and wrapped, pushing the verse down and reading as
 * a paragraph instead of a heading.
 *
 * Asserted against the source rather than by calling `buildReminderPayload`, which needs a
 * database. The titles are string literals by design — a title built from a reference cannot
 * be length-checked at all, because "Still in 1 Corinthians" depends on the book.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TITLE_MAX } from '../reminder-payload';

const source = readFileSync(resolve(process.cwd(), 'server/utils/reminder-payload.ts'), 'utf8');

/** The iOS suffix the title shares its line with. */
const IOS_SUFFIX = ' from Harvous';

/**
 * Every string literal returned by a `*Title` function, plus the test override.
 *
 * Read out of the source so a title added later is covered without anyone remembering to add
 * it here — the failure mode this test exists for is a well-meant edit, not a missing case.
 */
function titleLiterals(): string[] {
  const titles: string[] = [];
  const titleFnBlock = /function \w*[Tt]itle\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g;
  for (const match of source.matchAll(titleFnBlock)) {
    for (const literal of match[1]!.matchAll(/return\s+(['"])(.*?)\1/g)) {
      titles.push(literal[2]!);
    }
  }
  // The test-send override is an assignment rather than a return.
  for (const literal of source.matchAll(/kind === 'test'\) title = (['"])(.*?)\1/g)) {
    titles.push(literal[2]!);
  }
  return titles;
}

describe('reminder titles', () => {
  const titles = titleLiterals();

  it('finds every title in the source', () => {
    // A refactor that changes the shape of these functions should fail loudly here rather
    // than quietly checking nothing.
    expect(titles.length).toBeGreaterThanOrEqual(7);
    expect(titles).toContain("Sunday's verse");
    expect(titles).toContain('Your test reminder');
  });

  it('keeps every title inside the one-line budget', () => {
    for (const title of titles) {
      expect(
        title.length,
        `"${title}" is ${title.length} chars, over the ${TITLE_MAX} budget`,
      ).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it('leaves room for the app name iOS appends', () => {
    for (const title of titles) {
      expect(
        (title + IOS_SUFFIX).length,
        `"${title}${IOS_SUFFIX}" is what iOS actually renders`,
      ).toBeLessThanOrEqual(TITLE_MAX + IOS_SUFFIX.length);
    }
  });

  it('builds no title from a scripture reference', () => {
    // The one shape whose length cannot be checked: "Still in 1 Corinthians" is nine
    // characters longer than "Still in John". References belong in the body.
    const titleFns = source.slice(source.indexOf('function verseTitle'), source.indexOf('function verseBody'));
    expect(titleFns).not.toContain('${reference}');
  });
});
