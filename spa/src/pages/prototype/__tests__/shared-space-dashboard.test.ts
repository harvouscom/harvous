import { describe, expect, it } from 'vitest';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import {
  buildContributorIntro,
  buildSharedSpaceNoteCardSlots,
  buildSharedSpaceSocialIntro,
  groupSharedSpaceNoteCardSlots,
  isNoteUnseenSinceVisit,
  sharedThreadNoteCountPreview,
} from '../shared-space-dashboard';
import { sharedSpaceDashboardHasError } from '../PrototypeSidebarSharedSpaceView';

function note(
  id: string,
  overrides: Partial<SpaceNoteRow> & { updatedAt?: string; authorUserId?: string; isOwnNote?: boolean } = {},
): SpaceNoteRow {
  return {
    id,
    title: `Note ${id}`,
    updatedAt: overrides.updatedAt ?? '2026-07-05T12:00:00.000Z',
    ...overrides,
  };
}

describe('shared-space-dashboard', () => {
  it('treats every required dashboard query failure as an explicit error', () => {
    const healthy = {
      space: false,
      members: false,
      activity: false,
      notes: false,
      currentThread: false,
      scriptureIndex: false,
    };
    expect(sharedSpaceDashboardHasError(healthy)).toBe(false);
    for (const key of Object.keys(healthy) as Array<keyof typeof healthy>) {
      expect(sharedSpaceDashboardHasError({ ...healthy, [key]: true })).toBe(true);
    }
  });

  it('isNoteUnseenSinceVisit compares against watermark', () => {
    expect(isNoteUnseenSinceVisit(note('a', { updatedAt: '2026-07-05T13:00:00.000Z' }), '2026-07-05T12:00:00.000Z')).toBe(
      true,
    );
    expect(isNoteUnseenSinceVisit(note('a', { updatedAt: '2026-07-05T11:00:00.000Z' }), '2026-07-05T12:00:00.000Z')).toBe(
      false,
    );
  });

  it('buildSharedSpaceSocialIntro aggregates contributors from sample notes', () => {
    expect(
      buildSharedSpaceSocialIntro({
        sampleNotes: [
          note('a', { authorUserId: 'u2', authorDisplayName: 'Sarah', isOwnNote: false }),
          note('b', { authorUserId: 'u1', isOwnNote: true }),
          note('c', { authorUserId: 'u1', isOwnNote: true }),
        ],
        authUserId: 'u1',
        totalNoteCount: 3,
        hasMoreNotes: false,
      }),
    ).toMatchObject({
      ownRecentCount: 2,
      totalNoteCount: 3,
      otherContributors: [{ displayName: 'Sarah', noteCount: 1 }],
    });

    expect(
      buildSharedSpaceSocialIntro({
        sampleNotes: [note('a', { authorUserId: 'u1', isOwnNote: true })],
        authUserId: 'u1',
        totalNoteCount: 1,
        hasMoreNotes: false,
      }),
    ).toBeNull();
  });

  it('buildContributorIntro surfaces other and joint activity', () => {
    expect(
      buildContributorIntro(
        [
          note('a', { authorUserId: 'u2', authorDisplayName: 'Sarah', isOwnNote: false }),
          note('b', { authorUserId: 'u1', isOwnNote: true }),
        ],
        'u1',
      ),
    ).toEqual({ otherDisplayName: 'Sarah', ownCount: 1, otherCount: 1 });

    expect(buildContributorIntro([note('a', { authorUserId: 'u1', isOwnNote: true })], 'u1')).toBeNull();
  });

  it('buildSharedSpaceNoteCardSlots prioritizes new-from-others then continue', () => {
    const unseenSince = '2026-07-05T10:00:00.000Z';
    const slots = buildSharedSpaceNoteCardSlots({
      recentNotes: [
        note('other-new', {
          authorUserId: 'u2',
          isOwnNote: false,
          updatedAt: '2026-07-05T13:00:00.000Z',
        }),
        note('mine-recent', {
          authorUserId: 'u1',
          isOwnNote: true,
          updatedAt: '2026-07-05T12:30:00.000Z',
        }),
      ],
      notesForContinue: [
        note('continue', {
          authorUserId: 'u1',
          isOwnNote: true,
          updatedAt: '2026-07-05T14:00:00.000Z',
        }),
        note('other-new', {
          authorUserId: 'u2',
          isOwnNote: false,
          updatedAt: '2026-07-05T13:00:00.000Z',
        }),
      ],
      unseenSince,
      authUserId: 'u1',
    });

    expect(slots.map((s) => s.kind)).toEqual(['new-from-others', 'continue', 'recent']);
    expect(slots.map((s) => s.note.id)).toEqual(['other-new', 'continue', 'mine-recent']);
  });

  it('buildSharedSpaceNoteCardSlots offers no card for a note deleted this session', () => {
    const slots = buildSharedSpaceNoteCardSlots({
      recentNotes: [
        note('gone', { authorUserId: 'u1', isOwnNote: true, updatedAt: '2026-07-05T14:00:00.000Z' }),
        note('kept', { authorUserId: 'u1', isOwnNote: true, updatedAt: '2026-07-05T12:00:00.000Z' }),
      ],
      notesForContinue: [
        note('gone', { authorUserId: 'u1', isOwnNote: true, updatedAt: '2026-07-05T14:00:00.000Z' }),
        note('kept', { authorUserId: 'u1', isOwnNote: true, updatedAt: '2026-07-05T12:00:00.000Z' }),
      ],
      unseenSince: null,
      authUserId: 'u1',
      deletedNoteIds: ['gone'],
    });

    // 'gone' would otherwise be both the continue card and the first recent one.
    expect(slots.map((s) => s.note.id)).toEqual(['kept']);
  });

  it('groupSharedSpaceNoteCardSlots merges consecutive matching eyebrows', () => {
    const slots = [
      { note: note('a'), eyebrow: 'Recently updated', kind: 'recent' as const },
      { note: note('b'), eyebrow: 'Recently updated', kind: 'recent' as const },
      { note: note('c'), eyebrow: 'Pick up where you left off', kind: 'continue' as const },
    ];
    expect(groupSharedSpaceNoteCardSlots(slots)).toEqual([
      { eyebrow: 'Recently updated', slots: [slots[0], slots[1]] },
      { eyebrow: 'Pick up where you left off', slots: [slots[2]] },
    ]);
  });

  it('sharedThreadNoteCountPreview uses empty-state copy for zero notes', () => {
    expect(sharedThreadNoteCountPreview(0)).toBe('No notes yet');
    expect(sharedThreadNoteCountPreview(1)).toBe('1 note');
    expect(sharedThreadNoteCountPreview(5)).toBe('5 notes');
  });
});
