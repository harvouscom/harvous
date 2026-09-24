/**
 * The dot's rule, at both levels.
 *
 * The one worth pinning is the roll-up agreeing with the list: the bug this replaced was a
 * trigger that answered a different question from the rows underneath it, so a toolbar could
 * sit undotted above two dotted spaces.
 */
import { describe, expect, it } from 'vitest';
import {
  anySpaceHasUnseenActivity,
  hiddenSpacesHaveUnseenActivity,
  spaceHasUnseenActivity,
  unseenDotLabelSuffix,
} from '../space-switcher-unseen';
import type { NavSpace } from '../../../hooks/queries/useNavigation';

const space = (id: string, newNoteCount?: number) => ({ id, title: id, newNoteCount }) as NavSpace;

describe('a single space', () => {
  it('is dotted when it holds notes you have not seen', () => {
    expect(spaceHasUnseenActivity(space('a', 3), false)).toBe(true);
  });

  it('is not dotted at zero, or with no count at all', () => {
    expect(spaceHasUnseenActivity(space('a', 0), false)).toBe(false);
    expect(spaceHasUnseenActivity(space('a'), false)).toBe(false);
  });

  it('is never dotted while you are in it', () => {
    // Going there is the only way to clear a dot, and you are already there.
    expect(spaceHasUnseenActivity(space('a', 9), true)).toBe(false);
  });
});

describe('the roll-up', () => {
  const rows = [space('a', 0), space('b', 2), space('c')];

  it('lights when any row would', () => {
    expect(anySpaceHasUnseenActivity(rows, () => false)).toBe(true);
  });

  it('agrees with the list when the only new space is the one you are in', () => {
    expect(anySpaceHasUnseenActivity(rows, (r) => r.id === 'b')).toBe(false);
  });

  it('stays dark when nothing is new', () => {
    expect(anySpaceHasUnseenActivity([space('a'), space('b', 0)], () => false)).toBe(false);
  });
});

describe('what the label says', () => {
  it('names which kind of news raised the dot', () => {
    expect(unseenDotLabelSuffix({ suggestions: true, spaces: false })).toBe('new suggestions');
    expect(unseenDotLabelSuffix({ suggestions: false, spaces: true })).toBe('new activity');
  });

  it('names both when both are true', () => {
    expect(unseenDotLabelSuffix({ suggestions: true, spaces: true })).toBe(
      'new suggestions and activity',
    );
  });

  it('is absent when there is no dot to explain', () => {
    expect(unseenDotLabelSuffix({ suggestions: false, spaces: false })).toBeNull();
  });
});

describe('the rows past the cap', () => {
  const rows = [space('a'), space('b'), space('c', 2)];
  const none = () => false;

  it('speaks for news the menu has folded away', () => {
    expect(hiddenSpacesHaveUnseenActivity(rows, 2, none)).toBe(true);
  });

  it('stays quiet when the news is on a row already showing its own dot', () => {
    expect(hiddenSpacesHaveUnseenActivity(rows, 3, none)).toBe(false);
  });

  it('does not count the space you are in', () => {
    expect(hiddenSpacesHaveUnseenActivity(rows, 2, (row) => row.id === 'c')).toBe(false);
  });
});
