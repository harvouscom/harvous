/**
 * The line between "opened a suggestion" and "did what it asked".
 *
 * The case that matters most is the pill-rewrite one at the bottom: it is the difference
 * between a completion metric that means something and one that fires on every tap.
 */
import { describe, expect, it } from 'vitest';
import { draftWentBeyondItsSeed } from '../recall-draft-completion';

const PILL = '<span data-scripture-reference="John 4" data-scripture-translation="NET">John 4</span>';

describe('a draft that is still only its seed', () => {
  it('is not complete when nothing was touched', () => {
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'John 4',
        seedContentHtml: `<p>${PILL}</p>`,
        title: 'John 4',
        content: `<p>${PILL}</p>`,
      }),
    ).toBe(false);
  });

  it('is not complete when the save only reformatted the markup', () => {
    /* The editor canonicalises line breaks and wrapping on the way out. None of that is the
       reader writing, so the comparison runs on text rather than on HTML. */
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'John 4',
        seedContentHtml: `<p>${PILL}</p>`,
        title: 'John 4',
        content: `<p>${PILL}<br></p>`,
      }),
    ).toBe(false);
  });

  it('is not complete when scripture processing rewrote the pill', () => {
    /*
     * The load-bearing case. `processScriptureReferences` re-renders pill markup after the
     * save, so the stored HTML stops matching the seed's HTML without anyone having typed.
     * Comparing raw markup would call that a completion on every single seeded card.
     */
    const rewritten =
      '<span data-scripture-reference="John 4:1-54" data-scripture-translation="NLT" data-pill-id="p1">John 4</span>';
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'John 4',
        seedContentHtml: `<p>${PILL}</p>`,
        title: 'John 4',
        content: `<p>${rewritten}</p>`,
      }),
    ).toBe(false);
  });

  it('is not complete for a title-only seed left alone', () => {
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'Barnabas',
        seedContentHtml: '<p></p>',
        title: 'Barnabas',
        content: '<p></p>',
      }),
    ).toBe(false);
  });
});

describe('a draft the reader took up', () => {
  it('is complete once a word is typed', () => {
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'John 4',
        seedContentHtml: `<p>${PILL}</p>`,
        title: 'John 4',
        content: `<p>${PILL}</p><p>She left the jar.</p>`,
      }),
    ).toBe(true);
  });

  it('is complete when the title was rewritten, even with the body untouched', () => {
    /* Renaming the card's placeholder is taking the prompt up. */
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'John 4',
        seedContentHtml: `<p>${PILL}</p>`,
        title: 'The woman at the well',
        content: `<p>${PILL}</p>`,
      }),
    ).toBe(true);
  });

  it('is complete when the seeded prose was replaced with something shorter', () => {
    /* "Differs", not "is longer" — deleting the prompt and answering it in four words is
       still answering it. */
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'A prayer',
        seedContentHtml: '<p>Write a prayer about waiting on God this Advent.</p>',
        title: 'A prayer',
        content: '<p>Teach me to wait.</p>',
      }),
    ).toBe(true);
  });

  it('is complete for a title-only seed that gained a body', () => {
    expect(
      draftWentBeyondItsSeed({
        seedTitle: 'Barnabas',
        seedContentHtml: '<p></p>',
        title: 'Barnabas',
        content: '<p>He is the one who vouched for Paul.</p>',
      }),
    ).toBe(true);
  });
});

describe('missing halves', () => {
  it('treats an absent seed as empty, so any content completes', () => {
    expect(
      draftWentBeyondItsSeed({ title: 'Something', content: '<p>A thought.</p>' }),
    ).toBe(true);
  });

  it('does not complete when both sides are empty', () => {
    expect(draftWentBeyondItsSeed({ title: '', content: '' })).toBe(false);
  });
});
