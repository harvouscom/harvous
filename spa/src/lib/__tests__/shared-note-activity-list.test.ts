import { describe, expect, it } from 'vitest';
import {
  buildSharedNoteActivityGroups,
  noteActivityKindLabel,
  sharedNoteAnchorsMatch,
} from '../shared-note-activity-list';
import type { NoteActivityWireGroup, NoteActivityWireItem } from '../../hooks/queries/useNoteActivity';

function item(partial: Partial<NoteActivityWireItem> & Pick<NoteActivityWireItem, 'id'>): NoteActivityWireItem {
  return {
    actorUserId: 'member_1',
    actorDisplayName: 'Member snapshot',
    actorColor: 'green',
    entryKind: 'miniNote',
    highlightAccentRaw: 'warmAmber',
    focusTitle: '',
    notesBody: '<p>My response</p>',
    miniNoteBody: '',
    anchor: {
      quote: 'hello',
      prefixContext: '',
      suffixContext: '',
      status: 'resolved',
      start: 0,
      end: 5,
      detachedAt: null,
    },
    overlapsAuthorResponseIds: [],
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: null,
    ...partial,
  };
}

function group(
  spaceId: string,
  associationStatus: NoteActivityWireGroup['associationStatus'],
  items: NoteActivityWireItem[],
): NoteActivityWireGroup {
  return {
    spaceId,
    spaceTitle: spaceId === 'space_active' ? 'Romans Group' : 'Old Group',
    associationStatus,
    items,
  };
}

describe('noteActivityKindLabel', () => {
  it('maps highlight kinds for the row header', () => {
    expect(noteActivityKindLabel('highlight')).toBe('Highlight');
    expect(noteActivityKindLabel('response')).toBe('Response');
    expect(noteActivityKindLabel('connection')).toBe('Connection');
  });
});

describe('buildSharedNoteActivityGroups', () => {
  it('preserves server group and item order with overlap context', () => {
    const groups = buildSharedNoteActivityGroups(
      [
        group('space_active', 'active', [
          item({ id: 'newer', actorUserId: 'member_2', actorDisplayName: 'Sarah' }),
          item({
            id: 'older',
            actorUserId: 'member_1',
            actorDisplayName: 'Derek C.',
            anchor: {
              quote: 'passage',
              prefixContext: '',
              suffixContext: '',
              status: 'resolved',
              start: 4,
              end: 11,
              detachedAt: null,
            },
            overlapsAuthorResponseIds: ['author_response'],
          }),
        ]),
        group('space_archived', 'archived', [item({ id: 'archived' })]),
      ],
      {
        noteAuthorUserId: 'author_1',
        noteAuthorDisplayName: 'Harvous A.',
        viewerUserId: 'member_1',
        stripHtml: () => 'My response',
      },
    );

    expect(groups.map((activityGroup) => activityGroup.spaceId)).toEqual([
      'space_active',
      'space_archived',
    ]);
    expect(groups[0]?.items.map((activityItem) => activityItem.id)).toEqual(['newer', 'older']);
    expect(groups[0]?.items[1]?.kind).toBe('response');
    expect(groups[0]?.items[1]?.isSelf).toBe(true);
    expect(groups[0]?.items[1]?.context).toBe('Harvous A. also highlighted this passage');
    expect(groups[0]?.items[1]?.preview).toBe('My response');
  });

  it('keeps the original quote while labeling detached passages', () => {
    const groups = buildSharedNoteActivityGroups(
      [
        group('space_active', 'active', [
          item({
            id: 'detached',
            anchor: {
              quote: 'remembered quote',
              prefixContext: 'before',
              suffixContext: 'after',
              status: 'detached',
              start: null,
              end: null,
              detachedAt: '2026-07-03T12:00:00.000Z',
            },
          }),
        ]),
      ],
      { stripHtml: (html) => html },
    );

    expect(groups[0]?.items[0]).toMatchObject({
      subject: 'remembered quote',
      statusLabel: 'Passage changed',
      anchor: { status: 'detached', start: null, end: null },
    });
  });
});

describe('sharedNoteAnchorsMatch', () => {
  it('matches legacy entries by their quote snapshot', () => {
    expect(
      sharedNoteAnchorsMatch(
        { id: 'a', anchorTextSnapshot: 'same text', anchorLocation: 1, anchorLength: 4 },
        { id: 'b', anchorTextSnapshot: 'same text', anchorLocation: 99, anchorLength: 4 },
      ),
    ).toBe(true);
  });
});
