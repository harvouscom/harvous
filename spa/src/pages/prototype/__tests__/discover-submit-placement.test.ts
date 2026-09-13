/**
 * Where you are offered the chance to give something away.
 *
 * The placement *is* the consent design, so it is asserted rather than left to
 * survive the next refactor of a 300-line popover:
 *
 *   - A note reaches Discover only from the share popover's already-public
 *     branch. A share link is one person you chose; Discover is everyone, so it
 *     is the second step and never the first.
 *   - A template reaches it from the ⋮ on rows that are yours. You can only give
 *     away what you own, and org-provisioned starters belong to the church.
 *
 * Asserted against the source, in the style of annotation-reply-contract,
 * because each of these is a line that would go quietly wrong rather than fail
 * loudly — a button moved one JSX branch up still renders, and still compiles.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverActionFor } from '../settings/sharing-items';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const popover = () => source('spa/src/pages/prototype/PrototypeSharePopover.tsx');
const browseSheet = () => source('spa/src/pages/prototype/PrototypeBrowseTemplatesSheet.tsx');
const sheet = () => source('spa/src/pages/prototype/PrototypeShareWithOthersSheet.tsx');
const sharingPage = () => source('spa/src/pages/prototype/settings/PrototypeSharingPage.tsx');
const threadView = () => source('spa/src/pages/prototype/library-panel/PrototypeLibraryThreadView.tsx');

describe('discover submit placement', () => {
  it('offers a note to Discover only after it is already public', () => {
    const text = popover();
    const notPublicBranch = text.indexOf(') : !isPublic ? (');
    const publicBranch = text.indexOf('proto-share-popover__url-row');
    const offer = text.indexOf('Share with others on Harvous');
    expect(notPublicBranch, 'the non-public branch moved').toBeGreaterThan(-1);
    expect(publicBranch, 'the public branch moved').toBeGreaterThan(notPublicBranch);
    expect(offer, 'the Discover offer is missing').toBeGreaterThan(-1);
    // After the public branch opens — i.e. inside it, not in the create-link branch.
    expect(offer, 'the Discover offer escaped the already-public branch').toBeGreaterThan(
      publicBranch,
    );
  });

  it('names the note kind when submitting from the share popover', () => {
    expect(popover()).toContain("kind: 'note'");
  });

  it('offers a template to Discover only from rows the reader owns', () => {
    const text = browseSheet();
    expect(text).toContain("onShareWithOthers && template.section === 'personal'");
    expect(text).toContain("kind: 'template'");
  });

  it('says the name goes with it before the button, not after', () => {
    // PrototypeSuggestResourceSheet's ethic, kept here: someone should know
    // their name goes with it before they press it.
    const text = sheet();
    const attribution = text.indexOf('Sent with your name on it');
    const button = text.lastIndexOf('proto-share-popover__primary');
    expect(attribution).toBeGreaterThan(-1);
    expect(attribution, 'the attribution line moved below the button').toBeLessThan(button);
  });

  it('keeps the history out of the sheet — it lives in Settings › Sharing', () => {
    // The sheet is for sending one thing. What you have already sent is a list, and a list
    // belongs on the page that lists every kind of sharing, not tucked under a form.
    const text = sheet();
    expect(text).not.toContain('useMyDiscoverSubmissions');
    expect(text).toContain('Settings › Sharing');
  });

  it('lets someone take back what they shared, listed or not — from Settings', () => {
    // Sharing should be as reversible as it was voluntary.
    expect(discoverActionFor('submitted')).toBe('withdraw');
    expect(discoverActionFor('listed')).toBe('stop');
    expect(sharingPage()).toContain('useWithdrawDiscoverSubmission');
    expect(sharingPage()).toContain('Stop sharing');
  });

  it('offers a Thread to Discover only from a Thread of your own, in the Library panel', () => {
    // A shared-space Thread is the room's, so the offer lives in the personal branch alone.
    const text = threadView();
    const personal = text.indexOf('function PersonalThreadMembers');
    const shared = text.indexOf('function SharedThreadMembers');
    const offer = text.indexOf("kind: 'pack'");
    expect(offer, 'the Thread offer is missing').toBeGreaterThan(-1);
    expect(offer, 'the Thread offer escaped the personal branch').toBeGreaterThan(personal);
    expect(offer, 'the Thread offer escaped the personal branch').toBeLessThan(shared);
  });
});
