import type { NoteHistorySessionWire } from '../../hooks/queries/useNoteHistory';

export type NoteHistoryDayGroup = {
  key: string;
  label: string;
  sessions: NoteHistorySessionWire[];
};

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function noteHistoryDayLabel(date: Date, now: Date = new Date()): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (localDayKey(date) === localDayKey(now)) return 'Today';
  if (localDayKey(date) === localDayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Sessions arrive newest first; grouping keeps that order within and across days. */
export function groupNoteHistoryByDay(
  sessions: readonly NoteHistorySessionWire[],
  now: Date = new Date(),
): NoteHistoryDayGroup[] {
  const groups: NoteHistoryDayGroup[] = [];
  for (const session of sessions) {
    const ended = new Date(session.endedAt);
    const key = localDayKey(ended);
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.sessions.push(session);
    } else {
      groups.push({ key, label: noteHistoryDayLabel(ended, now), sessions: [session] });
    }
  }
  return groups;
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "2:14 PM", or "2:14 PM – 2:40 PM" when a session spans more than a minute. */
export function noteHistorySessionTimeLabel(session: Pick<NoteHistorySessionWire, 'startedAt' | 'endedAt'>): string {
  const start = new Date(session.startedAt);
  const end = new Date(session.endedAt);
  const startLabel = timeLabel(start);
  const endLabel = timeLabel(end);
  return startLabel === endLabel || end.getTime() - start.getTime() < 60_000
    ? endLabel
    : `${startLabel} – ${endLabel}`;
}

/** "Sep 3, 2026, 2:14 PM" — for confirm and toast copy, where the day may be far back. */
export function formatNoteHistoryMoment(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatNoteHistoryDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
