/**
 * Every reminder title fits one line on a lock screen.
 *
 * Verified on a real iPhone rather than assumed. iOS puts "from <app name>" on its own row
 * beneath the title — a probe with a five-character title still showed it there — so that row
 * is Apple's and unavoidable. What a sender controls is whether the title itself wraps, which
 * would make the header three rows and push the verse down.
 *
 * Asserted against the source rather than by calling `buildReminderPayload`, which needs a
 * database. The titles are string literals by design — a title built from a reference cannot
 * be length-checked at all, because "Still in 1 Thessalonians 5" depends on the book.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TITLE_MAX } from '../reminder-payload';

const source = readFileSync(resolve(process.cwd(), 'server/utils/reminder-payload.ts'), 'utf8');

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

  it('builds no title from a scripture reference', () => {
    // The one shape whose length cannot be checked: "Still in 1 Thessalonians 5" is ten
    // characters longer than "Still in John 3". References belong in the body.
    const titleFns = source.slice(source.indexOf('function verseTitle'), source.indexOf('function verseBody'));
    expect(titleFns).not.toContain('${reference}');
  });

  it('stays well inside the width a real iPhone showed on one line', () => {
    // 33 characters rendered on a single line on the device this was tested on. The budget is
    // below that on purpose, for narrower phones — this guards the guard.
    expect(TITLE_MAX).toBeLessThan(33);
  });
});
