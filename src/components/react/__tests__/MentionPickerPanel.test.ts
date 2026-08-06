import { describe, expect, it } from 'vitest';
import {
  cycleMentionKindFilter,
  mentionKindFilterOrderFor,
  MENTION_KIND_FILTER_ORDER,
} from '../MentionPickerPanel';

describe('cycleMentionKindFilter', () => {
  it('cycles forward through All → Notes → Folders → Threads → Resources', () => {
    expect(cycleMentionKindFilter('all', 1)).toBe('note');
    expect(cycleMentionKindFilter('note', 1)).toBe('folder');
    expect(cycleMentionKindFilter('folder', 1)).toBe('thread');
    expect(cycleMentionKindFilter('thread', 1)).toBe('library');
    expect(cycleMentionKindFilter('library', 1)).toBe('all');
  });

  it('cycles backward with Shift+← order', () => {
    expect(cycleMentionKindFilter('all', -1)).toBe('library');
    expect(cycleMentionKindFilter('library', -1)).toBe('thread');
    expect(cycleMentionKindFilter('thread', -1)).toBe('folder');
  });

  it('keeps a stable tab order matching the chip bar', () => {
    expect(MENTION_KIND_FILTER_ORDER).toEqual(['all', 'note', 'folder', 'thread', 'library']);
  });

  it('cycles only through the tabs a context actually shows', () => {
    // A shared-space note has no Resources tab (library items are owner-scoped),
    // so wrapping must skip it rather than land on a filter with no chip.
    const sharedOrder = mentionKindFilterOrderFor(['note', 'thread', 'folder']);
    expect(sharedOrder).toEqual(['all', 'note', 'folder', 'thread']);
    expect(cycleMentionKindFilter('thread', 1, sharedOrder)).toBe('all');
    expect(cycleMentionKindFilter('all', -1, sharedOrder)).toBe('thread');
  });
});
