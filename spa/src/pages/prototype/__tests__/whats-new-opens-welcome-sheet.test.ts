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
