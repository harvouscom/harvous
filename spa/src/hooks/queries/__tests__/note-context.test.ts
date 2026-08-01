import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api';
import {
  getNoteQueryOptions,
  shouldUseNoteOnlyParentThreadCache,
} from '../useNote';
import { getNoteActivityQueryOptions } from '../useNoteActivity';

vi.mock('../../../lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

const mockedGet = vi.mocked(api.get);

describe('contextual note queries', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    localStorage.clear();
  });

  it('keeps My Home on the prefix key and adds shared context to details', async () => {
    mockedGet.mockResolvedValue({
      success: true,
      note: {
        id: 'note_1',
        title: 'Note',
        content: '<p>Body</p>',
        noteType: 'default',
        contentEncrypted: false,
        isPublic: false,
        createdAt: '2026-07-09T12:00:00.000Z',
        updatedAt: '2026-07-09T12:00:00.000Z',
      },
      threads: [
        {
          id: 'thread_shared',
          title: 'Shared Thread',
          color: null,
        },
      ],
      activeSharedAssociations: [
        { spaceId: 'space_shared', spaceTitle: 'Romans Study', spaceType: 'shared' },
        { spaceId: 'space_other', spaceTitle: 'Sunday Group', spaceType: 'shared' },
      ],
    });

    expect(getNoteQueryOptions('note_1').queryKey).toEqual(['note', 'note_1']);
    localStorage.setItem('harvous-note-thread-note_1', 'thread_home');
    const shared = getNoteQueryOptions('note_1', 'space_shared');
    expect(shared.queryKey).toEqual(['note', 'note_1', 'space_shared']);
    const detail = await shared.queryFn();
    expect(mockedGet).toHaveBeenCalledWith(
      '/api/notes/note_1/details?contextSpaceId=space_shared',
    );
    expect(shouldUseNoteOnlyParentThreadCache('space_shared')).toBe(false);
    expect(localStorage.getItem('harvous-note-thread-note_1')).toBe('thread_home');
    expect(detail.spaces).toEqual([
      { id: 'space_shared', title: 'Romans Study', coEditEnabled: false, spaceType: 'shared' },
      { id: 'space_other', title: 'Sunday Group', coEditEnabled: false, spaceType: 'shared' },
    ]);
  });

  it('adds shared context only when requesting grouped Activity', async () => {
    mockedGet.mockResolvedValue({ success: true, contextSpaceId: 'space_shared', groups: [] });

    const home = getNoteActivityQueryOptions('note_1');
    expect(home.queryKey).toEqual(['noteActivity', 'note_1', null]);
    await home.queryFn();
    expect(mockedGet).toHaveBeenLastCalledWith('/api/notes/note_1/activity');

    const shared = getNoteActivityQueryOptions('note_1', 'space_shared');
    expect(shared.queryKey).toEqual(['noteActivity', 'note_1', 'space_shared']);
    await shared.queryFn();
    expect(mockedGet).toHaveBeenLastCalledWith(
      '/api/notes/note_1/activity?contextSpaceId=space_shared',
    );
  });
});
