import { describe, expect, it } from 'vitest';
import type { NoteDetail } from '../../queries/useNote';
import type { SpaceNoteRow } from '../../queries/useSpace';
import { buildPatchSpaceNoteOrganizationRequest } from '../usePatchSpaceNoteOrganization';
import { buildUpdateNoteBody } from '../useUpdateNote';
import { buildAddNotesToFolderOperations } from '../useAddNotesToFolder';
import { buildRemoveNoteFromFolderOperation } from '../useRemoveNoteFromFolder';
import { buildFolderTagPersistenceRequest } from '../../../pages/prototype/PrototypeFolderTagEditor';

function detail(): NoteDetail {
  return {
    id: 'note_1',
    title: 'Note',
    content: '<p>Body</p>',
    noteType: 'default',
    contentEncrypted: false,
    isPublic: false,
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    threads: [],
    tags: [],
    currentVersion: 3,
    primaryCollection: 'Canonical',
    secondaryCollections: ['Personal'],
    collectionPinned: false,
    collectionUserOverride: false,
    organization: {
      isPinned: false,
      primaryCollection: 'Shared',
      secondaryCollections: ['Community'],
      collectionPinned: true,
      order: 4,
    },
  };
}

function row(): SpaceNoteRow {
  return {
    id: 'note_1',
    title: 'Note',
    content: '<p>Body</p>',
    primaryCollection: 'Shared',
    secondaryCollections: ['Community'],
    collectionPinned: true,
  };
}

describe('inspector folder editor routing', () => {
  it('uses contextual organization and only the SpaceNotes endpoint in shared context', () => {
    const request = buildFolderTagPersistenceRequest(
      detail(),
      { primaryCollection: 'Updated', collectionUserOverride: true },
      'space_shared',
    );
    expect(request.kind).toBe('shared');
    if (request.kind !== 'shared') throw new Error('Expected shared request');

    expect(buildPatchSpaceNoteOrganizationRequest(request.input)).toEqual({
      spaceId: 'space_shared',
      url: '/api/spaces/space_shared/notes/note_1',
      body: {
        primaryCollection: 'Updated',
        secondaryCollections: ['Community'],
        collectionPinned: true,
      },
    });
    expect(request.input).not.toHaveProperty('collectionUserOverride');
    expect(request.input).not.toHaveProperty('title');
    expect(request.input).not.toHaveProperty('content');
  });

  it('keeps personal folder edits on the canonical note update', () => {
    const request = buildFolderTagPersistenceRequest(
      detail(),
      {
        primaryCollection: 'Updated',
        secondaryCollections: [],
        collectionUserOverride: true,
      },
      null,
    );
    expect(request.kind).toBe('personal');
    if (request.kind !== 'personal') throw new Error('Expected personal request');

    // No title/content: a folder edit must not carry a body. The note it was built
    // from can hold a list-truncated preview (NOTE_LIST_SELECT caps content at
    // NOTE_LIST_CONTENT_MAX_CHARS), and PUT /api/notes/update overwrites whatever
    // body it receives — so resending one silently truncated the note.
    expect(buildUpdateNoteBody(request.input, 3)).toEqual({
      noteId: 'note_1',
      primaryCollection: 'Updated',
      secondaryCollections: [],
      collectionUserOverride: true,
      expectedVersion: 3,
    });
    expect(request.input).not.toHaveProperty('title');
    expect(request.input).not.toHaveProperty('content');
  });

  it('omits title and content from the update body when they are not supplied', () => {
    expect(buildUpdateNoteBody({ noteId: 'note_1' }, 7)).toEqual({
      noteId: 'note_1',
      expectedVersion: 7,
    });
  });

  it('still sends title and content when a real save supplies them', () => {
    expect(
      buildUpdateNoteBody({ noteId: 'note_1', title: 'Note', content: '<p>Body</p>' }, 7),
    ).toEqual({
      noteId: 'note_1',
      title: 'Note',
      content: '<p>Body</p>',
      expectedVersion: 7,
    });
  });

  it('sends an explicitly emptied title rather than dropping it', () => {
    // '' is a real value the user chose; only `undefined` means "leave it alone".
    expect(buildUpdateNoteBody({ noteId: 'note_1', title: '' }, 7)).toEqual({
      noteId: 'note_1',
      title: '',
      expectedVersion: 7,
    });
  });
});

describe('bulk folder routing', () => {
  it('routes every shared add and remove through association requests', () => {
    const adds = buildAddNotesToFolderOperations({
      rows: [row(), { ...row(), id: 'note_2', primaryCollection: null }],
      folderName: 'Prayer',
      spaceId: 'space_shared',
      spaceKind: 'shared',
    });
    expect(adds).toHaveLength(2);
    expect(adds.every((operation) => operation.request.kind === 'shared')).toBe(true);
    for (const operation of adds) {
      if (operation.request.kind !== 'shared') throw new Error('Expected shared request');
      expect(
        buildPatchSpaceNoteOrganizationRequest(operation.request.input).url,
      ).toBe(`/api/spaces/space_shared/notes/${operation.row.id}`);
    }

    const removal = buildRemoveNoteFromFolderOperation({
      row: row(),
      folderName: 'Shared',
      spaceId: 'space_shared',
      spaceKind: 'shared',
    });
    expect(removal?.request.kind).toBe('shared');
    if (!removal || removal.request.kind !== 'shared') {
      throw new Error('Expected shared removal');
    }
    expect(
      buildPatchSpaceNoteOrganizationRequest(removal.request.input).url,
    ).toBe('/api/spaces/space_shared/notes/note_1');
  });

  it('keeps personal bulk add and remove on canonical note updates', () => {
    const add = buildAddNotesToFolderOperations({
      rows: [row()],
      folderName: 'Prayer',
      spaceId: 'space_home',
      spaceKind: 'personal',
    })[0];
    expect(add.request.kind).toBe('personal');
    if (add.request.kind !== 'personal') throw new Error('Expected personal add');
    expect(buildUpdateNoteBody(add.request.input, 3)).toMatchObject({
      noteId: 'note_1',
      primaryCollection: 'Shared',
      secondaryCollections: ['Community', 'Prayer'],
      expectedVersion: 3,
    });
    // `rows` come from a list payload, whose content is truncated server-side.
    expect(add.request.input).not.toHaveProperty('title');
    expect(add.request.input).not.toHaveProperty('content');

    const removal = buildRemoveNoteFromFolderOperation({
      row: row(),
      folderName: 'Shared',
      spaceId: 'space_home',
      spaceKind: 'personal',
    });
    expect(removal?.request.kind).toBe('personal');
    if (!removal || removal.request.kind !== 'personal') {
      throw new Error('Expected personal removal');
    }
    expect(buildUpdateNoteBody(removal.request.input, 3)).toMatchObject({
      noteId: 'note_1',
      primaryCollection: null,
      expectedVersion: 3,
    });
    expect(removal.request.input).not.toHaveProperty('title');
    expect(removal.request.input).not.toHaveProperty('content');
  });
});
