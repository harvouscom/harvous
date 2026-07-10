import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, APIError } from '../../../lib/api';
import { buildCreateHighlightRequest } from '../useCreateHighlight';
import {
  buildUpdateNoteBody,
  getCurrentCachedNoteVersion,
  MissingExpectedNoteVersionError,
  requireExpectedNoteVersion,
  rollbackFailedNoteUpdate,
  setContextualNoteData,
} from '../useUpdateNote';
import { buildUpdateHighlightRequest } from '../useUpdateHighlight';
import {
  seedNoteFromCreateResponse,
  type NoteDetail,
} from '../../queries/useNote';
import {
  buildPatchSpaceNoteOrganizationRequest,
  patchContextualNoteOrganization,
  spaceNoteOrganizationPatchFromCollectionExtras,
} from '../usePatchSpaceNoteOrganization';

function note(id: string, title: string, currentVersion: number): NoteDetail {
  return {
    id,
    title,
    content: '<p>Body</p>',
    noteType: 'default',
    contentEncrypted: false,
    isPublic: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    threads: [],
    tags: [],
    currentVersion,
  };
}

describe('contextual note mutation caches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates every note detail cache under the note prefix', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['note', 'note_1'], note('note_1', 'Home', 4));
    queryClient.setQueryData(
      ['note', 'note_1', 'space_shared'],
      note('note_1', 'Shared', 5),
    );
    queryClient.setQueryData(['note', 'note_2'], note('note_2', 'Other', 2));

    expect(getCurrentCachedNoteVersion(queryClient, 'note_1')).toBe(5);
    expect(
      buildUpdateNoteBody(
        { noteId: 'note_1', title: 'Updated', content: '<p>Updated</p>' },
        getCurrentCachedNoteVersion(queryClient, 'note_1'),
      ),
    ).toMatchObject({ expectedVersion: 5 });
    setContextualNoteData(queryClient, 'note_1', (cached) => ({
      ...cached,
      title: 'Updated',
      currentVersion: 6,
    }));

    expect(queryClient.getQueryData<NoteDetail>(['note', 'note_1'])?.title).toBe('Updated');
    expect(
      queryClient.getQueryData<NoteDetail>(['note', 'note_1', 'space_shared'])
        ?.currentVersion,
    ).toBe(6);
    expect(queryClient.getQueryData<NoteDetail>(['note', 'note_2'])?.title).toBe('Other');
  });

  it('seeds create version for an immediate fail-closed update', async () => {
    const queryClient = new QueryClient();
    const getSpy = vi.spyOn(api, 'get');
    seedNoteFromCreateResponse(
      queryClient,
      {
        id: 'note_created',
        title: 'Created',
        content: '<p>Created</p>',
        noteType: 'default',
      },
      'space_home',
      { currentVersion: 1, currentVersionId: 'version_1' },
    );

    const expectedVersion = await requireExpectedNoteVersion(
      queryClient,
      'note_created',
    );
    expect(expectedVersion).toBe(1);
    expect(getSpy).not.toHaveBeenCalled();
    expect(
      buildUpdateNoteBody(
        {
          noteId: 'note_created',
          title: 'Updated immediately',
          content: '<p>Updated</p>',
        },
        expectedVersion,
      ),
    ).toMatchObject({ expectedVersion: 1 });
  });

  it('seeds shared creates only under their contextual detail key', () => {
    const queryClient = new QueryClient();
    seedNoteFromCreateResponse(
      queryClient,
      {
        id: 'note_shared_created',
        title: 'Created in shared',
        content: '<p>Created</p>',
        noteType: 'default',
      },
      'space_shared',
      {
        currentVersion: 1,
        currentVersionId: 'version_shared_1',
        contextSpaceId: 'space_shared',
      },
    );

    expect(
      queryClient.getQueryData<NoteDetail>([
        'note',
        'note_shared_created',
        'space_shared',
      ])?.currentVersion,
    ).toBe(1);
    expect(
      queryClient.getQueryData(['note', 'note_shared_created']),
    ).toBeUndefined();
  });

  it('fetches authoritative contextual detail when cache has no version', async () => {
    const queryClient = new QueryClient();
    vi.spyOn(api, 'get').mockResolvedValue({
      success: true,
      note: {
        id: 'note_1',
        title: 'Shared',
        content: '<p>Body</p>',
        noteType: 'default',
        contentEncrypted: false,
        isPublic: false,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      threads: [],
      context: {
        spaceId: 'space_shared',
        title: 'Shared',
        type: 'group',
        isShared: true,
      },
      currentVersion: { version: 7 },
    });

    await expect(
      requireExpectedNoteVersion(queryClient, 'note_1', 'space_shared'),
    ).resolves.toBe(7);
    expect(api.get).toHaveBeenCalledWith(
      '/api/notes/note_1/details?contextSpaceId=space_shared',
    );
  });

  it('fails closed when authoritative detail still has no version', async () => {
    const queryClient = new QueryClient();
    vi.spyOn(api, 'get').mockResolvedValue({
      success: true,
      note: {
        id: 'note_1',
        title: 'Shared',
        content: '<p>Body</p>',
        noteType: 'default',
        contentEncrypted: false,
        isPublic: false,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      threads: [],
      currentVersion: null,
    });

    await expect(
      requireExpectedNoteVersion(queryClient, 'note_1', 'space_shared'),
    ).rejects.toBeInstanceOf(MissingExpectedNoteVersionError);
  });

  it('restores optimistic caches and refetches every context after a conflict', async () => {
    const queryClient = new QueryClient();
    const previous = note('note_1', 'Before', 3);
    queryClient.setQueryData(['note', 'note_1'], {
      ...previous,
      title: 'Optimistic',
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    await rollbackFailedNoteUpdate(
      queryClient,
      new APIError(409, 'Version conflict', 'VERSION_CONFLICT'),
      'note_1',
      { previousNotes: [[['note', 'note_1'], previous]] },
    );

    expect(queryClient.getQueryData<NoteDetail>(['note', 'note_1'])?.title).toBe(
      'Before',
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['note', 'note_1'],
      refetchType: 'all',
    });
  });
});

describe('shared organization mutation contract', () => {
  it('keeps shared organization fields off the canonical note body', () => {
    expect(
      buildUpdateNoteBody(
        {
          noteId: 'note_1',
          title: 'Canonical',
          content: '<p>Body</p>',
          contextSpaceId: 'space_shared',
          primaryCollection: 'Prayer',
          secondaryCollections: ['Grace'],
          collectionPinned: true,
          collectionUserOverride: true,
        },
        4,
      ),
    ).toEqual({
      noteId: 'note_1',
      title: 'Canonical',
      content: '<p>Body</p>',
      expectedVersion: 4,
    });
  });

  it('targets only the SpaceNotes organization endpoint and contextual cache', () => {
    const patch = spaceNoteOrganizationPatchFromCollectionExtras({
      primaryCollection: 'Prayer',
      secondaryCollections: ['Grace'],
      collectionPinned: true,
      collectionUserOverride: true,
    });
    expect(
      buildPatchSpaceNoteOrganizationRequest({
        noteId: 'note_1',
        spaceId: 'shared',
        ...patch,
      }),
    ).toEqual({
      spaceId: 'space_shared',
      url: '/api/spaces/space_shared/notes/note_1',
      body: {
        primaryCollection: 'Prayer',
        secondaryCollections: ['Grace'],
        collectionPinned: true,
      },
    });
    const patched = patchContextualNoteOrganization(
      note('note_1', 'Shared', 4),
      patch,
    );
    expect(patched.primaryCollection).toBe('Prayer');
    expect(patched.organization?.secondaryCollections).toEqual(['Grace']);
  });
});

describe('highlight context mutation payloads', () => {
  it('omits context for My Home and includes explicit shared context', () => {
    expect(
      buildCreateHighlightRequest({
        parentNoteId: 'note_1',
        spaceId: 'space_home',
        sourceSnippet: 'Home',
      }).body,
    ).toEqual({ entryKind: 'miniNote', sourceSnippet: 'Home' });

    expect(
      buildCreateHighlightRequest({
        parentNoteId: 'note_1',
        spaceId: 'space_shared',
        contextSpaceId: 'space_shared',
        sourceSnippet: 'Shared',
      }).body,
    ).toEqual({
      entryKind: 'miniNote',
      sourceSnippet: 'Shared',
      contextSpaceId: 'space_shared',
    });

    expect(
      buildUpdateHighlightRequest({
        id: 'study_1',
        spaceId: 'space_shared',
        contextSpaceId: 'space_shared',
        parentNoteId: 'note_1',
        miniNoteBody: 'Response',
      }),
    ).toEqual({
      url: '/api/study-threads/study_1',
      body: {
        miniNoteBody: 'Response',
        contextSpaceId: 'space_shared',
      },
    });
  });
});
