/**
 * Which of the two things the What's New row opens.
 *
 * This has regressed three times, and every time it failed the same way: the row opened the
 * release notes, which is a real page that loads fine, so nothing errored and nothing looked
 * broken unless you already knew you were owed the Harvous 3 sheet instead. There was no test
 * on it because the decision was an expression inside the component.
 *
 * The rule is the major alone. Keying on the full release marker was the first regression —
 * `3.0` stopped matching hours after launch, when the version moved to `3.1`, and the row fell
 * back to the notes for everyone before most readers had seen the sheet at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { opensWelcomeSheet } from '../PrototypeWhatsNewPill';

describe('opensWelcomeSheet', () => {
  it.each(['3.0.0', '3.1.0', '3.6.3', '3.9.9', '3.10.0'])(
    'opens the sheet throughout 3.x (%s)',
    (version) => {
      expect(opensWelcomeSheet(version)).toBe(true);
    },
  );

  it.each(['4.0.0', '4.1.2', '10.0.0'])('retires itself at the next major (%s)', (version) => {
    expect(opensWelcomeSheet(version)).toBe(false);
  });

  it('does not match a version that merely starts with a 3', () => {
    // `30.1.0` shares a first character, not a major. Guards a `startsWith` rewrite.
    expect(opensWelcomeSheet('30.1.0')).toBe(false);
  });

  /*
   * Unknown is `false` because we cannot claim a major nobody told us — but it should also be
   * unreachable now. `appVersion()` prefers the `__APP_VERSION__` build-time define over the
   * copy `ToastSetup` publishes on `window` inside an effect. Reading the window copy during a
   * render that happened first returned `undefined`, and since it is a plain property rather
   * than state, its later arrival re-rendered nothing. That is how this branch could flip
   * without anyone touching this file.
   */
  it.each([undefined, null, ''])('answers false for an unknown version (%s)', (version) => {
    expect(opensWelcomeSheet(version)).toBe(false);
  });
});

/**
 * The row has one destination, and the row's own title is what names it.
 *
 * The three reports were all of the row "going to the release notes", and all three times the
 * row was correct — an unlabelled 12px eye in its trailing slot, shown only during 3.x, was the
 * thing being pressed. Two destinations a few pixels apart, one of them named only by a glyph.
 *
 * Source-inspected because the seam is JSX structure rather than a value, and the point is not
 * how it renders but that the second destination is gone. The release notes are still reachable:
 * the sheet the row opens offers them in words.
 */
describe('the row itself', () => {
  const source = readFileSync(
    join(process.cwd(), 'spa/src/pages/prototype/PrototypeWhatsNewPill.tsx'),
    'utf8',
  );
  const trailing = source.slice(source.indexOf('trailing={'), source.indexOf('    />'));

  it('offers nothing in its trailing slot but dismiss', () => {
    expect(trailing).toContain("aria-label=\"Dismiss what's new\"");
    expect(trailing.match(/aria-label=/g) ?? []).toHaveLength(1);
  });

  it('never puts a release-notes control beside the dismiss cross', () => {
    expect(trailing).not.toContain('Read the release notes');
    expect(trailing).not.toContain('openNotes');
  });
});
