import { describe, expect, it } from 'vitest';
import {
  cycleMentionKindFilter,
  MENTION_KIND_FILTER_ORDER,
} from '../MentionPickerPanel';

describe('cycleMentionKindFilter', () => {
  it('cycles forward through All → Notes → Folders → Threads', () => {
    expect(cycleMentionKindFilter('all', 1)).toBe('note');
    expect(cycleMentionKindFilter('note', 1)).toBe('folder');
    expect(cycleMentionKindFilter('folder', 1)).toBe('thread');
    expect(cycleMentionKindFilter('thread', 1)).toBe('all');
  });

  it('cycles backward with Shift+← order', () => {
    expect(cycleMentionKindFilter('all', -1)).toBe('thread');
    expect(cycleMentionKindFilter('thread', -1)).toBe('folder');
  });

  it('keeps a stable tab order matching the chip bar', () => {
    expect(MENTION_KIND_FILTER_ORDER).toEqual(['all', 'note', 'folder', 'thread']);
  });
});
