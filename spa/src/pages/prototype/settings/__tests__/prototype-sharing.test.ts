import { describe, expect, it } from 'vitest';
import { resolveSharedItemLeadingMeta } from '../PrototypeSharingPage';

describe('resolveSharedItemLeadingMeta', () => {
  it('maps note shares to the note-sticky icon', () => {
    expect(resolveSharedItemLeadingMeta('note')).toEqual({
      icon: 'note-sticky',
      label: 'Note',
    });
  });

  it('maps thread and space kinds for future sharing cards', () => {
    expect(resolveSharedItemLeadingMeta('thread').icon).toBe('layer-group');
    expect(resolveSharedItemLeadingMeta('space').icon).toBe('user-group');
  });
});
