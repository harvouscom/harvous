import { describe, expect, it } from 'vitest';
import { draftDestinationChipModel } from '../compose-group-thread';

const pinnedThread = { id: 'thread_current', title: 'Life together in Romans 12' };

describe('draftDestinationChipModel', () => {
  it('hides the chip when the space has no pinned Thread', () => {
    expect(draftDestinationChipModel({ pinnedThread: null, resolvedThreadId: null })).toEqual({
      state: 'hidden',
    });
  });

  it('offers opt-in by default when a current Thread exists', () => {
    expect(draftDestinationChipModel({ pinnedThread, resolvedThreadId: null })).toEqual({
      state: 'opt-in',
      threadId: 'thread_current',
      threadTitle: 'Life together in Romans 12',
    });
  });

  it('renders active when the resolved selection matches the pinned Thread', () => {
    expect(draftDestinationChipModel({ pinnedThread, resolvedThreadId: 'thread_current' })).toEqual({
      state: 'active',
      threadId: 'thread_current',
      threadTitle: 'Life together in Romans 12',
    });
  });

  it('degrades a stale selection for another Thread to opt-in', () => {
    expect(draftDestinationChipModel({ pinnedThread, resolvedThreadId: 'thread_gone' })).toMatchObject({
      state: 'opt-in',
    });
  });
});
