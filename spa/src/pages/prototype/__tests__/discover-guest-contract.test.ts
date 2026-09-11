/**
 * What a guest meets in the Discover panel.
 *
 * A guest has no Clerk session and sends nothing to the server, but the catalog is
 * a *public* read — so they can browse it, and browsing it is the point: "here is
 * study you can start from" is most useful to someone who has not signed up. What
 * they cannot do is install. Before this, the panel offered them a `+` on every row
 * and turned the tap into a 401 and "Could not save that".
 *
 * Asserted against the source in the style of `discover-submit-placement`, and for
 * the reason that file gives: each of these is a line that would go quietly wrong
 * rather than fail loudly. Delete the guest branch and the panel still renders,
 * still compiles, and quietly returns a guest to a dead end no test would catch.
 *
 * Structural facts only — never the copy, which is the design's to change.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panel = () =>
  readFileSync(
    resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeExpandedDiscover.tsx'),
    'utf8',
  );

describe('discover panel: the guest contract', () => {
  it('lets a guest browse rather than gating the catalog behind an account', () => {
    const text = panel();
    // The listings query is unconditional — no `enabled: !isGuest` and no early
    // return that swaps the list for a locked state. Discover is public; a guest
    // meeting an empty panel would be shown less than harvous.com shows a stranger.
    expect(text).toContain('useDiscoverListings({})');
    expect(text).not.toMatch(/if\s*\(\s*isGuest\s*\)\s*\{?\s*return\s+</);
  });

  it('turns a guest tap into the listing page instead of an install', () => {
    const text = panel();
    const guestBranch = text.indexOf('if (isGuest)');
    const mutate = text.indexOf('install.mutateAsync');
    expect(guestBranch, 'the guest branch is missing').toBeGreaterThan(-1);
    expect(mutate, 'the install call moved').toBeGreaterThan(-1);
    // The branch must return before the mutation, or the 401 is back.
    expect(guestBranch, 'the guest branch no longer precedes the install').toBeLessThan(mutate);
    expect(text).toContain('/discover/${listing.slug}');
  });

  it('says so on the row, before the tap', () => {
    const text = panel();
    // A `+` promises a copy; the guest tap makes none. Both the label and the
    // trailing glyph have to know that, or the row lies until it is pressed.
    expect(text).toMatch(/isGuest[\s\S]{0,80}caret-right/);
    expect(text).toMatch(/aria-label=\{[\s\S]{0,120}isGuest/);
  });
});
