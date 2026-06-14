import { describe, expect, it } from 'vitest';

import {
  suggestPrimaryCollectionFromNote,
  suggestSecondaryCollectionsFromNote,
} from '@/utils/bible-study-collection-web';

/**
 * Primary-folder eligibility gate: a passing person/place/book mention must not define the folder.
 * A specific reference is primary-eligible only when it is in the title or recurs (>= 3 mentions);
 * otherwise the primary should fall to a broad theme/topic or stay empty.
 */
describe('primary-folder gate for passing specific references', () => {
  it('uses the survey topic, not a passing name, for a "Women of the Bible" note', () => {
    const title = 'Women of the Bible';
    const body =
      "Women served a great purpose in God's plan as they were actually the first supporters of Jesus. " +
      'Ruth, Esther, Mary Magdalene, the Samaritan Woman, and the Virgin Mary. ' +
      "I don't really know any scripture about women except the one that is about being quiet. Proverbs 31";

    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Women of the Bible');
    expect(primary).not.toBe('Mary Magdalene');
    expect(primary).not.toBe('Ruth');
    expect(primary).not.toBe('Esther');
    expect(primary).not.toBe('Proverbs');
  });

  it('still allows a title-named, recurring character to be primary', () => {
    const title = 'Moses';
    const body =
      'Moses climbed the mountain to meet with the Lord. Moses spoke to the people below. ' +
      'Moses carried the staff in his hand. Moses listened and Moses obeyed what he heard that day.';

    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Moses');
  });

  it('allows a recurring character to be primary even without a title mention', () => {
    const title = '';
    const body =
      'David played the harp before the king. David fought the giant in the valley. ' +
      'David became king over the land. David wrote many songs of his own. David danced before the ark.';

    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('David');
  });

  it('returns no primary for a lone, passing character mention with no theme', () => {
    const title = '';
    const body =
      'Yesterday we walked along the shore and talked for a long while about many ordinary things ' +
      'that happened during the week, and then someone mentioned Peter once before we all went home for dinner.';

    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBeNull();
  });

  it('still surfaces a recurring character as a secondary in a themed note (no leak)', () => {
    const title = 'My salvation story';
    const body =
      'Salvation changed my life completely. I found salvation through grace alone. ' +
      'Salvation is a free gift offered to everyone. ' +
      'Paul wrote about it often. Paul explained grace clearly. Paul preached salvation boldly.';

    const primary = suggestPrimaryCollectionFromNote(title, body);
    expect(primary).toBe('Salvation');

    const secs = suggestSecondaryCollectionsFromNote(title, body, primary);
    expect(secs.some((s) => s.toLowerCase() === 'paul')).toBe(true);
  });
});
