import { describe, expect, it } from 'vitest';
import {
  buildSharedNoteActivity,
  type SharedNoteActivityEntry,
} from '../shared-note-activity';

const createdAt = new Date('2026-07-09T12:00:00Z');

function entry(
  id: string,
  userId: string,
  spaceId: string,
  start: number | null,
  end: number | null,
  overrides: Partial<SharedNoteActivityEntry> = {},
): SharedNoteActivityEntry {
  return {
    id,
    userId,
    parentNoteId: 'note_1',
    spaceId,
    entryKindRaw: 'miniNote',
    highlightAccentRaw: 'warmAmber',
    focusTitle: '',
    notesBody: '<p>Response</p>',
    miniNoteBody: '',
    anchorQuote: 'grace',
    anchorPrefixContext: '',
    anchorSuffixContext: '',
    anchorStatus: 'resolved',
    resolvedAnchorStart: start,
    resolvedAnchorEnd: end,
    anchorDetachedAt: null,
    actorDisplayNameSnapshot: null,
    createdAt,
    updatedAt: null,
    ...overrides,
  };
}

describe('shared note activity', () => {
  const associations = [
    { spaceId: 'space_active', removedAt: null },
    { spaceId: 'space_archived', removedAt: new Date('2026-07-08T00:00:00Z') },
  ];
  const spaces = [
    { id: 'space_active', title: 'Romans Group', type: 'shared' },
    { id: 'space_archived', title: 'Old Group', type: 'shared' },
  ];

  it('groups Home activity by active and archived association', () => {
    const groups = buildSharedNoteActivity({
      noteId: 'note_1',
      noteAuthorId: 'user_author',
      contextSpaceId: null,
      associations,
      spaces,
      entries: [
        entry('activity_1', 'user_member', 'space_active', 2, 7),
        entry('activity_2', 'user_former', 'space_archived', 10, 15, {
          actorDisplayNameSnapshot: 'Former Ruth',
        }),
      ],
      authors: {
        user_member: {
          displayName: 'Paul P.',
          userColor: 'green',
          firstName: 'Paul',
          profileImageUrl: 'https://img.example/paul.png',
        },
      },
    });
    expect(groups.map((group) => [group.spaceId, group.associationStatus])).toEqual([
      ['space_active', 'active'],
      ['space_archived', 'archived'],
    ]);
    expect(groups[0]?.items[0]).toMatchObject({
      actorFirstName: 'Paul',
      actorProfileImageUrl: 'https://img.example/paul.png',
    });
    expect(groups[1]?.items[0]?.actorDisplayName).toBe('Former Ruth');
    expect(groups[1]?.items[0]).toMatchObject({
      actorFirstName: null,
      actorProfileImageUrl: null,
    });
  });

  it('isolates a shared context to its active association', () => {
    const groups = buildSharedNoteActivity({
      noteId: 'note_1',
      noteAuthorId: 'user_author',
      contextSpaceId: 'space_active',
      associations,
      spaces,
      entries: [
        entry('activity_1', 'user_member', 'space_active', 2, 7),
        entry('activity_2', 'user_other', 'space_archived', 10, 15),
      ],
      authors: {},
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.spaceId).toBe('space_active');
  });

  it('excludes author responses while preserving overlap identifiers', () => {
    const groups = buildSharedNoteActivity({
      noteId: 'note_1',
      noteAuthorId: 'user_author',
      contextSpaceId: 'space_active',
      associations,
      spaces,
      entries: [
        entry('author_response', 'user_author', 'space_active', 4, 9),
        entry('member_response', 'user_member', 'space_active', 2, 7),
      ],
      authors: {},
    });
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['member_response']);
    expect(groups[0]?.items[0]?.overlapsAuthorResponseIds).toEqual(['author_response']);
  });

  it('returns detached quote and status without historical note content', () => {
    const groups = buildSharedNoteActivity({
      noteId: 'note_1',
      noteAuthorId: 'user_author',
      contextSpaceId: 'space_active',
      associations,
      spaces,
      entries: [
        entry('detached', 'user_member', 'space_active', null, null, {
          anchorQuote: 'remembered quote',
          anchorStatus: 'detached',
          anchorDetachedAt: createdAt,
        }),
      ],
      authors: {},
    });
    expect(groups[0]?.items[0]?.anchor).toMatchObject({
      quote: 'remembered quote',
      status: 'detached',
      detachedAt: createdAt,
    });
    expect(groups[0]?.items[0]).not.toHaveProperty('noteContent');
  });
});
