/**
 * Which official listings act like a built-in, and which do not.
 *
 * `preview.official` means Harvous published this itself, and that fact alone
 * is fine to drive copy — a kicker or a footer line reads correctly for any
 * kind. It is not fine to drive "there is nothing to install": only a
 * *template* has a pre-installed twin in `getBuiltInTemplates()`. An official
 * note, pack, or resource has no such row, so treating it as already-yours
 * blocked the only way to actually take it — an automated review caught this
 * after the fact against real code, not a hypothetical.
 *
 * Asserted against the source, in the style of `discover-submit-placement`,
 * because the two facts (published-by-Harvous vs. already-in-every-account)
 * look identical from one boolean and are easy to conflate again silently.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(
    resolve(process.cwd(), 'spa/src/pages/public/PublicDiscoverListingPage.tsx'),
    'utf8',
  );

describe('discover listing: official vs. built-in', () => {
  it('narrows official to built-in with a kind check', () => {
    const text = source();
    expect(text).toContain("const isBuiltIn = isOfficial && listing?.kind === 'template';");
  });

  it('gates every "nothing to install" behavior on isBuiltIn, not isOfficial', () => {
    const text = source();
    // The replay-effect early return.
    expect(text).toContain('if (isBuiltIn) return;');
    // handlePress's two branches.
    expect(text).toContain('if (isSignedIn && !isBuiltIn) {');
    expect(text).toContain('if (!isBuiltIn) {');
    // The CTA block that renders "already in your templates" / "Get Harvous free"
    // versus the ordinary install button.
    expect(text).toContain('{isBuiltIn ? (');
  });

  it('keeps isOfficial driving the copy-only kicker and footer', () => {
    const text = source();
    // These stay on the broader fact — Harvous published this, whatever the
    // kind — because that much is true, and correct to say, for any kind.
    const kickerBranch = text.indexOf('A ${kindNoun} included with Harvous');
    const footerBranch = text.indexOf("'Included with Harvous.'");
    expect(kickerBranch, 'the kicker copy moved').toBeGreaterThan(-1);
    expect(footerBranch, 'the footer copy moved').toBeGreaterThan(-1);
  });
});
