import { describe, expect, it } from 'vitest';
import { shouldUpgradePrototypeBodyFromServer } from '../prototype-note-body-upgrade';

describe('shouldUpgradePrototypeBodyFromServer', () => {
  it('upgrades list preview to full details when preview flag clears', () => {
    expect(
      shouldUpgradePrototypeBodyFromServer({
        currentHtml: '<p>' + 'a'.repeat(100) + '</p>',
        incomingHtml: '<p>' + 'a'.repeat(100) + ' full tail</p>',
        contentIsPreview: false,
        seededFromPreview: true,
      }),
    ).toBe(true);
  });

  it('does not treat empty→preview seed as a details upgrade', () => {
    expect(
      shouldUpgradePrototypeBodyFromServer({
        currentHtml: '<p></p>',
        incomingHtml: '<p>' + 'a'.repeat(50) + '</p>',
        contentIsPreview: true,
        seededFromPreview: true,
      }),
    ).toBe(false);
  });

  it('upgrades when scripture pills appear after open-time processing', () => {
    expect(
      shouldUpgradePrototypeBodyFromServer({
        currentHtml: '<p>See John 3:16 today</p>',
        incomingHtml:
          '<p>See <span class="scripture-pill" data-scripture-reference="John 3:16">John 3:16</span> today</p>',
        contentIsPreview: false,
        seededFromPreview: false,
      }),
    ).toBe(true);
  });

  it('upgrades when pending pills resolve', () => {
    expect(
      shouldUpgradePrototypeBodyFromServer({
        currentHtml:
          '<p><span data-scripture-reference="John 3:16" data-note-id="pending">John 3:16</span></p>',
        incomingHtml:
          '<p><span data-scripture-reference="John 3:16" data-note-id="note_abc">John 3:16</span></p>',
        contentIsPreview: false,
        seededFromPreview: false,
      }),
    ).toBe(true);
  });

  it('does not downgrade to a shorter server body', () => {
    expect(
      shouldUpgradePrototypeBodyFromServer({
        currentHtml: '<p>longer live body here</p>',
        incomingHtml: '<p>short</p>',
        contentIsPreview: false,
        seededFromPreview: false,
      }),
    ).toBe(false);
  });

  it('returns false when bodies already match', () => {
    expect(
      shouldUpgradePrototypeBodyFromServer({
        currentHtml: '<p>Same</p>',
        incomingHtml: '<p>Same</p>',
        contentIsPreview: false,
        seededFromPreview: false,
      }),
    ).toBe(false);
  });
});
