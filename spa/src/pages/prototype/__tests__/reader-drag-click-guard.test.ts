/**
 * The click that ends a drag must not be read as a tap.
 *
 * D-1 let you drag across part of a verse to highlight a phrase. It worked across a verse
 * boundary and silently failed inside a single verse — which is the case the feature is for.
 * The cause is the interaction between two things that are each correct alone:
 *
 *   1. A browser fires `click` after `mouseup` even when the pointer moved, so a drag inside
 *      verse 20 ends with a click on verse 20.
 *   2. `nextVerseSelection` reads a tap on the sole selected verse as "the way back out" and
 *      returns null — deliberately, and the test below pins that it still does.
 *
 * So the drag set [20,20] and the trailing click cleared it before the toolbar could render.
 * A cross-verse drag hid the bug: clicking verse 18 of [17,18] narrows to [18,18] rather than
 * clearing, so a selection survived and everything looked fine.
 *
 * Asserted against the source rather than by rendering the pane. The guard reads
 * `document.getSelection()` inside a React callback whose whole design point is a stable
 * identity — reproducing that needs a chapter query, a shell context and a real layout, none of
 * which is what this is about. What must not regress is that the guard exists, that it is
 * skipped for shift, and that it runs before the verse is selected.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextVerseSelection } from '../reader-verse-selection';

const pane = readFileSync(
  resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeBibleReaderPane.tsx'),
  'utf8',
);

/** `handleVerseActivate`'s body, up to the next top-level `const` after it. */
const activate = (() => {
  const start = pane.indexOf('const handleVerseActivate = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const end = pane.indexOf('const handleVerseKeys', start);
  expect(end).toBeGreaterThan(start);
  return pane.slice(start, end);
})();

describe('a drag does not end by deselecting what it selected', () => {
  it('the two correct behaviours that combine into the bug are both still here', () => {
    // If this ever stops returning null, the guard is protecting nothing and can go.
    expect(nextVerseSelection({ start: 20, end: 20, column: 'primary' }, 20, false, 'primary')).toBeNull();
    // And the reason a cross-verse drag looked fine, which is why the bug was easy to miss.
    expect(
      nextVerseSelection({ start: 17, end: 18, column: 'primary' }, 18, false, 'primary'),
    ).toEqual({ start: 18, end: 18, column: 'primary' });
  });

  it('ignores a click that arrives with a live selection in the column', () => {
    expect(activate).toContain('document.getSelection()');
    expect(activate).toMatch(/isCollapsed/);
    // Scoped to the reader column: a selection somewhere else on the page is not this drag.
    expect(activate).toMatch(/columnRef\.current/);
    expect(activate).toMatch(/contains\(/);
  });

  it('lets shift through, since shift-click extends on purpose', () => {
    // Shift-click drags the DOM selection along with it, so an unguarded test would suppress
    // the one gesture whose whole job is to extend the range.
    expect(activate).toMatch(/if\s*\(\s*!e\.shiftKey\s*\)/);
  });

  it('guards before selecting, not after', () => {
    const guard = activate.indexOf('document.getSelection()');
    const select = activate.indexOf('selectVerse(n, e.shiftKey, column)');
    expect(guard).toBeGreaterThan(-1);
    expect(select).toBeGreaterThan(-1);
    // A guard that runs after the selection has already been toggled is not a guard.
    expect(guard).toBeLessThan(select);
  });
});
