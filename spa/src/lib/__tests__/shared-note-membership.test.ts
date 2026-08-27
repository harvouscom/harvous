import { describe, expect, it } from 'vitest';
import {
  noteDestinationLabel,
  noteSpaceBlockedReasonLabel,
  resolveNoteDestinationRows,
  resolveNoteSpaceMembershipRows,
} from '../shared-note-membership';

const ROMANS = { id: 'space_romans', title: 'Romans Group', type: 'shared', orgId: null };
const TUESDAY = { id: 'space_tuesday', title: 'Tuesday Study', type: 'shared', orgId: null };
const CHANNEL = { id: 'space_teaching', title: 'Teaching', type: 'public', orgId: 'org_1' };

const base = {
  candidateSpaces: [ROMANS, TUESDAY],
  associatedSpaceIds: [] as string[],
  isOwnNote: true,
  contentEncrypted: false,
};

function stateFor(rows: ReturnType<typeof resolveNoteSpaceMembershipRows>, id: string) {
  return rows.find((row) => row.space.id === id);
}

describe('resolveNoteSpaceMembershipRows', () => {
  it('marks spaces the note is already in as added, not addable', () => {
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      associatedSpaceIds: ['space_romans'],
    });

    expect(stateFor(rows, 'space_romans')?.state).toBe('added');
    expect(stateFor(rows, 'space_tuesday')?.state).toBe('addable');
  });

  it('offers an unassociated space on your own note', () => {
    const rows = resolveNoteSpaceMembershipRows(base);
    expect(rows.every((row) => row.state === 'addable')).toBe(true);
  });

  it('blocks sharing another author’s note onward', () => {
    const rows = resolveNoteSpaceMembershipRows({ ...base, isOwnNote: false });

    expect(stateFor(rows, 'space_romans')).toMatchObject({
      state: 'blocked',
      reason: 'not-author',
    });
  });

  it('blocks a locked note, mirroring the server’s LOCKED_NOTE refusal', () => {
    const rows = resolveNoteSpaceMembershipRows({ ...base, contentEncrypted: true });

    expect(stateFor(rows, 'space_romans')).toMatchObject({
      state: 'blocked',
      reason: 'locked-note',
    });
  });

  it('blocks posting into a ministry channel the viewer only follows', () => {
    // Silent until save otherwise: the row looks writable and the server refuses it.
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      candidateSpaces: [ROMANS, { ...CHANNEL, role: 'member' as const }],
    });

    expect(stateFor(rows, 'space_teaching')).toMatchObject({
      state: 'blocked',
      reason: 'channel-read-only',
    });
  });

  it('lets a channel’s leader post into it, as the server does', () => {
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      candidateSpaces: [{ ...CHANNEL, role: 'leader' as const }],
    });

    expect(stateFor(rows, 'space_teaching')?.state).toBe('addable');
  });

  it('lets a channel’s owner post into it even with no role on the nav row', () => {
    /* `NavSpace.role` is only set on memberOfSpaces. An owned channel arrives with no
       role at all, and reading that as `member` is what told a channel's own owner that
       only leaders may post. */
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      candidateSpaces: [{ ...CHANNEL, ownerId: 'user_me' }],
      viewerUserId: 'user_me',
    });

    expect(stateFor(rows, 'space_teaching')?.state).toBe('addable');
  });

  it('still reports an already-added channel as added rather than blocked', () => {
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      candidateSpaces: [CHANNEL],
      associatedSpaceIds: ['space_teaching'],
    });

    expect(stateFor(rows, 'space_teaching')?.state).toBe('added');
  });

  it('excludes the space currently being read in — it has its own Remove action', () => {
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      associatedSpaceIds: ['space_romans'],
      currentSharedSpaceId: 'space_romans',
    });

    expect(stateFor(rows, 'space_romans')).toBeUndefined();
    expect(rows).toHaveLength(1);
  });

  it('matches bare against prefixed ids so a bare association still counts as added', () => {
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      associatedSpaceIds: ['romans'],
    });

    expect(stateFor(rows, 'space_romans')?.state).toBe('added');
  });

  it('lets a space owner add a note they did not author', () => {
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      isOwnNote: false,
      isSpaceOwnerById: (id) => id === 'space_romans',
    });

    // Ownership does not bypass SAVE_COPY_REQUIRED for an unassociated foreign note —
    // the server still demands an attributed copy.
    expect(stateFor(rows, 'space_romans')?.state).toBe('blocked');
  });
});

