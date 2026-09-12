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
 *   - A resource reaches it from the ⋮ on your own shelf, and only when it is a
 *     link. A file's URL is signed and expires, so sharing one would hand over
 *     something that stops working — the server refuses it either way.
 *
 * Asserted against the source, in the style of annotation-reply-contract,
 * because each of these is a line that would go quietly wrong rather than fail
 * loudly — a button moved one JSX branch up still renders, and still compiles.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const popover = () => source('spa/src/pages/prototype/PrototypeSharePopover.tsx');
const browseSheet = () => source('spa/src/pages/prototype/PrototypeBrowseTemplatesSheet.tsx');
const sheet = () => source('spa/src/pages/prototype/PrototypeShareWithOthersSheet.tsx');
const resourceList = () => source('spa/src/pages/prototype/PrototypeResourceLibraryList.tsx');

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

  /*
   * A resource reaches Discover from the ⋮ on a row of your own shelf, and only
   * when it is a link. `snapshotResource` refuses a file with
   * `RESOURCE_NOT_A_LINK` — a file's URL is signed and expires, so sharing one
   * hands strangers something that stops working — and a menu item that always
   * errored would be a worse answer than no menu item.
   */
  it('offers a resource to Discover only when it is a link', () => {
    const text = resourceList();
    expect(text).toContain('onShareWithOthers && !isFile');
    expect(text).toContain("kind: 'resource'");
  });

  /*
   * `CHURCH_MATERIAL_RESTRICTED` and `ALREADY_SUBMITTED` are opposite facts —
   * "not yours to share" and "already yours, already sent" — and were once
   * merged into one "held" bucket that told a person their church blocked a
   * link that was really just a harmless duplicate. An automated review caught
   * the wording; this pins the two counts staying apart.
   */
  it('counts a church restriction and an already-submitted duplicate separately', () => {
    const text = resourceList();
    expect(text).toContain('let restricted = 0;');
    expect(text).toContain('let duplicate = 0;');
    expect(text).not.toContain('let held = 0;');
    expect(text).toContain("code === 'CHURCH_MATERIAL_RESTRICTED'");
    expect(text).toContain("code === 'ALREADY_SUBMITTED'");
    expect(text).toContain('already offered');
  });

  it('offers it only on rows from the reader own shelf', () => {
    // `ResourceRow` is the personal branch of the merged list; a church's or a
    // room's shelf renders `ChurchResourceRow`, which is not yours to give away.
    const text = resourceList();
    const personalRow = text.indexOf('<ResourceRow');
    const churchRow = text.indexOf('<ChurchResourceRow');
    const handOff = text.indexOf('onShareWithOthers={() =>');
    expect(personalRow).toBeGreaterThan(-1);
    expect(churchRow).toBeGreaterThan(personalRow);
    // The prop is passed inside the personal row's JSX, before the church one starts.
    expect(handOff).toBeGreaterThan(personalRow);
    expect(handOff).toBeLessThan(churchRow);
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

  it('lets someone take back what they shared, listed or not', () => {
    // Sharing should be as reversible as it was voluntary.
    const text = sheet();
    expect(text).toContain("row.status === 'submitted' || row.status === 'listed'");
    expect(text).toContain('Stop sharing');
  });
});
