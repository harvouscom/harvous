import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceGroupStudyThread } from '../../../hooks/queries/useSpaceGroupThreads';
import { sharedThreadDashboardModel } from '../PrototypeSidebarSharedSpaceView';
import {
  buildCreateSharedThreadFormData,
  validSharedThreadColor,
} from '../../../hooks/mutations/useCreateSharedThread';
import { buildUpdateSharedThreadFormData } from '../../../hooks/mutations/useUpdateSharedThread';
import {
  buildSetCurrentSpaceThreadRequest,
  createThenSetCurrentThread,
} from '../../../hooks/mutations/useSetCurrentSpaceThread';
import {
  canLoadMoreThreadNotes,
  resolveSharedThreadDrilldownState,
  sharedThreadNoteNavigation,
} from '../PrototypeSharedThreadDrilldown';
import {
  adaptSharedThreadNote,
  flattenThreadNotePages,
  nextThreadNotesOffset,
  threadNotesQueryKey,
} from '../../../hooks/queries/useThreadNotes';
import {
  resolveComposeThreadSelection,
  validComposeThreadSelection,
} from '../PrototypeGroupStudyThreadPicker';
import {
  beginComposeInGroupThread,
  getComposeGroupThreadId,
} from '../../../lib/compose-group-thread';
import { sharedThreadSubmitMode } from '../PrototypeCreateSharedThreadSheet';
import { buildAttachNotesToCurrentThreadRequest } from '../../../hooks/mutations/useAttachNotesToCurrentThread';
import { filterCurrentThreadAttachmentCandidates } from '../PrototypeAddNotesSheet';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function thread(id: string, isPinned = false): SpaceGroupStudyThread {
  return {
    id,
    title: `Thread ${id}`,
    subtitle: null,
    color: 'blue',
    spaceId: 'space_shared',
    isPinned,
    createdAt: '2026-07-09T12:00:00.000Z',
    updatedAt: '2026-07-09T12:00:00.000Z',
    noteCount: 2,
    ownerUserId: 'owner',
  };
}

describe('shared Thread dashboard policy', () => {
  it('shows only the singular pinned real Thread as current', () => {
    const model = sharedThreadDashboardModel(
      [thread('thread_old'), thread('thread_current', true), thread('thread_other')],
      true,
    );
    expect(model.currentThread?.id).toBe('thread_current');
    expect(model.otherThreads.map((item) => item.id)).toEqual(['thread_old', 'thread_other']);
  });

  it('never falls back to a cluster and keeps the owner/member CTA matrix', () => {
    const owner = sharedThreadDashboardModel([], true);
    const member = sharedThreadDashboardModel([], false);
    expect(owner.currentThread).toBeNull();
    expect(owner.canStartThread).toBe(true);
    expect(member.currentThread).toBeNull();
    expect(member.canStartThread).toBe(false);
    expect(owner.emptyLabel).toBe('No thread yet.');
    expect(member.emptyLabel).toBe('Waiting for the owner to start one.');
  });
});

describe('shared Thread create and pin contracts', () => {
  it('submits the shared-space create payload with no selected notes', () => {
    const form = buildCreateSharedThreadFormData({
      spaceId: 'shared',
      title: '  Romans together  ',
      color: 'purple',
    });
    expect(Object.fromEntries(form.entries())).toEqual({
      title: 'Romans together',
      color: 'purple',
      spaceId: 'space_shared',
      isPublic: 'false',
      selectedNoteIds: '[]',
    });
    expect(validSharedThreadColor('not-a-color')).toBe('paper');
  });

  it('submits the shared-space update payload with id, trimmed title, and color', () => {
    const form = buildUpdateSharedThreadFormData({
      spaceId: 'shared',
      threadId: 'thread_1',
      title: '  Joy  ',
      color: 'blue',
    });
    expect(Object.fromEntries(form.entries())).toEqual({
      id: 'thread_1',
      title: 'Joy',
      color: 'blue',
    });
  });

  it('creates before pinning and propagates pin failures', async () => {
    const calls: string[] = [];
    const created = await createThenSetCurrentThread(
      async () => {
        calls.push('create');
        return { id: 'thread_real' };
      },
      async (threadId) => {
        calls.push(`pin:${threadId}`);
      },
    );
    expect(created.id).toBe('thread_real');
    expect(calls).toEqual(['create', 'pin:thread_real']);

    await expect(
      createThenSetCurrentThread(
        async () => ({ id: 'thread_created_but_unpinned' }),
        async () => {
          throw new Error('pin failed');
        },
      ),
    ).rejects.toThrow('pin failed');
  });

  it('uses the owner-only singular pin endpoint contract', () => {
    expect(buildSetCurrentSpaceThreadRequest({ spaceId: 'shared', threadId: 'thread_real' })).toEqual({
      url: '/api/spaces/space_shared/pin-item',
      body: { itemId: 'thread_real', itemType: 'thread', isPinned: true },
    });
  });

  it('retries pinning the stored Thread even if the title is empty', () => {
    expect(sharedThreadSubmitMode('thread_created', '', false)).toBe('retry-pin');
    expect(sharedThreadSubmitMode(null, '', false)).toBeNull();
    expect(sharedThreadSubmitMode(null, 'Romans', false)).toBe('create');
    expect(sharedThreadSubmitMode('thread_created', 'changed', true)).toBeNull();
  });
});

