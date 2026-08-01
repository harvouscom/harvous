import { describe, expect, it } from 'vitest';
import {
  noteSpaceBlockedReasonLabel,
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

  it('blocks posting into a ministry broadcast channel', () => {
    const rows = resolveNoteSpaceMembershipRows({
      ...base,
      candidateSpaces: [ROMANS, CHANNEL],
    });

    expect(stateFor(rows, 'space_teaching')).toMatchObject({
      state: 'blocked',
      reason: 'channel-read-only',
    });
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