describe('noteSpaceBlockedReasonLabel', () => {
  it('explains each refusal in the user’s terms', () => {
    expect(noteSpaceBlockedReasonLabel('locked-note')).toMatch(/Locked/);
    expect(noteSpaceBlockedReasonLabel('channel-read-only')).toMatch(/church leaders/);
    expect(noteSpaceBlockedReasonLabel('not-author')).toMatch(/attributed copy/);
  });
});

/*
  Absorbed from draft-destination-options.test.ts. The compose-time picker used to run its
  own copy of these rules; the cases that mattered there have to survive here, because this
  is the only resolver left.
*/
describe('resolveNoteDestinationRows', () => {
  const rowsFor = (over: Parameters<typeof resolveNoteDestinationRows>[0]) =>
    resolveNoteDestinationRows(over).map((row) => row.title);

  it('always offers My Home, first, and always as added', () => {
    const rows = resolveNoteDestinationRows({
      candidateSpaces: [],
      associatedSpaceIds: [],
      isOwnNote: true,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ spaceId: null, title: 'My Home', isHome: true, state: 'added' });
  });

  it('keeps My Home added even when the note is in shared spaces too', () => {
    const rows = resolveNoteDestinationRows({
      candidateSpaces: [ROMANS],
      associatedSpaceIds: ['space_romans'],
      isOwnNote: true,
    });

    expect(rows[0].state).toBe('added');
    expect(rows[1]).toMatchObject({ title: 'Romans Group', state: 'added', isHome: false });
  });

  it('never lists the home space twice', () => {
    expect(
      rowsFor({
        candidateSpaces: [{ id: 'space_home', title: 'My Home', type: 'personal', orgId: null }],
        associatedSpaceIds: [],
        isOwnNote: true,
        homeSpaceId: 'space_home',
      }),
    ).toEqual(['My Home']);
  });

  it('drops personal spaces — a personal space is that same place', () => {
    expect(
      rowsFor({
        candidateSpaces: [{ id: 'space_other', title: 'Scratch', type: 'personal', orgId: null }],
        associatedSpaceIds: [],
        isOwnNote: true,
      }),
    ).toEqual(['My Home']);
  });

  it('de-duplicates a space that appears in both nav lists', () => {
    expect(
      rowsFor({
        candidateSpaces: [ROMANS, ROMANS],
        associatedSpaceIds: [],
        isOwnNote: true,
      }),
    ).toEqual(['My Home', 'Romans Group']);
  });

  it('never offers a channel the viewer only follows', () => {
    const rows = resolveNoteDestinationRows({
      candidateSpaces: [{ ...CHANNEL, role: 'member' as const }],
      associatedSpaceIds: [],
      isOwnNote: true,
    });

    expect(rows[1]).toMatchObject({ state: 'blocked', reason: 'channel-read-only' });
  });

  it('does offer a channel the viewer leads', () => {
    const rows = resolveNoteDestinationRows({
      candidateSpaces: [{ ...CHANNEL, role: 'leader' as const }],
      associatedSpaceIds: [],
      isOwnNote: true,
    });

    expect(rows[1].state).toBe('addable');
  });

  it('normalizes a bare id so it matches what the shell stores', () => {
    const rows = resolveNoteDestinationRows({
      candidateSpaces: [{ id: '1785269710187', title: 'Family', type: 'shared', orgId: null }],
      associatedSpaceIds: [],
      isOwnNote: true,
    });

    expect(rows[1].spaceId).toBe('space_1785269710187');
  });

  it('lists the space being read in, rather than hiding it as the old menu did', () => {
    // The row is the place you *see* where a note lives, so the current space must appear.
    const rows = resolveNoteDestinationRows({
      candidateSpaces: [ROMANS],
      associatedSpaceIds: ['space_romans'],
      isOwnNote: true,
    });

    expect(rows.map((row) => row.title)).toEqual(['My Home', 'Romans Group']);
  });
});

describe('noteDestinationLabel', () => {
  const row = (title: string, state = 'added') => ({ title, state, isHome: title === 'My Home' });

  it('reads "In My Home" for a note that is nowhere else', () => {
    expect(noteDestinationLabel([row('My Home')])).toBe('In My Home');
  });

  it('names both when there are two', () => {
    expect(noteDestinationLabel([row('My Home'), row('Romans Group')])).toBe(
      'In My Home, Romans Group',
    );
  });

  it('collapses past two into a count', () => {
    expect(
      noteDestinationLabel([
        row('My Home'),
        row('Romans Group'),
        row('Tuesday Study'),
        row('Youth'),
      ]),
    ).toBe('In My Home, Romans Group + 2 more');
  });

  it('ignores rows the note is not actually in', () => {
    expect(noteDestinationLabel([row('My Home'), row('Romans Group', 'addable')])).toBe(
      'In My Home',
    );
  });
});