describe('shared Thread drilldown and compose contracts', () => {
  beforeEach(() => sessionStorage.clear());

  it('covers loading, error, empty, and ready states', () => {
    expect(resolveSharedThreadDrilldownState({ isLoading: true, isError: false, noteCount: 0 })).toBe('loading');
    expect(resolveSharedThreadDrilldownState({ isLoading: false, isError: true, noteCount: 0 })).toBe('error');
    expect(resolveSharedThreadDrilldownState({ isLoading: false, isError: false, noteCount: 0 })).toBe('empty');
    expect(resolveSharedThreadDrilldownState({ isLoading: false, isError: false, noteCount: 2 })).toBe('ready');
  });

  it('navigates by the real note id with shared context', () => {
    const navigation = sharedThreadNoteNavigation('note_real', 'space_shared');
    expect(navigation.params).toEqual({ noteId: 'real' });
    expect(navigation.search.space).toBe('space_shared');
  });

  it('keys note loading by the real Thread id and shared space', () => {
    expect(threadNotesQueryKey('thread_real', 'shared')).toEqual([
      'thread',
      'thread_real',
      'notes',
      'space_shared',
    ]);
  });

  it('renders loaded pages and permits only one next-page request at a time', () => {
    const pageOneNote = { id: 'note_1' } as never;
    const pageTwoNote = { id: 'note_21' } as never;
    expect(flattenThreadNotePages([{ notes: [pageOneNote] }, { notes: [pageTwoNote] }])).toEqual([
      pageOneNote,
      pageTwoNote,
    ]);
    expect(nextThreadNotesOffset({ hasMore: true, offset: 0, limit: 20 })).toBe(20);
    expect(nextThreadNotesOffset({ hasMore: true, offset: 20, limit: 20 })).toBe(40);
    expect(nextThreadNotesOffset({ hasMore: false, offset: 40, limit: 20 })).toBeUndefined();
    expect(canLoadMoreThreadNotes({ hasNextPage: true, isFetchingNextPage: false })).toBe(true);
    expect(canLoadMoreThreadNotes({ hasNextPage: true, isFetchingNextPage: true })).toBe(false);
  });

  it('adapts mixed-author attribution without exposing canonical metadata', () => {
    const adapted = adaptSharedThreadNote(
      {
        id: 'note_member',
        title: 'Grace',
        content: '<p>Preview</p>',
        authorUserId: 'member_2',
        authorDisplayName: 'Sarah',
        authorColor: 'green',
        isOwnNote: false,
        contextSpaceId: 'space_shared',
        threadId: 'thread_real',
      },
      { spaceId: 'space_shared', threadId: 'thread_real' },
    );
    expect(adapted).toMatchObject({
      authorDisplayName: 'Sarah',
      authorColor: 'green',
      isOwnNote: false,
      context: { spaceId: 'space_shared', threadId: 'thread_real' },
    });
    expect(adapted).not.toHaveProperty('userId');
    expect(adapted).not.toHaveProperty('spaceId');
    expect(adaptSharedThreadNote({ id: 'note_locked', contentEncrypted: true }, {
      spaceId: 'space_shared',
      threadId: 'thread_real',
    })).toBeNull();
  });

  it('starts member compose in the visible shared target with the Thread preselected', () => {
    const begin = vi.fn(() => 4);
    expect(beginComposeInGroupThread('space_shared', 'thread_real', begin)).toBe(4);
    expect(begin).toHaveBeenCalledWith({ targetSpaceId: 'space_shared' });
    expect(getComposeGroupThreadId()).toBe('thread_real');
  });

  it('filters existing-note candidates to active authored unencrypted notes outside the Thread', () => {
    const candidates = filterCurrentThreadAttachmentCandidates(
      [
        { id: 'eligible', isOwnNote: true, contentEncrypted: false },
        { id: 'foreign', isOwnNote: false, contentEncrypted: false },
        { id: 'encrypted', isOwnNote: true, contentEncrypted: true },
        { id: 'already-attached', isOwnNote: true, contentEncrypted: false },
      ] as SpaceNoteRow[],
      ['already-attached'],
    );
    expect(candidates.map((note) => note.id)).toEqual(['eligible']);
  });

  it('attaches existing notes through authorized current-Thread sync mutations', () => {
    const request = buildAttachNotesToCurrentThreadRequest(
      {
        spaceId: 'space_shared',
        threadId: 'thread_current',
        noteIds: ['note_1', 'note_1', 'note_2'],
      },
      (noteId) => `local_${noteId}`,
    );
    expect(request.url).toBe('/api/sync/push');
    expect(request.body.mutations).toEqual([
      {
        operation: 'create',
        entityType: 'noteThread',
        entityId: 'local_note_1',
        operationId: 1,
        data: { noteId: 'note_1', threadId: 'thread_current' },
      },
      {
        operation: 'create',
        entityType: 'noteThread',
        entityId: 'local_note_2',
        operationId: 2,
        data: { noteId: 'note_2', threadId: 'thread_current' },
      },
    ]);
  });
});

describe('current Thread documentation', () => {
  it('keeps Thread creation owner-only and member visibility current-only', () => {
    const help = readFileSync(resolve(process.cwd(), 'help/using-spaces.md'), 'utf8');
    const dev = readFileSync(resolve(process.cwd(), 'docs/SHARED_SPACES_DEV_NOTES.md'), 'utf8');
    expect(help).toContain('The owner starts Threads and chooses the current Thread');
    expect(help).toContain('Members can view the current Thread');
    expect(help).not.toContain('All members can create threads');
    expect(dev).toContain('Members can view the current Thread');
    expect(dev).not.toContain('Members can view Threads and attach');
  });
});

describe('Thread picker selection', () => {
  it('clears stale selection and picks a newly current Thread', () => {
    const threads = [thread('thread_old'), thread('thread_new', true)];
    expect(validComposeThreadSelection('thread_old', threads, false)).toBeNull();
    expect(resolveComposeThreadSelection('thread_old', threads, false)).toBeNull();
    expect(resolveComposeThreadSelection(null, threads, false)).toBe('thread_new');
  });
});
