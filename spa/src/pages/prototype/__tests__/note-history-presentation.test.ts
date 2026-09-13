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
