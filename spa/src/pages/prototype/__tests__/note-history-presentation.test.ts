import { describe, expect, it } from 'vitest';
import type { NoteHistorySessionWire } from '../../../hooks/queries/useNoteHistory';
import {
  groupNoteHistoryByDay,
  noteHistoryDayLabel,
  noteHistorySessionTimeLabel,
} from '../note-history-presentation';

const NOW = new Date(2026, 8, 13, 15, 0);

function session(id: string, endedAt: Date, startedAt: Date = endedAt): NoteHistorySessionWire {
  return {
    id,
    version: 1,
    startVersion: 1,
    title: null,
    contentEncrypted: false,
    source: 'save',
    editorUserId: 'user_a',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    versionCount: 1,
    isCurrent: false,
  };
}

describe('note history presentation', () => {
  it('names today and yesterday, and dates anything older', () => {
    expect(noteHistoryDayLabel(new Date(2026, 8, 13, 1, 0), NOW)).toBe('Today');
    expect(noteHistoryDayLabel(new Date(2026, 8, 12, 23, 59), NOW)).toBe('Yesterday');
    expect(noteHistoryDayLabel(new Date(2026, 8, 3, 9, 0), NOW)).not.toMatch(/Today|Yesterday/);
  });

  it('shows the year only for another year', () => {
    expect(noteHistoryDayLabel(new Date(2025, 1, 2), NOW)).toMatch(/2025/);
    expect(noteHistoryDayLabel(new Date(2026, 1, 2), NOW)).not.toMatch(/2026/);
  });

  it('groups sessions by the day they ended, keeping newest first', () => {
    const groups = groupNoteHistoryByDay(
      [
        session('a', new Date(2026, 8, 13, 14, 0)),
        session('b', new Date(2026, 8, 13, 9, 0)),
        session('c', new Date(2026, 8, 12, 20, 0)),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.label, g.sessions.map((s) => s.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
    ]);
  });

  it('shows a range only for a session longer than a minute', () => {
    const at = new Date(2026, 8, 13, 14, 14);
    expect(noteHistorySessionTimeLabel(session('a', at))).not.toContain('–');
    expect(noteHistorySessionTimeLabel(session('b', new Date(2026, 8, 13, 14, 40), at))).toContain('–');
  });
});

describe('summarizeNoteVersionChange', () => {
  it('names the paragraphs and passages a session added and removed', async () => {
    const { summarizeNoteVersionChange } = await import('../note-history-presentation');
    const older = '<p>Ps Jared</p><p>What is worship?</p><p>Draft line</p>';
    const newer =
      '<p>Ps Jared</p><p>What is worship?</p>' +
      '<p><span data-scripture-reference="Exodus 33:1-6">Exodus 33:1-6</span></p>' +
      '<p>What other things do we put in place of God?</p>';
    const change = summarizeNoteVersionChange(older, newer);
    expect(change.added).toEqual(['Exodus 33:1-6', 'What other things do we put in place of God?']);
    expect(change.removed).toEqual(['Draft line']);
    expect(change.referencesAdded).toEqual(['Exodus 33:1-6']);
    expect(change.wordDelta).toBe(17 - 7);
  });

  it('treats the oldest version as all added', async () => {
    const { summarizeNoteVersionChange } = await import('../note-history-presentation');
    expect(summarizeNoteVersionChange(null, '<ul><li><p>One</p></li></ul>').added).toEqual(['One']);
  });
});

describe('noteHistorySessionSpan', () => {
  it('says how long a session ran', async () => {
    const { noteHistorySessionSpan } = await import('../note-history-presentation');
    const at = (m: number) => new Date(Date.UTC(2026, 9, 25, 11, m)).toISOString();
    expect(noteHistorySessionSpan({ startedAt: at(0), endedAt: at(1) })).toBe('A quick edit');
    expect(noteHistorySessionSpan({ startedAt: at(0), endedAt: at(12) })).toBe('12 min of writing');
  });
});
