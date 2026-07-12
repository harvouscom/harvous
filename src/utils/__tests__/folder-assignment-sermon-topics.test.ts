import { describe, expect, it } from 'vitest';
import { applyIdleFolderAutoAssign } from '../prototype-folder-auto-assign';
import { suggestPrimaryCollectionFromNote } from '../bible-study-collection-web';
import type { CollectionChromeState } from '../bible-study-collection-web';

const emptyChrome: CollectionChromeState = {
  primaryCollection: null,
  secondaryCollections: [],
  collectionPinned: false,
  collectionUserOverride: false,
  collectionLastAutoUpdatedAtIso: null,
};

const now = new Date('2026-07-12T12:00:00.000Z');

function toHtml(body: string): string {
  return body
    .split('\n')
    .map((line) => `<p>${line}</p>`)
    .join('');
}

const PASSOVER_SERMON = `Surrendering your life to Jesus is a daily thing.
Ps August
The 10th plague. The Passover.
Exodus 11:1-10
Exodus 12:1-30
Yeast is used as a symbol for sin. Once yeast is out it in will take control and do what it wants to do and nothing we can do to stop it.
What does this ceremony mean to you? then tell them, It is the Passover sacrifice to the Lord, who passed over the houses of the Israelites in Egypt and spared our homes when he struck down the Egyptians. Then the people bowed down and worshiped.
Exodus 12:27
God couldn't be loving if he wasn't just. Here God is enacting his justice on Egypt. This final act is to dethrone Pharaoh and there should be no other gods.
Death does not discriminate. Hearts of disobedience
Romans 6:23
On our best day we present ourselves as forgot rags to our perfect and holy God.
You will never be able to pay the debt for your sins.
Exodus 12:12
When God went to where the Israelites dwelled in Egypt they weren't met with death but mercy by the blood of the lamb on their doors.
Exodus 12:13
This marked The Passover.
God sees you. He did not forget you. It's why He sent Jesus as our Passover lamb
John 1:29
Look! The Lamb of God who takes away the sin of the world!
Matthew 26:26-29
Each of you drink from it, for this is my blood, which confirms the covenant between God and his people.
Revelation 5:5-6 Lambs book of life, break the seal and open the scroll
Jesus died and shed his blood for salvation but he is no longer dead. He is with us, for us. One day the scroll will open and your name will be there and called to Heaven to live with him.`;

describe('folder assignment — sermon topics', () => {
  it('Passover sermon gets Passover or The Exodus in folders (not Egypt-only secondaries)', () => {
    const html = toHtml(PASSOVER_SERMON);
    const result = applyIdleFolderAutoAssign(emptyChrome, '', html, now);
    const all = [result.primaryCollection, ...result.secondaryCollections].filter(Boolean) as string[];
    expect(all.some((f) => f === 'Passover' || f === 'The Exodus')).toBe(true);
    expect(all).not.toEqual(['Sin', 'Egypt']);
  });

  it('Leviticus 23 citation-only note gets Biblical Feasts from passage subjects', () => {
    const html = '<p>Reading Leviticus 23 today.</p>';
    const result = applyIdleFolderAutoAssign(emptyChrome, '', html, now);
    const all = [result.primaryCollection, ...result.secondaryCollections].filter(Boolean) as string[];
    expect(all).toContain('Biblical Feasts');
  });

  it('Matthew 26 upper-room note surfaces The Last Supper', () => {
    const html = '<p>Jesus gathered in the upper room. Matthew 26:26-29</p>';
    const result = applyIdleFolderAutoAssign(emptyChrome, '', html, now);
    const all = [result.primaryCollection, ...result.secondaryCollections].filter(Boolean) as string[];
    expect(all.some((f) => f === 'The Last Supper' || f === 'The Passion')).toBe(true);
  });

  it('Revelation 19 marriage supper of the Lamb does not become Marriage folder', () => {
    const html = '<p>Revelation 19 — the marriage supper of the Lamb and the great celebration.</p>';
    const primary = suggestPrimaryCollectionFromNote('', html);
    expect(primary?.toLowerCase()).not.toBe('marriage');
  });

  it('communion theology note can surface The Last Supper via content vocabulary', () => {
    const html = '<p>We took communion together and remembered the Lord\'s supper at church.</p>';
    const result = applyIdleFolderAutoAssign(emptyChrome, '', html, now);
    const all = [result.primaryCollection, ...result.secondaryCollections].filter(Boolean) as string[];
    expect(all.some((f) => f === 'The Last Supper' || f === 'Communion')).toBe(true);
  });
});

describe('folder assignment — Passover note symptom (confirmed)', () => {
  it('auto-assign produces secondaries (not empty) for the Passover sermon body', () => {
    const html = toHtml(PASSOVER_SERMON);
    const result = applyIdleFolderAutoAssign(emptyChrome, '', html, now);
    expect(result.primaryCollection).toBeTruthy();
    expect(result.secondaryCollections.length).toBeGreaterThan(0);
  });
});
