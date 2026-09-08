import { describe, expect, it } from 'vitest';
import {
  filterSharedSpaceThreads,
  isSharedSpaceThreadDrillId,
  sharedSpaceThreadsEmptyDescription,
} from '../shared-space-thread-list';
import { sharedThreadDashboardModel } from '../PrototypeSpaceHub';
import type { SpaceGroupStudyThread } from '../../../hooks/queries/useSpaceGroupThreads';
import { buildDeleteSharedThreadRequest } from '../../../hooks/mutations/useDeleteSharedThread';

function thread(id: string, title: string, isPinned = false): SpaceGroupStudyThread {
  return {
    id,
    title,
    subtitle: null,
    color: 'blue',
    spaceId: 'space_shared',
    isPinned,
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
    noteCount: 1,
    ownerUserId: 'owner',
    mode: 'collection',
    sequenceCurrentIndex: 0,
    sequenceTotal: 0,
  };
}

describe('shared space Threads list helpers', () => {
  it('treats real Threads as drill targets and study clusters as not', () => {
    expect(isSharedSpaceThreadDrillId('thread_exodus')).toBe(true);
    expect(isSharedSpaceThreadDrillId('note_123')).toBe(false);
    expect(isSharedSpaceThreadDrillId('abc')).toBe(false);
    expect(isSharedSpaceThreadDrillId(undefined)).toBe(false);
  });

  it('filters by title and keeps the current Thread in the list', () => {
    const rows = [thread('thread_a', 'Exodus', true), thread('thread_b', 'Romans')];
    expect(filterSharedSpaceThreads(rows, '').map((item) => item.id)).toEqual(['thread_a', 'thread_b']);
    expect(filterSharedSpaceThreads(rows, 'exo').map((item) => item.id)).toEqual(['thread_a']);
  });

  it('sidebar list includes current while dashboard otherThreads excludes it', () => {
    const rows = [thread('thread_a', 'Exodus', true), thread('thread_b', 'Romans')];
    const dashboard = sharedThreadDashboardModel(rows, true);
    expect(filterSharedSpaceThreads(rows, '').map((item) => item.id)).toEqual(['thread_a', 'thread_b']);
    expect(dashboard.otherThreads.map((item) => item.id)).toEqual(['thread_b']);
  });

  it('uses owner-aware empty copy for shared Threads', () => {
    expect(sharedSpaceThreadsEmptyDescription(true)).toContain('Start a Thread');
    expect(sharedSpaceThreadsEmptyDescription(false)).toContain('space owner');
  });

  it('deletes through the shared Thread erase endpoint', () => {
    expect(buildDeleteSharedThreadRequest('thread_exodus')).toEqual({
      url: '/api/threads/delete?threadId=thread_exodus',
    });
  });
});
